import { DurableObject } from "cloudflare:workers";
import {
  INK_CAPACITY,
  ROOM_NAME,
  clamp,
  clampArtifactPosition,
  mayCreateObject,
  normalizeDisplayName,
  normalizeMutationId,
  normalizeNote,
  normalizePoint,
  normalizeStroke,
  normalizeToken,
  refillInk,
  spendInk,
  strokeInkCost,
  type InkState,
  type Point,
} from "./domain";
import type { Env } from "./env";

type ArtifactKind = "drawing" | "note" | "object";
type Lifecycle = "active" | "archiving" | "quarantined" | "archiving_quarantined";

interface ArtifactRow {
  id: string;
  kind: ArtifactKind;
  creator_token: string;
  created_at: number;
  updated_at: number;
  revision: number;
  z_index: number;
  lifecycle: Lifecycle;
  payload: string;
}

interface Artifact {
  id: string;
  kind: ArtifactKind;
  creatorToken: string;
  createdAt: number;
  updatedAt: number;
  revision: number;
  zIndex: number;
  lifecycle: Lifecycle;
  payload: Record<string, unknown>;
}

interface FixtureRow {
  id: string;
  state: string;
  revision: number;
  updated_at: number;
}

interface QuotaRow {
  ink_balance: number;
  ink_updated_at: number;
  last_note_at: number | null;
  last_object_at: number | null;
  rate_window_at: number;
  rate_count: number;
}

interface ArchiveReportRow {
  id: string;
  artifact_id: string;
  reporter_token: string;
  reason: string;
  created_at: number;
}

interface SessionAttachment {
  visitorToken: string;
  creatorRef: string;
  displayName: string;
  presenceId: string;
  actorKey: string | null;
  joinedAt: number;
  frameLeaseRemaining?: number;
}

interface ClientMessage {
  type?: unknown;
  mutationId?: unknown;
  payload?: unknown;
}

interface ProcessedMutation {
  result: Record<string, unknown>;
  replayed: boolean;
}

interface CursorRate {
  windowAt: number;
  count: number;
}

const COLORS = new Set(["chalk", "rust", "moss", "sky", "gold"]);
const OBJECT_SHAPES = new Set(["crate", "lamp", "stool", "plant"]);
const OBJECT_DETAILS = new Set(["plain", "star", "stripe", "eye"]);
const MAX_ACTIVE_ARTIFACTS = 1500;
const MAX_PENDING_ARTIFACTS = 1600;
const ARCHIVE_AFTER_MS = 90 * 24 * 60 * 60 * 1000;
const NOTE_COOLDOWN_MS = 30_000;
const RATE_WINDOW_MS = 10_000;
const RATE_LIMIT = 80;
const ROOM_RATE_LIMIT = 300;
const ROOM_DAILY_MUTATION_LIMIT = 4000;
const ROOM_DAILY_ARTIFACT_LIMIT = 500;
const ACTOR_DAILY_MUTATION_LIMIT = 400;
const MUTATION_RECEIPT_MS = 7 * 24 * 60 * 60 * 1000;
const MUTATION_TOMBSTONE_MS = 30 * 24 * 60 * 60 * 1000;
const VISITOR_RETENTION_MS = 400 * 24 * 60 * 60 * 1000;
const SESSION_RATE_WINDOW_MS = 60_000;
const SESSION_RATE_LIMIT = 120;
const SESSION_DAILY_LIMIT = 1000;
const ROOM_DAILY_SESSION_REQUEST_LIMIT = 2500;
const SESSION_RESERVE_THRESHOLD = 900;
const ACTOR_DAILY_SESSION_LIMIT = 100;
const ACTOR_WS_MINUTE_LIMIT = 30;
const ACTOR_DAILY_WS_LIMIT = 200;
const ROOM_DAILY_WS_LIMIT = 2500;
const ROOM_WS_RESERVE_THRESHOLD = 2000;
const FRAME_LEASE_SIZE = 100;
const ACTOR_DAILY_FRAME_LIMIT = 80_000;
const ROOM_DAILY_FRAME_LIMIT = 1_500_000;
const ROOM_DAILY_READ_LIMIT = 10_000;
const CURSOR_RATE_WINDOW_MS = 1000;
const CURSOR_RATE_LIMIT = 12;
const EPHEMERAL_ABUSE_LIMIT = 24;
const FRAME_RATE_LIMIT = 60;
const ACTOR_FRAME_RATE_LIMIT = 60;
const ACTOR_MUTATION_RATE_LIMIT = 60;
const INVALID_FRAME_WINDOW_LIMIT = 5;
const ACTOR_DAILY_INVALID_FRAME_LIMIT = 20;
const REJECTED_MUTATION_WINDOW_LIMIT = 5;
const CURSOR_BATCH_MS = 100;
const MAX_CONNECTIONS = 64;
const MAX_CONNECTIONS_PER_VISITOR = 3;
const MAX_CONNECTIONS_PER_ACTOR = 16;
const MAX_REPORTS_PER_ARTIFACT = 20;
const MAX_MESSAGE_BYTES = 32_000;
const LIGHT_COOLDOWN_MS = 1500;
const MAINTENANCE_INTERVAL_MS = 4 * 60 * 60 * 1000;
const MAINTENANCE_BATCH_SIZE = 1000;
const DATABASE_MIGRATION_VERSION = "2";
const NAME_FIRST = ["DUSTY", "SLEEPY", "TIN", "MOSSY", "QUIET", "ODD", "LATE", "LITTLE"];
const NAME_SECOND = ["PIGEON", "LAMP", "MOTH", "KETTLE", "CHAIR", "FERN", "SPOON", "WINDOW"];
const MUTATION_TYPES = new Set([
  "drawing.create",
  "note.create",
  "object.create",
  "artifact.move",
  "fixture.toggle",
  "report.create",
]);
const RATE_REJECTION_CODES = new Set(["ACTOR_RESTING", "SLOW_DOWN", "ROOM_RESTING", "ROOM_BUSY"]);

export class Room extends DurableObject<Env> {
  private readonly state: DurableObjectState;
  private readonly environment: Env;
  private readonly cursorRates = new Map<string, CursorRate>();
  private readonly frameRates = new Map<string, CursorRate>();
  private readonly actorFrameRates = new Map<string, CursorRate>();
  private readonly actorMutationRates = new Map<string, CursorRate>();
  private readonly invalidFrameRates = new Map<string, CursorRate>();
  private readonly rejectedMutationRates = new Map<string, CursorRate>();
  private readonly pendingCursors = new Map<string, Record<string, unknown>>();
  private readonly pendingDrawingPreviews = new Map<string, Record<string, unknown>>();
  private readonly activeDrawingPreviews = new Set<string>();
  private cursorFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private drawingPreviewFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private compactionScheduled = false;

  constructor(state: DurableObjectState, environment: Env) {
    super(state, environment);
    this.state = state;
    this.environment = environment;
    state.blockConcurrencyWhile(async () => {
      this.initializeDatabase();
      const maintenanceStatus = this.state.storage.sql
        .exec("SELECT value FROM runtime_status WHERE id = 'maintenance'")
        .toArray()[0] as { value: string } | undefined;
      if (!maintenanceStatus) {
        try {
          this.compactMutationReceipts(Date.now());
          this.writeRuntimeStatus("maintenance", "ok");
        } catch {
          this.writeRuntimeStatus("maintenance", "failed");
        }
      }
      const incompleteArchive = this.state.storage.sql
        .exec("SELECT COUNT(*) AS count FROM artifacts WHERE lifecycle IN ('archiving', 'archiving_quarantined')")
        .toArray()[0] as { count: number };
      if (incompleteArchive.count > 0) {
        await state.storage.setAlarm(Date.now() + 100);
      } else if ((await state.storage.getAlarm()) === null) {
        await state.storage.setAlarm(Date.now() + MAINTENANCE_INTERVAL_MS);
      }
    });
  }

  private initializeDatabase(): void {
    this.state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        creator_token TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        revision INTEGER NOT NULL,
        z_index INTEGER NOT NULL DEFAULT 0,
        lifecycle TEXT NOT NULL DEFAULT 'active',
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS artifacts_lifecycle_created
        ON artifacts (lifecycle, created_at);
      CREATE INDEX IF NOT EXISTS artifacts_lifecycle_updated
        ON artifacts (lifecycle, updated_at, id);

      CREATE TABLE IF NOT EXISTS visitors (
        visitor_token TEXT PRIMARY KEY,
        visitor_ref TEXT NOT NULL,
        display_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS visitors_last_seen
        ON visitors (last_seen_at, visitor_token);

      CREATE TABLE IF NOT EXISTS fixtures (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        revision INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS quotas (
        visitor_token TEXT PRIMARY KEY,
        ink_balance REAL NOT NULL,
        ink_updated_at INTEGER NOT NULL,
        last_note_at INTEGER,
        last_object_at INTEGER,
        rate_window_at INTEGER NOT NULL,
        rate_count INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mutations (
        id TEXT PRIMARY KEY,
        visitor_token TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        result TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS mutations_created ON mutations (created_at);

      CREATE TABLE IF NOT EXISTS mutation_tombstones (
        id TEXT PRIMARY KEY,
        visitor_token TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS mutation_tombstones_expires
        ON mutation_tombstones (expires_at);

      CREATE TABLE IF NOT EXISTS room_limits (
        id TEXT PRIMARY KEY,
        window_at INTEGER NOT NULL,
        mutation_count INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS room_sequences (
        id TEXT PRIMARY KEY,
        value INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS actor_limits (
        kind TEXT NOT NULL,
        actor_key TEXT NOT NULL,
        window_at INTEGER NOT NULL,
        attempt_count INTEGER NOT NULL,
        PRIMARY KEY (kind, actor_key)
      );
      CREATE INDEX IF NOT EXISTS actor_limits_window
        ON actor_limits (window_at);

      CREATE TABLE IF NOT EXISTS runtime_status (
        id TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        reporter_token TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS reports_artifact_reporter
        ON reports (artifact_id, reporter_token);

      CREATE TABLE IF NOT EXISTS moderation_audit (
        id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        prior_lifecycle TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS archive_index (
        id TEXT PRIMARY KEY,
        object_key TEXT NOT NULL,
        artifact_count INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    const migration = this.state.storage.sql
      .exec("SELECT value FROM runtime_status WHERE id = 'schema-version'")
      .toArray()[0] as { value: string } | undefined;
    if (migration?.value !== DATABASE_MIGRATION_VERSION) {
      const artifactColumns = this.state.storage.sql
        .exec("PRAGMA table_info(artifacts)")
        .toArray() as unknown as Array<{ name: string }>;
      if (!artifactColumns.some((column) => column.name === "z_index")) {
        this.state.storage.sql.exec("ALTER TABLE artifacts ADD COLUMN z_index INTEGER NOT NULL DEFAULT 0");
        this.state.storage.sql.exec("UPDATE artifacts SET z_index = created_at WHERE z_index = 0");
      }

      const visitorColumns = this.state.storage.sql
        .exec("PRAGMA table_info(visitors)")
        .toArray() as unknown as Array<{ name: string }>;
      if (!visitorColumns.some((column) => column.name === "visitor_ref")) {
        this.state.storage.sql.exec("ALTER TABLE visitors ADD COLUMN visitor_ref TEXT");
      }
      this.state.storage.sql.exec(
        "UPDATE visitors SET visitor_ref = lower(hex(randomblob(16))) WHERE visitor_ref IS NULL OR visitor_ref = ''",
      );
      this.state.storage.sql.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS visitors_ref ON visitors (visitor_ref)",
      );
      this.state.storage.sql.exec(
        `UPDATE artifacts
         SET creator_token = (
           SELECT visitor_ref FROM visitors WHERE visitor_token = artifacts.creator_token
         )
         WHERE EXISTS (
           SELECT 1 FROM visitors WHERE visitor_token = artifacts.creator_token
         )`,
      );
      this.state.storage.sql.exec(
        `UPDATE reports
         SET reporter_token = (
           SELECT visitor_ref FROM visitors WHERE visitor_token = reports.reporter_token
         )
         WHERE EXISTS (
           SELECT 1 FROM visitors WHERE visitor_token = reports.reporter_token
         )`,
      );
      this.state.storage.sql.exec(
        "INSERT OR IGNORE INTO room_sequences (id, value) VALUES ('z-order', (SELECT COALESCE(MAX(z_index), 0) FROM artifacts))",
      );
      this.state.storage.sql.exec(
        `INSERT OR IGNORE INTO room_sequences (id, value)
         SELECT 'visible-artifacts', COUNT(*)
         FROM artifacts
         WHERE lifecycle IN ('active', 'archiving')`,
      );
      this.state.storage.sql.exec(
        "INSERT OR IGNORE INTO room_sequences (id, value) SELECT 'reports', COUNT(*) FROM reports",
      );
      this.writeRuntimeStatus("schema-version", DATABASE_MIGRATION_VERSION);
    }

    this.state.storage.sql.exec(
      "INSERT OR IGNORE INTO fixtures (id, state, revision, updated_at) VALUES ('light', 'on', 1, ?)",
      Date.now(),
    );
    this.state.storage.sql.exec(
      "INSERT OR IGNORE INTO room_limits (id, window_at, mutation_count) VALUES ('mutations', ?, 0), ('mutations-day', ?, 0), ('artifacts-day', ?, 0)",
      Date.now(),
      Date.now(),
      Date.now(),
    );
    this.state.storage.sql.exec(
      "INSERT OR IGNORE INTO room_limits (id, window_at, mutation_count) VALUES ('sessions-minute', ?, 0), ('sessions-day', ?, 0), ('session-requests-day', ?, 0), ('ws-day', ?, 0), ('frames-day', ?, 0), ('reads-day', ?, 0)",
      Date.now(),
      Date.now(),
      Date.now(),
      Date.now(),
      Date.now(),
      Date.now(),
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") return this.openWebSocket(request);
    if (url.pathname === "/api/session" && request.method === "POST") {
      if (
        !this.consumeRoomLimit(
          "session-requests-day",
          24 * 60 * 60 * 1000,
          ROOM_DAILY_SESSION_REQUEST_LIMIT,
          Date.now(),
        )
      ) {
        return this.json({ error: "SESSION_RATE_LIMITED" }, 429);
      }
      return this.openSession(request);
    }
    if (
      request.method === "GET" &&
      ["/api/occupancy", "/api/health", "/api/readiness"].includes(url.pathname) &&
      !this.consumeRoomLimit("reads-day", 24 * 60 * 60 * 1000, ROOM_DAILY_READ_LIMIT, Date.now())
    ) {
      return this.json({ error: "ROOM_READ_LIMITED" }, 429);
    }
    if (url.pathname === "/api/occupancy" && request.method === "GET") {
      return this.json({ occupancy: this.occupancy() });
    }
    if (url.pathname === "/api/health" && request.method === "GET") {
      return this.health();
    }
    if (url.pathname === "/api/readiness" && request.method === "GET") {
      return this.health(true);
    }
    if (url.pathname === "/api/moderation/quarantine" && request.method === "POST") {
      return this.moderate(request, "quarantine");
    }
    if (url.pathname === "/api/moderation/restore" && request.method === "POST") {
      return this.moderate(request, "restore");
    }

    return this.json({ error: "NOT_FOUND" }, 404);
  }

  private async openWebSocket(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return this.json({ error: "WEBSOCKET_REQUIRED" }, 426);
    }

    const visitorToken = this.readVisitorCookie(request);
    const visitor = visitorToken
      ? (this.state.storage.sql
          .exec("SELECT display_name, visitor_ref FROM visitors WHERE visitor_token = ?", visitorToken)
          .toArray()[0] as { display_name: string; visitor_ref: string } | undefined)
      : undefined;
    const displayName = normalizeDisplayName(visitor?.display_name);
    const creatorRef = normalizeToken(visitor?.visitor_ref);
    if (!visitorToken || !displayName || !creatorRef) return this.json({ error: "SESSION_REQUIRED" }, 401);
    const actorKey = await requestActorKey(request);
    const operatorLoad = Boolean(
      this.environment.MODERATOR_TOKEN &&
        request.headers.get("Authorization") === `Bearer ${this.environment.MODERATOR_TOKEN}`,
    );
    if (this.occupancy() >= MAX_CONNECTIONS) {
      return this.json({ error: "ROOM_FULL", message: "THE ROOM IS FULL. TRY THE DOOR AGAIN SOON." }, 503);
    }
    const visitorConnections = this.sessionAttachments().filter(
      (attachment) => attachment.visitorToken === visitorToken,
    ).length;
    if (visitorConnections >= MAX_CONNECTIONS_PER_VISITOR) {
      return this.json({ error: "TOO_MANY_TABS", message: "YOU ALREADY HAVE ENOUGH DOORS OPEN." }, 429);
    }
    if (
      actorKey && !operatorLoad &&
      this.sessionAttachments().filter((attachment) => attachment.actorKey === actorKey).length >=
        MAX_CONNECTIONS_PER_ACTOR
    ) {
      return this.json({ error: "TOO_MANY_CONNECTIONS", message: "TOO MANY DOORS FROM THE SAME HALLWAY." }, 429);
    }
    const admittedAt = Date.now();
    if (!this.consumeWebSocketAdmission(actorKey, admittedAt, operatorLoad)) {
      return this.json({ error: "SOCKET_RATE_LIMITED", message: "TOO MANY TRIPS THROUGH THIS DOOR." }, 429);
    }
    if (!this.consumeFrameLease(actorKey, admittedAt)) {
      return this.json({ error: "ROOM_RESTING", message: "THE ROOM HAS HEARD ENOUGH TODAY." }, 429);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    if (!client || !server) return this.json({ error: "SOCKET_FAILED" }, 500);

    const attachment: SessionAttachment = {
      visitorToken,
      creatorRef,
      displayName,
      presenceId: crypto.randomUUID(),
      actorKey,
      joinedAt: admittedAt,
      frameLeaseRemaining: FRAME_LEASE_SIZE,
    };
    server.serializeAttachment(attachment);
    this.state.acceptWebSocket(server);
    server.send(JSON.stringify(await this.snapshot(attachment)));
    this.broadcastPresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket: WebSocket, rawMessage: string | ArrayBuffer): void {
    const attachment = socket.deserializeAttachment() as SessionAttachment | null;
    if (!attachment) {
      socket.close(1008, "Missing session");
      return;
    }
    if (!normalizeToken(attachment.creatorRef)) {
      const visitor = this.state.storage.sql
        .exec("SELECT visitor_ref FROM visitors WHERE visitor_token = ?", attachment.visitorToken)
        .toArray()[0] as { visitor_ref: string } | undefined;
      if (!visitor || !normalizeToken(visitor.visitor_ref)) {
        socket.close(1008, "Session expired");
        return;
      }
      attachment.creatorRef = visitor.visitor_ref;
      attachment.actorKey ??= null;
      socket.serializeAttachment(attachment);
    }
    if (!this.acceptFrame(socket, attachment)) return;

    if (rawMessage instanceof ArrayBuffer && rawMessage.byteLength > MAX_MESSAGE_BYTES) {
      this.rejectInvalidFrame(socket, attachment, null, "TOO_LOUD", "THAT WILL NOT FIT THROUGH THE DOOR.");
      return;
    }
    if (typeof rawMessage === "string" && rawMessage.length > MAX_MESSAGE_BYTES) {
      this.rejectInvalidFrame(socket, attachment, null, "TOO_LOUD", "THAT WILL NOT FIT THROUGH THE DOOR.");
      return;
    }
    const raw = typeof rawMessage === "string" ? rawMessage : new TextDecoder().decode(rawMessage);
    if (new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) {
      this.rejectInvalidFrame(socket, attachment, null, "TOO_LOUD", "THAT WILL NOT FIT THROUGH THE DOOR.");
      return;
    }

    let message: ClientMessage | null;
    try {
      message = asRecord(JSON.parse(raw)) as ClientMessage | null;
    } catch {
      this.rejectInvalidFrame(socket, attachment, null, "BAD_MESSAGE", "THE ROOM DID NOT UNDERSTAND.");
      return;
    }
    if (!message) {
      this.rejectInvalidFrame(socket, attachment, null, "BAD_MESSAGE", "THE ROOM DID NOT UNDERSTAND.");
      return;
    }

    if (message.type === "ping") {
      socket.send(JSON.stringify({ type: "pong", at: Date.now() }));
      return;
    }

    if (message.type === "cursor") {
      const payload = asRecord(message.payload);
      const point = normalizePoint(payload?.point);
      if (!point) {
        this.rejectInvalidFrame(socket, attachment, null, "BAD_CURSOR", "THAT POINT IS OUTSIDE THE ROOM.");
        return;
      }
      this.queueCursor(socket, attachment, point);
      return;
    }

    if (message.type === "drawing.preview" || message.type === "drawing.preview.end") {
      const previewId = normalizeMutationId(message.mutationId);
      if (!previewId) {
        this.rejectInvalidFrame(socket, attachment, null, "BAD_ID", "TRY THAT AGAIN, SLOWER.");
        return;
      }
      if (message.type === "drawing.preview.end") {
        if (!this.acceptEphemeralMessage(socket, attachment)) return;
        this.clearDrawingPreview(attachment, previewId, socket);
        return;
      }
      const payload = asRecord(message.payload);
      const points = normalizeStroke(payload?.points);
      if (!points) {
        this.rejectInvalidFrame(socket, attachment, previewId, "BAD_DRAWING", "THAT LINE WILL NOT HOLD.");
        return;
      }
      const width = typeof payload?.width === "number" ? clamp(payload.width, 1, 12) : 4;
      const color = typeof payload?.color === "string" && COLORS.has(payload.color) ? payload.color : "chalk";
      this.queueDrawingPreview(socket, attachment, previewId, { points, width, color });
      return;
    }

    const mutationId = normalizeMutationId(message.mutationId);
    if (!mutationId) {
      this.rejectInvalidFrame(socket, attachment, null, "BAD_ID", "TRY THAT AGAIN, SLOWER.");
      return;
    }
    if (typeof message.type !== "string" || !MUTATION_TYPES.has(message.type)) {
      this.rejectInvalidFrame(socket, attachment, mutationId, "UNKNOWN_ACTION", "NOTHING HAPPENED.");
      return;
    }
    if (!this.acceptActorMutation(attachment)) {
      if (!this.acceptRejectedMutation(socket, attachment)) return;
      this.sendError(socket, mutationId, "SLOW_DOWN", "THE ROOM NEEDS A SECOND.");
      return;
    }

    const processed = this.processMutation(message, mutationId, attachment);
    const resultCode = typeof processed.result.code === "string" ? processed.result.code : null;
    if (resultCode && RATE_REJECTION_CODES.has(resultCode) && !this.acceptRejectedMutation(socket, attachment)) {
      return;
    }
    const event = asRecord(processed.result.event);
    if (!processed.replayed && processed.result.ok === true && event) {
      this.broadcast({ ...event, actorPresenceId: attachment.presenceId }, socket);
    }
    if (message.type === "drawing.create") this.clearDrawingPreview(attachment, mutationId, socket);
    if (
      !processed.replayed &&
      processed.result.ok === true &&
      ["drawing.create", "note.create", "object.create"].includes(String(message.type))
    ) {
      this.scheduleCompactionIfNeeded();
    }
    try {
      socket.send(JSON.stringify(processed.result));
    } catch {
      // The durable result is committed. A reconnect receives canonical state.
    }
  }

  webSocketClose(socket: WebSocket): void {
    this.clearSocketPresence(socket);
    this.broadcastPresence();
  }

  webSocketError(socket: WebSocket): void {
    this.clearSocketPresence(socket);
    this.broadcastPresence();
  }

  async alarm(): Promise<void> {
    this.compactionScheduled = false;
    let archiveFailed = false;
    let maintenanceFailed = false;
    try {
      await this.archiveOldArtifacts();
      this.writeRuntimeStatus("archive", "ok");
    } catch {
      archiveFailed = true;
      this.writeRuntimeStatus("archive", "failed");
      console.error("ROOM_1 archive failed; a bounded retry is scheduled.");
    }
    try {
      this.compactMutationReceipts(Date.now());
      this.writeRuntimeStatus("maintenance", "ok");
    } catch {
      maintenanceFailed = true;
      this.writeRuntimeStatus("maintenance", "failed");
      console.error("ROOM_1 maintenance failed; a bounded retry is scheduled.");
    }
    const retryAfter = archiveFailed || maintenanceFailed ? 5 * 60 * 1000 : MAINTENANCE_INTERVAL_MS;
    await this.state.storage.setAlarm(Date.now() + retryAfter);
  }

  private processMutation(
    message: ClientMessage,
    mutationId: string,
    session: SessionAttachment,
  ): ProcessedMutation {
    return this.state.storage.transactionSync(() => {
      const previous = this.state.storage.sql
        .exec("SELECT result FROM mutations WHERE id = ?", mutationId)
        .toArray()[0] as { result: string } | undefined;
      if (previous) {
        return { result: replayReceipt(previous.result), replayed: true };
      }

      const tombstone = this.state.storage.sql
        .exec("SELECT id FROM mutation_tombstones WHERE id = ?", mutationId)
        .toArray()[0] as { id: string } | undefined;
      if (tombstone) {
        return {
          result: { ...failure(mutationId, "ALREADY_HEARD", "THE ROOM ALREADY HEARD THAT."), replayed: true },
          replayed: true,
        };
      }

      const now = Date.now();
      if (!this.consumeActorDailyMutation(session.actorKey, now)) {
        return { result: failure(mutationId, "ACTOR_RESTING", "THIS HALLWAY HAS DONE ENOUGH TODAY."), replayed: false };
      }
      if (!this.consumeRate(session.visitorToken, now)) {
        return { result: failure(mutationId, "SLOW_DOWN", "THE ROOM NEEDS A SECOND."), replayed: false };
      }
      const result = this.applyMutation(message, mutationId, session, now);
      this.state.storage.sql.exec(
        "INSERT INTO mutations (id, visitor_token, created_at, result) VALUES (?, ?, ?, ?)",
        mutationId,
        session.visitorToken,
        now,
        JSON.stringify(receiptForStorage(result)),
      );
      return { result, replayed: false };
    });
  }

  private applyMutation(
    message: ClientMessage,
    mutationId: string,
    session: SessionAttachment,
    now: number,
  ): Record<string, unknown> {
    const payload = asRecord(message.payload);

    switch (message.type) {
      case "drawing.create":
        return this.createDrawing(mutationId, session, payload, now);
      case "note.create":
        return this.createNote(mutationId, session, payload, now);
      case "object.create":
        return this.createObject(mutationId, session, payload, now);
      case "artifact.move":
        return this.moveArtifact(mutationId, session, payload, now);
      case "fixture.toggle":
        return this.toggleFixture(mutationId, payload, now);
      case "report.create":
        return this.createReport(mutationId, session, payload, now);
      default:
        return failure(mutationId, "UNKNOWN_ACTION", "NOTHING HAPPENED.");
    }
  }

  private createDrawing(
    mutationId: string,
    session: SessionAttachment,
    payload: Record<string, unknown> | null,
    now: number,
  ): Record<string, unknown> {
    if (this.readArtifact(`drawing_${mutationId}`)) {
      return failure(mutationId, "ALREADY_HEARD", "THE ROOM ALREADY HEARD THAT.");
    }
    const points = normalizeStroke(payload?.points);
    const width = typeof payload?.width === "number" ? clamp(payload.width, 1, 12) : 4;
    const color = typeof payload?.color === "string" && COLORS.has(payload.color) ? payload.color : "chalk";
    if (!points) return failure(mutationId, "BAD_STROKE", "THE MARK FELL APART.");
    if (!this.hasArtifactCapacity()) return failure(mutationId, "ROOM_BUSY", "THE ROOM IS MAKING SPACE.");

    const quota = this.getQuota(session.visitorToken, now);
    const nextInk = spendInk(
      { balance: quota.ink_balance, updatedAt: quota.ink_updated_at },
      strokeInkCost(points, width),
      now,
    );
    if (!nextInk) return failure(mutationId, "NO_INK", "THE INK COMES BACK. LATER.");
    if (!this.consumeRoomLimit("artifacts-day", 24 * 60 * 60 * 1000, ROOM_DAILY_ARTIFACT_LIMIT, now)) {
      return failure(mutationId, "ROOM_RESTING", "THE ROOM HAS ENOUGH NEW THINGS TODAY.");
    }

    this.writeInk(session.visitorToken, quota, nextInk);
    const artifact = this.insertArtifact(
      `drawing_${mutationId}`,
      "drawing",
      session.creatorRef,
      { points, width, color },
      now,
    );

    return success(
      mutationId,
      { type: "artifact.upsert", artifact: publicArtifact(artifact) },
      { ink: nextInk.balance },
    );
  }

  private createNote(
    mutationId: string,
    session: SessionAttachment,
    payload: Record<string, unknown> | null,
    now: number,
  ): Record<string, unknown> {
    if (this.readArtifact(`note_${mutationId}`)) {
      return failure(mutationId, "ALREADY_HEARD", "THE ROOM ALREADY HEARD THAT.");
    }
    const text = normalizeNote(payload?.text);
    const point = normalizePoint(payload?.point);
    if (!text || !point) return failure(mutationId, "BAD_NOTE", "THE NOTE STAYED BLANK.");
    if (!this.hasArtifactCapacity()) return failure(mutationId, "ROOM_BUSY", "THE ROOM IS MAKING SPACE.");

    const quota = this.getQuota(session.visitorToken, now);
    if (quota.last_note_at !== null && now - quota.last_note_at < NOTE_COOLDOWN_MS) {
      return failure(mutationId, "NOTE_COOLDOWN", "ONE NOTE AT A TIME.");
    }
    if (!this.consumeRoomLimit("artifacts-day", 24 * 60 * 60 * 1000, ROOM_DAILY_ARTIFACT_LIMIT, now)) {
      return failure(mutationId, "ROOM_RESTING", "THE ROOM HAS ENOUGH NEW THINGS TODAY.");
    }

    this.state.storage.sql.exec(
      "UPDATE quotas SET last_note_at = ? WHERE visitor_token = ?",
      now,
      session.visitorToken,
    );
    const artifact = this.insertArtifact(
      `note_${mutationId}`,
      "note",
      session.creatorRef,
      { text, point: clampArtifactPosition(point) },
      now,
    );
    return success(mutationId, { type: "artifact.upsert", artifact: publicArtifact(artifact) });
  }

  private createObject(
    mutationId: string,
    session: SessionAttachment,
    payload: Record<string, unknown> | null,
    now: number,
  ): Record<string, unknown> {
    if (this.readArtifact(`object_${mutationId}`)) {
      return failure(mutationId, "ALREADY_HEARD", "THE ROOM ALREADY HEARD THAT.");
    }
    const point = normalizePoint(payload?.point);
    const shape = typeof payload?.shape === "string" && OBJECT_SHAPES.has(payload.shape) ? payload.shape : null;
    const color = typeof payload?.color === "string" && COLORS.has(payload.color) ? payload.color : "rust";
    const detail = typeof payload?.detail === "string" && OBJECT_DETAILS.has(payload.detail) ? payload.detail : "plain";
    if (!point || !shape) return failure(mutationId, "BAD_OBJECT", "THAT OBJECT REFUSED TO EXIST.");
    if (!this.hasArtifactCapacity()) return failure(mutationId, "ROOM_BUSY", "THE ROOM IS MAKING SPACE.");

    const quota = this.getQuota(session.visitorToken, now);
    if (!mayCreateObject(quota.last_object_at, now)) {
      return failure(mutationId, "OBJECT_COOLDOWN", "YOU ALREADY LEFT SOMETHING HERE TODAY.");
    }
    if (!this.consumeRoomLimit("artifacts-day", 24 * 60 * 60 * 1000, ROOM_DAILY_ARTIFACT_LIMIT, now)) {
      return failure(mutationId, "ROOM_RESTING", "THE ROOM HAS ENOUGH NEW THINGS TODAY.");
    }

    this.state.storage.sql.exec(
      "UPDATE quotas SET last_object_at = ? WHERE visitor_token = ?",
      now,
      session.visitorToken,
    );
    const artifact = this.insertArtifact(
      `object_${mutationId}`,
      "object",
      session.creatorRef,
      { shape, color, detail, point: clampArtifactPosition(point), rotation: 0 },
      now,
    );
    return success(mutationId, { type: "artifact.upsert", artifact: publicArtifact(artifact) });
  }

  private moveArtifact(
    mutationId: string,
    _session: SessionAttachment,
    payload: Record<string, unknown> | null,
    now: number,
  ): Record<string, unknown> {
    const id = typeof payload?.id === "string" ? payload.id : "";
    const expectedRevision = typeof payload?.revision === "number" ? Math.floor(payload.revision) : -1;
    const point = normalizePoint(payload?.point);
    const artifact = this.readArtifact(id);
    if (!artifact || artifact.lifecycle !== "active" || artifact.kind === "drawing" || !point) {
      return failure(mutationId, "CANNOT_MOVE", "IT WILL NOT BUDGE.");
    }
    if (artifact.revision !== expectedRevision) {
      return failure(mutationId, "STALE", "SOMEONE GOT THERE FIRST.", {
        artifact: publicArtifact(artifact),
      });
    }

    artifact.payload.point = clampArtifactPosition(point);
    if (artifact.kind === "object" && typeof payload?.rotation === "number") {
      artifact.payload.rotation = Math.round(payload.rotation % 360);
    }
    artifact.revision += 1;
    artifact.updatedAt = now;
    artifact.zIndex = this.nextZIndex();
    this.updateArtifact(artifact);
    return success(mutationId, { type: "artifact.upsert", artifact: publicArtifact(artifact) });
  }

  private toggleFixture(
    mutationId: string,
    payload: Record<string, unknown> | null,
    now: number,
  ): Record<string, unknown> {
    if (payload?.id !== "light") return failure(mutationId, "FIXED", "THAT IS PART OF THE ROOM.");
    const row = this.state.storage.sql
      .exec("SELECT id, state, revision, updated_at FROM fixtures WHERE id = 'light'")
      .toArray()[0] as unknown as FixtureRow;
    if (row.revision > 1 && now - row.updated_at < LIGHT_COOLDOWN_MS) {
      return failure(mutationId, "FIXTURE_COOLDOWN", "LET THE LIGHT SETTLE.");
    }
    const state = row.state === "on" ? "off" : "on";
    const revision = row.revision + 1;
    this.state.storage.sql.exec(
      "UPDATE fixtures SET state = ?, revision = ?, updated_at = ? WHERE id = 'light'",
      state,
      revision,
      now,
    );
    return success(mutationId, {
      type: "fixture.updated",
      fixture: { id: "light", state, revision, updatedAt: now },
    });
  }

  private createReport(
    mutationId: string,
    session: SessionAttachment,
    payload: Record<string, unknown> | null,
    now: number,
  ): Record<string, unknown> {
    const artifactId = typeof payload?.artifactId === "string" ? payload.artifactId : "";
    const reason = normalizeNote(payload?.reason) ?? "reported";
    const artifact = this.readArtifact(artifactId);
    if (!artifact || artifact.lifecycle !== "active") {
      return failure(mutationId, "MISSING", "IT IS ALREADY GONE.");
    }
    const existingMutation = this.state.storage.sql
      .exec("SELECT id FROM reports WHERE id = ?", `report_${mutationId}`)
      .toArray()[0] as { id: string } | undefined;
    if (existingMutation) return failure(mutationId, "ALREADY_HEARD", "THE ROOM ALREADY HEARD THAT.");
    const reportCount = this.state.storage.sql
      .exec("SELECT COUNT(*) AS count FROM reports WHERE artifact_id = ?", artifactId)
      .toArray()[0] as { count: number };
    if (reportCount.count >= MAX_REPORTS_PER_ARTIFACT) return acknowledgement(mutationId);
    const inserted = this.state.storage.sql
      .exec(
        `INSERT OR IGNORE INTO reports (id, artifact_id, reporter_token, reason, created_at)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id`,
        `report_${mutationId}`,
        artifactId,
        session.creatorRef,
        reason,
        now,
      )
      .toArray().length;
    if (inserted > 0) this.incrementSequence("reports", inserted);
    return acknowledgement(mutationId);
  }

  private async moderate(request: Request, action: "quarantine" | "restore"): Promise<Response> {
    const configuredToken = this.environment.MODERATOR_TOKEN;
    if (!configuredToken) return this.json({ error: "MODERATION_NOT_CONFIGURED" }, 503);
    if (request.headers.get("Authorization") !== `Bearer ${configuredToken}`) {
      return this.json({ error: "UNAUTHORIZED" }, 401);
    }

    let body: Record<string, unknown> | null;
    try {
      body = asRecord(await request.json());
    } catch {
      return this.json({ error: "BAD_REQUEST" }, 400);
    }
    if (!body) return this.json({ error: "BAD_REQUEST" }, 400);
    const artifactId = typeof body.artifactId === "string" ? body.artifactId : "";
    const artifact = this.readArtifact(artifactId);
    if (!artifact) return this.json({ error: "NOT_FOUND" }, 404);
    if (artifact.lifecycle === "archiving" || artifact.lifecycle === "archiving_quarantined") {
      return this.json({ error: "ARCHIVE_IN_PROGRESS" }, 409);
    }

    const nextLifecycle: Lifecycle = action === "quarantine" ? "quarantined" : "active";
    if (artifact.lifecycle === nextLifecycle) {
      return this.json({ ok: true, artifact: publicArtifact(artifact) });
    }
    const now = Date.now();
    const priorLifecycle = artifact.lifecycle;
    artifact.lifecycle = nextLifecycle;
    artifact.revision += 1;
    artifact.updatedAt = now;
    this.state.storage.transactionSync(() => {
      if (action === "restore") artifact.zIndex = this.nextZIndex();
      this.updateArtifact(artifact);
      this.incrementSequence("visible-artifacts", action === "restore" ? 1 : -1);
      this.state.storage.sql.exec(
        "INSERT INTO moderation_audit (id, artifact_id, action, actor, prior_lifecycle, created_at) VALUES (?, ?, ?, 'operator', ?, ?)",
        crypto.randomUUID(),
        artifactId,
        action,
        priorLifecycle,
        now,
      );
    });
    this.broadcast({
      type: action === "quarantine" ? "artifact.removed" : "artifact.upsert",
      artifactId,
      artifact: action === "restore" ? publicArtifact(artifact) : undefined,
    });
    return this.json({ ok: true, artifact: publicArtifact(artifact) });
  }

  private getQuota(visitorToken: string, now: number): QuotaRow {
    let row = this.state.storage.sql
      .exec(
        "SELECT ink_balance, ink_updated_at, last_note_at, last_object_at, rate_window_at, rate_count FROM quotas WHERE visitor_token = ?",
        visitorToken,
      )
      .toArray()[0] as QuotaRow | undefined;

    if (!row) {
      this.state.storage.sql.exec(
        "INSERT INTO quotas (visitor_token, ink_balance, ink_updated_at, last_note_at, last_object_at, rate_window_at, rate_count) VALUES (?, ?, ?, NULL, NULL, ?, 0)",
        visitorToken,
        INK_CAPACITY,
        now,
        now,
      );
      row = {
        ink_balance: INK_CAPACITY,
        ink_updated_at: now,
        last_note_at: null,
        last_object_at: null,
        rate_window_at: now,
        rate_count: 0,
      };
    }
    return row;
  }

  private consumeRate(visitorToken: string, now: number): boolean {
    const quota = this.getQuota(visitorToken, now);
    const reset = now - quota.rate_window_at >= RATE_WINDOW_MS;
    const count = reset ? 1 : quota.rate_count + 1;
    const windowAt = reset ? now : quota.rate_window_at;
    if (count > RATE_LIMIT) return false;

    const room = this.nextRoomLimit("mutations", RATE_WINDOW_MS, now);
    const daily = this.nextRoomLimit("mutations-day", 24 * 60 * 60 * 1000, now);
    if (room.count > ROOM_RATE_LIMIT || daily.count > ROOM_DAILY_MUTATION_LIMIT) return false;

    this.state.storage.sql.exec(
      "UPDATE quotas SET rate_window_at = ?, rate_count = ? WHERE visitor_token = ?",
      windowAt,
      count,
      visitorToken,
    );
    this.writeRoomLimit("mutations", room);
    this.writeRoomLimit("mutations-day", daily);
    return true;
  }

  private compactMutationReceipts(now: number): void {
    const receiptCutoff = now - MUTATION_RECEIPT_MS;
    const visitorCutoff = now - VISITOR_RETENTION_MS;
    this.state.storage.transactionSync(() => {
      this.state.storage.sql.exec(
        `INSERT OR IGNORE INTO mutation_tombstones (id, visitor_token, expires_at)
         SELECT id, visitor_token, created_at + ?
         FROM mutations
         WHERE created_at < ?
         ORDER BY created_at ASC, id ASC
         LIMIT ?`,
        MUTATION_TOMBSTONE_MS,
        receiptCutoff,
        MAINTENANCE_BATCH_SIZE,
      );
      this.state.storage.sql.exec(
        `DELETE FROM mutations
         WHERE id IN (
           SELECT id FROM mutations
           WHERE created_at < ?
           ORDER BY created_at ASC, id ASC
           LIMIT ?
         )`,
        receiptCutoff,
        MAINTENANCE_BATCH_SIZE,
      );
      this.state.storage.sql.exec(
        `DELETE FROM mutation_tombstones
         WHERE id IN (
           SELECT id FROM mutation_tombstones
           WHERE expires_at < ?
           ORDER BY expires_at ASC, id ASC
           LIMIT ?
         )`,
        now,
        MAINTENANCE_BATCH_SIZE,
      );
      this.state.storage.sql.exec(
        `DELETE FROM quotas
         WHERE visitor_token IN (
           SELECT visitor_token FROM visitors
           WHERE last_seen_at < ?
           ORDER BY last_seen_at ASC, visitor_token ASC
           LIMIT 500
         )`,
        visitorCutoff,
      );
      this.state.storage.sql.exec(
        `DELETE FROM visitors
         WHERE visitor_token IN (
           SELECT visitor_token FROM visitors
           WHERE last_seen_at < ?
           ORDER BY last_seen_at ASC, visitor_token ASC
           LIMIT 500
         )`,
        visitorCutoff,
      );
      this.state.storage.sql.exec(
        `DELETE FROM actor_limits
         WHERE rowid IN (
           SELECT rowid FROM actor_limits
           WHERE window_at < ?
           ORDER BY window_at ASC, actor_key ASC
           LIMIT 1000
         )`,
        now - 2 * 24 * 60 * 60 * 1000,
      );
    });
  }

  private writeInk(visitorToken: string, quota: QuotaRow, ink: InkState): void {
    this.state.storage.sql.exec(
      "UPDATE quotas SET ink_balance = ?, ink_updated_at = ?, last_note_at = ?, last_object_at = ? WHERE visitor_token = ?",
      ink.balance,
      ink.updatedAt,
      quota.last_note_at,
      quota.last_object_at,
      visitorToken,
    );
  }

  private hasArtifactCapacity(): boolean {
    const limit = this.environment.ARCHIVE ? MAX_PENDING_ARTIFACTS : MAX_ACTIVE_ARTIFACTS;
    return this.readSequence("visible-artifacts") < limit;
  }

  private readSequence(id: string): number {
    const row = this.state.storage.sql
      .exec("SELECT value FROM room_sequences WHERE id = ?", id)
      .toArray()[0] as { value: number } | undefined;
    return row?.value ?? 0;
  }

  private incrementSequence(id: string, amount: number): void {
    this.state.storage.sql.exec(
      "UPDATE room_sequences SET value = MAX(0, value + ?) WHERE id = ?",
      amount,
      id,
    );
  }

  private nextZIndex(): number {
    const row = this.state.storage.sql
      .exec("UPDATE room_sequences SET value = value + 1 WHERE id = 'z-order' RETURNING value")
      .toArray()[0] as { value: number };
    return row.value;
  }

  private insertArtifact(
    id: string,
    kind: ArtifactKind,
    creatorToken: string,
    payload: Record<string, unknown>,
    now: number,
  ): Artifact {
    const zIndex = this.nextZIndex();
    this.state.storage.sql.exec(
      "INSERT INTO artifacts (id, kind, creator_token, created_at, updated_at, revision, z_index, lifecycle, payload) VALUES (?, ?, ?, ?, ?, 1, ?, 'active', ?)",
      id,
      kind,
      creatorToken,
      now,
      now,
      zIndex,
      JSON.stringify(payload),
    );
    this.incrementSequence("visible-artifacts", 1);
    return {
      id,
      kind,
      creatorToken,
      createdAt: now,
      updatedAt: now,
      revision: 1,
      zIndex,
      lifecycle: "active",
      payload,
    };
  }

  private readArtifact(id: string): Artifact | null {
    const row = this.state.storage.sql
      .exec(
        "SELECT id, kind, creator_token, created_at, updated_at, revision, z_index, lifecycle, payload FROM artifacts WHERE id = ?",
        id,
      )
      .toArray()[0] as unknown as ArtifactRow | undefined;
    return row ? artifactFromRow(row) : null;
  }

  private updateArtifact(artifact: Artifact): void {
    this.state.storage.sql.exec(
      "UPDATE artifacts SET updated_at = ?, revision = ?, z_index = ?, lifecycle = ?, payload = ? WHERE id = ?",
      artifact.updatedAt,
      artifact.revision,
      artifact.zIndex,
      artifact.lifecycle,
      JSON.stringify(artifact.payload),
      artifact.id,
    );
  }

  private async snapshot(session: SessionAttachment): Promise<Record<string, unknown>> {
    const now = Date.now();
    const artifacts = this.state.storage.sql
      .exec(
        `SELECT id, kind, creator_token, created_at, updated_at, revision, z_index, lifecycle, payload
         FROM artifacts
         WHERE lifecycle IN ('active', 'archiving')
         ORDER BY z_index ASC, id ASC`,
      )
      .toArray()
      .map((row) => publicArtifact(artifactFromRow(row as unknown as ArtifactRow)));
    const fixtures = this.state.storage.sql
      .exec("SELECT id, state, revision, updated_at FROM fixtures")
      .toArray()
      .map((row) => {
        const fixture = row as unknown as FixtureRow;
        return { id: fixture.id, state: fixture.state, revision: fixture.revision, updatedAt: fixture.updated_at };
      });
    const quota = this.getQuota(session.visitorToken, now);
    const ink = refillInk({ balance: quota.ink_balance, updatedAt: quota.ink_updated_at }, now).balance;

    return {
      type: "room.snapshot",
      room: ROOM_NAME,
      serverTime: now,
      occupancy: this.occupancy(),
      presence: this.presence(),
      self: { presenceId: session.presenceId, displayName: session.displayName },
      artifacts,
      fixtures,
      quota: { ink, inkCapacity: INK_CAPACITY, lastObjectAt: quota.last_object_at },
    };
  }

  private async health(requireReady = false): Promise<Response> {
    const activeArtifacts = this.readSequence("visible-artifacts");
    const reports = this.readSequence("reports");
    const archiveConfigured = Boolean(this.environment.ARCHIVE);
    const moderationConfigured = Boolean(this.environment.MODERATOR_TOKEN);
    let archiveReachable = false;
    if (this.environment.ARCHIVE) {
      try {
        await this.environment.ARCHIVE.list({ prefix: "room-1/", limit: 1 });
        archiveReachable = true;
      } catch {
        archiveReachable = false;
      }
    }
    const archiveStatus = this.state.storage.sql
      .exec("SELECT value, updated_at FROM runtime_status WHERE id = 'archive'")
      .toArray()[0] as { value: string; updated_at: number } | undefined;
    const maintenanceStatus = this.state.storage.sql
      .exec("SELECT value, updated_at FROM runtime_status WHERE id = 'maintenance'")
      .toArray()[0] as { value: string; updated_at: number } | undefined;
    const archiveHealthy = archiveReachable && archiveStatus?.value !== "failed";
    const maintenanceHealthy = maintenanceStatus?.value === "ok";
    const ready = archiveConfigured && moderationConfigured && archiveHealthy && maintenanceHealthy;
    return this.json({
      ok: true,
      ready,
      room: ROOM_NAME,
      occupancy: this.occupancy(),
      activeArtifacts,
      reports,
      archiveConfigured,
      archiveReachable,
      archiveHealthy,
      archiveCheckedAt: archiveStatus ? new Date(archiveStatus.updated_at).toISOString() : null,
      maintenanceHealthy,
      maintenanceCheckedAt: maintenanceStatus ? new Date(maintenanceStatus.updated_at).toISOString() : null,
      moderationConfigured,
      checkedAt: new Date().toISOString(),
    }, requireReady && !ready ? 503 : 200);
  }

  private occupancy(): number {
    return this.state.getWebSockets().filter((socket) => socket.readyState === 1).length;
  }

  private sessionAttachments(): SessionAttachment[] {
    return this.state
      .getWebSockets()
      .filter((socket) => socket.readyState === 1)
      .flatMap((socket) => {
        const attachment = socket.deserializeAttachment() as SessionAttachment | null;
        return attachment ? [attachment] : [];
      });
  }

  private presence(): Array<{ presenceId: string; displayName: string; joinedAt: number }> {
    return this.sessionAttachments().map(({ presenceId, displayName, joinedAt }) => ({
      presenceId,
      displayName,
      joinedAt,
    }));
  }

  private async openSession(request: Request): Promise<Response> {
    const now = Date.now();
    const existingToken = this.readVisitorCookie(request);
    if (existingToken) {
      const existing = this.state.storage.sql
        .exec("SELECT display_name, last_seen_at FROM visitors WHERE visitor_token = ?", existingToken)
        .toArray()[0] as { display_name: string; last_seen_at: number } | undefined;
      if (existing) {
        if (now - existing.last_seen_at >= 24 * 60 * 60 * 1000) {
          this.state.storage.sql.exec(
            "UPDATE visitors SET last_seen_at = ? WHERE visitor_token = ?",
            now,
            existingToken,
          );
        }
        return this.json({ displayName: existing.display_name });
      }
    }

    const actorKey = await requestActorKey(request);
    if (!this.consumeSessionIssuance(now, actorKey)) {
      return this.json({ error: "SESSION_RATE_LIMITED" }, 429);
    }
    const visitorToken = crypto.randomUUID();
    const creatorRef = crypto.randomUUID();
    const displayName = randomDisplayName();
    this.state.storage.sql.exec(
      "INSERT INTO visitors (visitor_token, visitor_ref, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
      visitorToken,
      creatorRef,
      displayName,
      now,
      now,
    );
    const headers = new Headers({ "Cache-Control": "no-store", "Content-Type": "application/json" });
    headers.append(
      "Set-Cookie",
      `__Host-room_visitor=${visitorToken}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=31536000`,
    );
    return new Response(JSON.stringify({ displayName }), { status: 201, headers });
  }

  private consumeSessionIssuance(now: number, actorKey: string | null): boolean {
    return this.state.storage.transactionSync(() => {
      const minute = this.nextRoomLimit("sessions-minute", SESSION_RATE_WINDOW_MS, now);
      const daily = this.nextRoomLimit("sessions-day", 24 * 60 * 60 * 1000, now);
      const actor = actorKey
        ? this.nextActorLimit("sessions-day", actorKey, 24 * 60 * 60 * 1000, now)
        : null;
      const repeatActorUsingReserve = daily.count > SESSION_RESERVE_THRESHOLD && actor && actor.count > 1;
      if (
        minute.count > SESSION_RATE_LIMIT ||
        daily.count > SESSION_DAILY_LIMIT ||
        Boolean(repeatActorUsingReserve) ||
        (actor !== null && actor.count > ACTOR_DAILY_SESSION_LIMIT)
      ) {
        return false;
      }
      this.writeRoomLimit("sessions-minute", minute);
      this.writeRoomLimit("sessions-day", daily);
      if (actorKey && actor) this.writeActorLimit("sessions-day", actorKey, actor);
      return true;
    });
  }

  private consumeWebSocketAdmission(actorKey: string | null, now: number, bypassActorLimits: boolean): boolean {
    return this.state.storage.transactionSync(() => {
      const roomDaily = this.nextRoomLimit("ws-day", 24 * 60 * 60 * 1000, now);
      const actorMinute = actorKey && !bypassActorLimits
        ? this.nextActorLimit("ws-minute", actorKey, SESSION_RATE_WINDOW_MS, now)
        : null;
      const actorDaily = actorKey && !bypassActorLimits
        ? this.nextActorLimit("ws-day", actorKey, 24 * 60 * 60 * 1000, now)
        : null;
      const repeatActorUsingReserve =
        roomDaily.count > ROOM_WS_RESERVE_THRESHOLD && actorDaily && actorDaily.count > 1;
      if (
        roomDaily.count > ROOM_DAILY_WS_LIMIT ||
        Boolean(repeatActorUsingReserve) ||
        (actorMinute !== null && actorMinute.count > ACTOR_WS_MINUTE_LIMIT) ||
        (actorDaily !== null && actorDaily.count > ACTOR_DAILY_WS_LIMIT)
      ) {
        return false;
      }
      this.writeRoomLimit("ws-day", roomDaily);
      if (actorKey && actorMinute && actorDaily) {
        this.writeActorLimit("ws-minute", actorKey, actorMinute);
        this.writeActorLimit("ws-day", actorKey, actorDaily);
      }
      return true;
    });
  }

  private consumeFrameLease(actorKey: string | null, now: number): boolean {
    return this.state.storage.transactionSync(() => {
      const room = this.nextRoomLimit(
        "frames-day",
        24 * 60 * 60 * 1000,
        now,
        FRAME_LEASE_SIZE,
      );
      const actor = actorKey
        ? this.nextActorLimit(
            "frames-day",
            actorKey,
            24 * 60 * 60 * 1000,
            now,
            FRAME_LEASE_SIZE,
          )
        : null;
      if (
        room.count > ROOM_DAILY_FRAME_LIMIT ||
        (actor !== null && actor.count > ACTOR_DAILY_FRAME_LIMIT)
      ) {
        return false;
      }
      this.writeRoomLimit("frames-day", room);
      if (actorKey && actor) this.writeActorLimit("frames-day", actorKey, actor);
      return true;
    });
  }

  private consumeActorDailyMutation(actorKey: string | null, now: number): boolean {
    if (!actorKey) return true;
    const next = this.nextActorLimit("mutations-day", actorKey, 24 * 60 * 60 * 1000, now);
    if (next.count > ACTOR_DAILY_MUTATION_LIMIT) return false;
    this.writeActorLimit("mutations-day", actorKey, next);
    return true;
  }

  private nextActorLimit(
    kind: string,
    actorKey: string,
    windowMs: number,
    now: number,
    amount = 1,
  ): { windowAt: number; count: number } {
    const row = this.state.storage.sql
      .exec("SELECT window_at, attempt_count FROM actor_limits WHERE kind = ? AND actor_key = ?", kind, actorKey)
      .toArray()[0] as { window_at: number; attempt_count: number } | undefined;
    const reset = !row || now - row.window_at >= windowMs;
    return { windowAt: reset ? now : row.window_at, count: reset ? amount : row.attempt_count + amount };
  }

  private writeActorLimit(
    kind: string,
    actorKey: string,
    next: { windowAt: number; count: number },
  ): void {
    this.state.storage.sql.exec(
      `INSERT INTO actor_limits (kind, actor_key, window_at, attempt_count) VALUES (?, ?, ?, ?)
       ON CONFLICT(kind, actor_key) DO UPDATE SET
         window_at = excluded.window_at,
         attempt_count = excluded.attempt_count`,
      kind,
      actorKey,
      next.windowAt,
      next.count,
    );
  }

  private consumeRoomLimit(id: string, windowMs: number, limit: number, now: number): boolean {
    const next = this.nextRoomLimit(id, windowMs, now);
    if (next.count > limit) return false;
    this.writeRoomLimit(id, next);
    return true;
  }

  private nextRoomLimit(
    id: string,
    windowMs: number,
    now: number,
    amount = 1,
  ): { windowAt: number; count: number } {
    const row = this.state.storage.sql
      .exec("SELECT window_at, mutation_count FROM room_limits WHERE id = ?", id)
      .toArray()[0] as { window_at: number; mutation_count: number };
    const reset = now - row.window_at >= windowMs;
    return { windowAt: reset ? now : row.window_at, count: reset ? amount : row.mutation_count + amount };
  }

  private writeRoomLimit(id: string, next: { windowAt: number; count: number }): void {
    this.state.storage.sql.exec(
      "UPDATE room_limits SET window_at = ?, mutation_count = ? WHERE id = ?",
      next.windowAt,
      next.count,
      id,
    );
  }

  private readVisitorCookie(request: Request): string | null {
    const cookie = request.headers.get("Cookie") ?? "";
    const value = cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("__Host-room_visitor="))
      ?.slice("__Host-room_visitor=".length);
    return normalizeToken(value);
  }

  private broadcastPresence(): void {
    this.broadcast({ type: "presence.updated", occupancy: this.occupancy(), presence: this.presence() });
  }

  private queueCursor(socket: WebSocket, session: SessionAttachment, point: Point): void {
    if (!this.acceptEphemeralMessage(socket, session)) return;
    this.pendingCursors.set(session.presenceId, {
      presenceId: session.presenceId,
      displayName: session.displayName,
      point,
    });
    if (this.cursorFlushTimer !== null) return;
    this.cursorFlushTimer = setTimeout(() => this.flushCursors(), CURSOR_BATCH_MS);
  }

  private queueDrawingPreview(
    socket: WebSocket,
    session: SessionAttachment,
    previewId: string,
    payload: Record<string, unknown>,
  ): void {
    if (!this.acceptEphemeralMessage(socket, session)) return;
    const key = `${session.presenceId}:${previewId}`;
    for (const activeKey of this.activeDrawingPreviews) {
      if (!activeKey.startsWith(`${session.presenceId}:`) || activeKey === key) continue;
      this.activeDrawingPreviews.delete(activeKey);
      this.pendingDrawingPreviews.delete(activeKey);
      this.broadcast({
        type: "drawing.preview.removed",
        presenceId: session.presenceId,
        previewId: activeKey.slice(session.presenceId.length + 1),
      });
    }
    this.activeDrawingPreviews.add(key);
    this.pendingDrawingPreviews.set(key, {
      presenceId: session.presenceId,
      previewId,
      ...payload,
    });
    if (this.drawingPreviewFlushTimer !== null) return;
    this.drawingPreviewFlushTimer = setTimeout(() => this.flushDrawingPreviews(), CURSOR_BATCH_MS);
  }

  private acceptEphemeralMessage(socket: WebSocket, session: SessionAttachment): boolean {
    const now = Date.now();
    const previous = this.cursorRates.get(session.presenceId);
    const reset = !previous || now - previous.windowAt >= CURSOR_RATE_WINDOW_MS;
    const next = { windowAt: reset ? now : previous.windowAt, count: reset ? 1 : previous.count + 1 };
    this.cursorRates.set(session.presenceId, next);
    if (next.count > EPHEMERAL_ABUSE_LIMIT) {
      socket.close(1008, "Ephemeral message rate exceeded");
      return false;
    }
    return next.count <= CURSOR_RATE_LIMIT;
  }

  private acceptFrame(socket: WebSocket, session: SessionAttachment): boolean {
    const now = Date.now();
    let leaseRemaining = Number.isSafeInteger(session.frameLeaseRemaining)
      ? Math.max(0, session.frameLeaseRemaining as number)
      : 0;
    if (leaseRemaining === 0) {
      if (!this.consumeFrameLease(session.actorKey, now)) {
        socket.close(1008, "Daily frame budget exceeded");
        return false;
      }
      leaseRemaining = FRAME_LEASE_SIZE;
    }
    session.frameLeaseRemaining = leaseRemaining - 1;
    socket.serializeAttachment(session);
    const previous = this.frameRates.get(session.presenceId);
    const reset = !previous || now - previous.windowAt >= CURSOR_RATE_WINDOW_MS;
    const next = { windowAt: reset ? now : previous.windowAt, count: reset ? 1 : previous.count + 1 };
    this.frameRates.set(session.presenceId, next);
    if (next.count > FRAME_RATE_LIMIT) {
      socket.close(1008, "Frame rate exceeded");
      return false;
    }
    if (!session.actorKey) return true;
    const actor = this.nextWindowRate(this.actorFrameRates, session.actorKey, now);
    if (actor.count <= ACTOR_FRAME_RATE_LIMIT) return true;
    socket.close(1008, "Actor frame rate exceeded");
    return false;
  }

  private acceptActorMutation(session: SessionAttachment): boolean {
    if (!session.actorKey) return true;
    const next = this.nextWindowRate(this.actorMutationRates, session.actorKey, Date.now(), RATE_WINDOW_MS);
    return next.count <= ACTOR_MUTATION_RATE_LIMIT;
  }

  private acceptRejectedMutation(socket: WebSocket, session: SessionAttachment): boolean {
    const next = this.nextWindowRate(
      this.rejectedMutationRates,
      session.presenceId,
      Date.now(),
      RATE_WINDOW_MS,
    );
    if (next.count <= REJECTED_MUTATION_WINDOW_LIMIT) return true;
    socket.close(1008, "Rejected mutation budget exceeded");
    return false;
  }

  private nextWindowRate(
    rates: Map<string, CursorRate>,
    key: string,
    now: number,
    windowMs = CURSOR_RATE_WINDOW_MS,
  ): CursorRate {
    const previous = rates.get(key);
    const reset = !previous || now - previous.windowAt >= windowMs;
    const next = { windowAt: reset ? now : previous.windowAt, count: reset ? 1 : previous.count + 1 };
    rates.set(key, next);
    return next;
  }

  private flushCursors(): void {
    this.cursorFlushTimer = null;
    if (this.pendingCursors.size === 0) return;
    const cursors = Array.from(this.pendingCursors.values());
    this.pendingCursors.clear();
    this.broadcast({ type: "presence.cursors", cursors });
  }

  private flushDrawingPreviews(): void {
    this.drawingPreviewFlushTimer = null;
    if (this.pendingDrawingPreviews.size === 0) return;
    const previews = Array.from(this.pendingDrawingPreviews.values());
    this.pendingDrawingPreviews.clear();
    this.broadcast({ type: "drawing.previews", previews });
  }

  private clearDrawingPreview(session: SessionAttachment, previewId: string, except?: WebSocket): void {
    const key = `${session.presenceId}:${previewId}`;
    if (!this.activeDrawingPreviews.delete(key)) return;
    this.pendingDrawingPreviews.delete(key);
    this.broadcast(
      { type: "drawing.preview.removed", presenceId: session.presenceId, previewId },
      except,
    );
  }

  private clearSocketPresence(socket: WebSocket): void {
    const attachment = socket.deserializeAttachment() as SessionAttachment | null;
    if (!attachment) return;
    this.cursorRates.delete(attachment.presenceId);
    this.frameRates.delete(attachment.presenceId);
    this.invalidFrameRates.delete(attachment.presenceId);
    this.rejectedMutationRates.delete(attachment.presenceId);
    this.pendingCursors.delete(attachment.presenceId);
    for (const key of this.pendingDrawingPreviews.keys()) {
      if (key.startsWith(`${attachment.presenceId}:`)) this.pendingDrawingPreviews.delete(key);
    }
    for (const key of this.activeDrawingPreviews) {
      if (key.startsWith(`${attachment.presenceId}:`)) this.activeDrawingPreviews.delete(key);
    }
    if (
      attachment.actorKey &&
      !this.sessionAttachments().some((session) => session.actorKey === attachment.actorKey)
    ) {
      this.actorFrameRates.delete(attachment.actorKey);
      this.actorMutationRates.delete(attachment.actorKey);
    }
  }

  private scheduleCompactionIfNeeded(): void {
    if (!this.environment.ARCHIVE || this.compactionScheduled) return;
    if (this.readSequence("visible-artifacts") < MAX_PENDING_ARTIFACTS) return;
    this.compactionScheduled = true;
    this.state.waitUntil(this.state.storage.setAlarm(Date.now() + 100));
  }

  private writeRuntimeStatus(id: string, value: string): void {
    this.state.storage.sql.exec(
      `INSERT INTO runtime_status (id, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      id,
      value,
      Date.now(),
    );
  }

  private broadcast(message: Record<string, unknown>, except?: WebSocket): void {
    const serialized = JSON.stringify(message);
    for (const socket of this.state.getWebSockets()) {
      if (socket === except || socket.readyState !== 1) continue;
      try {
        socket.send(serialized);
      } catch {
        // The runtime will deliver the close/error event and clean up presence.
      }
    }
  }

  private sendError(socket: WebSocket, mutationId: string | null, code: string, message: string): void {
    socket.send(JSON.stringify(failure(mutationId, code, message)));
  }

  private rejectInvalidFrame(
    socket: WebSocket,
    session: SessionAttachment,
    mutationId: string | null,
    code: string,
    message: string,
  ): void {
    const now = Date.now();
    const local = this.nextWindowRate(
      this.invalidFrameRates,
      session.presenceId,
      now,
      RATE_WINDOW_MS,
    );
    let actorAllowed = true;
    if (session.actorKey) {
      actorAllowed = this.state.storage.transactionSync(() => {
        const actor = this.nextActorLimit(
          "invalid-frames-day",
          session.actorKey as string,
          24 * 60 * 60 * 1000,
          now,
        );
        if (actor.count > ACTOR_DAILY_INVALID_FRAME_LIMIT) return false;
        this.writeActorLimit("invalid-frames-day", session.actorKey as string, actor);
        return true;
      });
    }
    if (local.count > INVALID_FRAME_WINDOW_LIMIT || !actorAllowed) {
      socket.close(1008, "Invalid frame budget exceeded");
      return;
    }
    try {
      this.sendError(socket, mutationId, code, message);
    } catch {
      socket.close(1008, "Invalid frame");
    }
  }

  private json(value: unknown, status = 200): Response {
    return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
  }

  private async archiveOldArtifacts(): Promise<void> {
    const archive = this.environment.ARCHIVE;
    if (!archive) return;

    // A restarted instance may inherit claims made just before a prior instance
    // stopped. No other archive job can be running in this new instance.
    this.state.storage.sql.exec(
      `UPDATE artifacts
       SET lifecycle = CASE
         WHEN lifecycle = 'archiving' THEN 'active'
         ELSE 'quarantined'
       END
       WHERE lifecycle IN ('archiving', 'archiving_quarantined')`,
    );

    const cutoff = Date.now() - ARCHIVE_AFTER_MS;
    const overflow = Math.max(0, this.readSequence("visible-artifacts") - MAX_ACTIVE_ARTIFACTS);
    const overflowRows = overflow > 0
      ? (this.state.storage.sql
          .exec(
            `SELECT id, kind, creator_token, created_at, updated_at, revision, z_index, lifecycle, payload
             FROM artifacts
             WHERE lifecycle = 'active'
             ORDER BY updated_at ASC, id ASC
             LIMIT ?`,
            Math.min(overflow, 1000),
          )
          .toArray() as unknown as ArtifactRow[])
      : [];
    const oldRows = this.state.storage.sql
      .exec(
        `SELECT id, kind, creator_token, created_at, updated_at, revision, z_index, lifecycle, payload
         FROM artifacts
         WHERE lifecycle IN ('active', 'quarantined') AND updated_at < ?
         ORDER BY updated_at ASC, id ASC
         LIMIT 1000`,
        cutoff,
      )
      .toArray() as unknown as ArtifactRow[];
    const rowsById = new Map<string, ArtifactRow>();
    [...overflowRows, ...oldRows].forEach((row) => {
      if (rowsById.size < 1000) rowsById.set(row.id, row);
    });
    const rows = Array.from(rowsById.values());
    if (rows.length === 0) return;

    const artifactIds = rows.map((row) => row.id);
    const archivedReports: ArchiveReportRow[] = [];
    for (const idChunk of chunks(artifactIds, 100)) {
      const placeholders = idChunk.map(() => "?").join(", ");
      archivedReports.push(
        ...(this.state.storage.sql
          .exec(
            `SELECT id, artifact_id, reporter_token, reason, created_at
             FROM reports
             WHERE artifact_id IN (${placeholders})
             ORDER BY created_at ASC, id ASC`,
            ...idChunk,
          )
          .toArray() as unknown as ArchiveReportRow[]),
      );
    }

    this.state.storage.transactionSync(() => {
      for (const row of rows) {
        const claimedLifecycle = row.lifecycle === "active" ? "archiving" : "archiving_quarantined";
        this.state.storage.sql.exec(
          "UPDATE artifacts SET lifecycle = ? WHERE id = ? AND revision = ? AND lifecycle = ?",
          claimedLifecycle,
          row.id,
          row.revision,
          row.lifecycle,
        );
      }
    });

    const archiveId = crypto.randomUUID();
    const key = `room-1/${new Date().toISOString().slice(0, 10)}/${archiveId}.json`;
    try {
      await archive.put(
        key,
        JSON.stringify({
          room: ROOM_NAME,
          archivedAt: Date.now(),
          artifacts: rows.map((row) => privateArchiveArtifact(artifactFromRow(row))),
          reports: archivedReports.map(privateArchiveReport),
        }),
        { httpMetadata: { contentType: "application/json" } },
      );
    } catch (error) {
      this.state.storage.transactionSync(() => {
        for (const row of rows) {
          const claimedLifecycle = row.lifecycle === "active" ? "archiving" : "archiving_quarantined";
          this.state.storage.sql.exec(
            "UPDATE artifacts SET lifecycle = ? WHERE id = ? AND revision = ? AND lifecycle = ?",
            row.lifecycle,
            row.id,
            row.revision,
            claimedLifecycle,
          );
        }
      });
      throw error;
    }

    this.state.storage.transactionSync(() => {
      let visibleDeleted = 0;
      for (const row of rows) {
        const claimedLifecycle = row.lifecycle === "active" ? "archiving" : "archiving_quarantined";
        const deleted = this.state.storage.sql
          .exec(
            `DELETE FROM artifacts
             WHERE id = ? AND revision = ? AND lifecycle = ?
             RETURNING id`,
            row.id,
            row.revision,
            claimedLifecycle,
          )
          .toArray().length;
        if (row.lifecycle === "active") visibleDeleted += deleted;
      }
      let reportsDeleted = 0;
      for (const idChunk of chunks(artifactIds, 100)) {
        const placeholders = idChunk.map(() => "?").join(", ");
        reportsDeleted += this.state.storage.sql
          .exec(
            `DELETE FROM reports WHERE artifact_id IN (${placeholders}) RETURNING id`,
            ...idChunk,
          )
          .toArray().length;
      }
      this.incrementSequence("visible-artifacts", -visibleDeleted);
      this.incrementSequence("reports", -reportsDeleted);
      this.state.storage.sql.exec(
        "INSERT INTO archive_index (id, object_key, artifact_count, created_at) VALUES (?, ?, ?, ?)",
        archiveId,
        key,
        rows.length,
        Date.now(),
      );
    });
    const visibleArtifactIds = rows.filter((row) => row.lifecycle === "active").map((row) => row.id);
    if (visibleArtifactIds.length > 0) {
      this.broadcast({ type: "artifacts.removed", artifactIds: visibleArtifactIds });
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function requestActorKey(request: Request): Promise<string | null> {
  const address = request.headers.get("CF-Connecting-IP")?.trim();
  if (!address || address.length > 64) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function artifactFromRow(row: ArtifactRow): Artifact {
  return {
    id: row.id,
    kind: row.kind,
    creatorToken: row.creator_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
    zIndex: row.z_index,
    lifecycle: row.lifecycle,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
  };
}

function publicArtifact(artifact: Artifact): Omit<Artifact, "creatorToken"> {
  const { creatorToken: _creatorToken, ...visible } = artifact;
  return visible;
}

function privateArchiveArtifact(
  artifact: Artifact,
): Omit<Artifact, "creatorToken"> & { creatorRef: string } {
  const { creatorToken, ...archived } = artifact;
  return { ...archived, creatorRef: creatorToken };
}

function privateArchiveReport(report: ArchiveReportRow): Record<string, unknown> {
  return {
    id: report.id,
    artifactId: report.artifact_id,
    reporterRef: report.reporter_token,
    reason: report.reason,
    createdAt: report.created_at,
  };
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function replayReceipt(serialized: string): Record<string, unknown> {
  const stored = JSON.parse(serialized) as Record<string, unknown>;
  const { event: _event, artifact: _artifact, ink: _ink, ...receipt } = stored;
  return { ...receipt, replayed: true };
}

function receiptForStorage(result: Record<string, unknown>): Record<string, unknown> {
  const {
    event: _event,
    artifact: _artifact,
    ink: _ink,
    replayed: _replayed,
    ...receipt
  } = result;
  return receipt;
}

function randomDisplayName(): string {
  const first = NAME_FIRST[Math.floor(Math.random() * NAME_FIRST.length)] ?? "ODD";
  const second = NAME_SECOND[Math.floor(Math.random() * NAME_SECOND.length)] ?? "LAMP";
  const suffix = Math.floor(Math.random() * 90 + 10);
  return `${first} ${second} ${suffix}`;
}

function success(
  mutationId: string,
  event: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { type: "mutation.result", mutationId, ok: true, event, ...extra };
}

function acknowledgement(mutationId: string): Record<string, unknown> {
  return { type: "mutation.result", mutationId, ok: true };
}

function failure(
  mutationId: string | null,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { type: "mutation.result", mutationId, ok: false, code, message, ...extra };
}
