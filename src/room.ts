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
type Lifecycle = "active" | "quarantined";

interface ArtifactRow {
  id: string;
  kind: ArtifactKind;
  creator_token: string;
  created_at: number;
  updated_at: number;
  revision: number;
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

interface SessionAttachment {
  visitorToken: string;
  displayName: string;
  presenceId: string;
  joinedAt: number;
}

interface ClientMessage {
  type?: unknown;
  mutationId?: unknown;
  payload?: unknown;
}

const COLORS = new Set(["chalk", "rust", "moss", "sky", "gold"]);
const OBJECT_SHAPES = new Set(["crate", "lamp", "stool", "plant"]);
const MAX_ACTIVE_ARTIFACTS = 1500;
const ARCHIVE_AFTER_MS = 90 * 24 * 60 * 60 * 1000;
const NOTE_COOLDOWN_MS = 30_000;
const RATE_WINDOW_MS = 10_000;
const RATE_LIMIT = 80;
const MAX_MESSAGE_BYTES = 32_000;
const NAME_FIRST = ["DUSTY", "SLEEPY", "TIN", "MOSSY", "QUIET", "ODD", "LATE", "LITTLE"];
const NAME_SECOND = ["PIGEON", "LAMP", "MOTH", "KETTLE", "CHAIR", "FERN", "SPOON", "WINDOW"];

export class Room extends DurableObject<Env> {
  private readonly state: DurableObjectState;
  private readonly environment: Env;

  constructor(state: DurableObjectState, environment: Env) {
    super(state, environment);
    this.state = state;
    this.environment = environment;

    state.blockConcurrencyWhile(async () => {
      this.initializeDatabase();
      if ((await state.storage.getAlarm()) === null) {
        await state.storage.setAlarm(Date.now() + 24 * 60 * 60 * 1000);
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
        lifecycle TEXT NOT NULL DEFAULT 'active',
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS artifacts_lifecycle_created
        ON artifacts (lifecycle, created_at);

      CREATE TABLE IF NOT EXISTS visitors (
        visitor_token TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      );

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

      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        reporter_token TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

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

    this.state.storage.sql.exec(
      "INSERT OR IGNORE INTO fixtures (id, state, revision, updated_at) VALUES ('light', 'on', 1, ?)",
      Date.now(),
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") return this.openWebSocket(request);
    if (url.pathname === "/api/session" && request.method === "POST") {
      return this.openSession(request);
    }
    if (url.pathname === "/api/occupancy" && request.method === "GET") {
      return this.json({ occupancy: this.occupancy() });
    }
    if (url.pathname === "/api/health" && request.method === "GET") {
      return this.health();
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
          .exec("SELECT display_name FROM visitors WHERE visitor_token = ?", visitorToken)
          .toArray()[0] as { display_name: string } | undefined)
      : undefined;
    const displayName = normalizeDisplayName(visitor?.display_name);
    if (!visitorToken || !displayName) return this.json({ error: "SESSION_REQUIRED" }, 401);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    if (!client || !server) return this.json({ error: "SOCKET_FAILED" }, 500);

    const attachment: SessionAttachment = {
      visitorToken,
      displayName,
      presenceId: crypto.randomUUID(),
      joinedAt: Date.now(),
    };
    server.serializeAttachment(attachment);
    this.state.acceptWebSocket(server);
    server.send(JSON.stringify(await this.snapshot(visitorToken)));
    this.broadcastPresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, rawMessage: string | ArrayBuffer): Promise<void> {
    const attachment = socket.deserializeAttachment() as SessionAttachment | null;
    if (!attachment) {
      socket.close(1008, "Missing session");
      return;
    }

    const raw = typeof rawMessage === "string" ? rawMessage : new TextDecoder().decode(rawMessage);
    if (raw.length > MAX_MESSAGE_BYTES) {
      this.sendError(socket, null, "TOO_LOUD", "THAT WILL NOT FIT THROUGH THE DOOR.");
      return;
    }

    let message: ClientMessage;
    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      this.sendError(socket, null, "BAD_MESSAGE", "THE ROOM DID NOT UNDERSTAND.");
      return;
    }

    if (message.type === "ping") {
      socket.send(JSON.stringify({ type: "pong", at: Date.now() }));
      return;
    }

    if (message.type === "cursor") {
      const payload = asRecord(message.payload);
      const point = normalizePoint(payload?.point);
      if (!point) return;
      this.broadcast(
        {
          type: "presence.cursor",
          presenceId: attachment.presenceId,
          displayName: attachment.displayName,
          point,
        },
        socket,
      );
      return;
    }

    const mutationId = normalizeMutationId(message.mutationId);
    if (!mutationId) {
      this.sendError(socket, null, "BAD_ID", "TRY THAT AGAIN, SLOWER.");
      return;
    }

    const previous = this.state.storage.sql
      .exec("SELECT result FROM mutations WHERE id = ?", mutationId)
      .toArray()[0] as { result: string } | undefined;
    if (previous) {
      socket.send(previous.result);
      return;
    }

    const now = Date.now();
    if (!this.consumeRate(attachment.visitorToken, now)) {
      this.sendError(socket, mutationId, "SLOW_DOWN", "THE ROOM NEEDS A SECOND.");
      return;
    }

    const result = await this.applyMutation(message, mutationId, attachment, now);
    const serialized = JSON.stringify(result);
    this.state.storage.sql.exec(
      "INSERT INTO mutations (id, visitor_token, created_at, result) VALUES (?, ?, ?, ?)",
      mutationId,
      attachment.visitorToken,
      now,
      serialized,
    );
    socket.send(serialized);

    const event = asRecord(result.event);
    if (result.ok === true && event) this.broadcast(event, socket);
  }

  webSocketClose(): void {
    this.broadcastPresence();
  }

  webSocketError(): void {
    this.broadcastPresence();
  }

  async alarm(): Promise<void> {
    await this.archiveOldArtifacts();
    const mutationCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    this.state.storage.sql.exec("DELETE FROM mutations WHERE created_at < ?", mutationCutoff);
    await this.state.storage.setAlarm(Date.now() + 24 * 60 * 60 * 1000);
  }

  private async applyMutation(
    message: ClientMessage,
    mutationId: string,
    session: SessionAttachment,
    now: number,
  ): Promise<Record<string, unknown>> {
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
    const points = normalizeStroke(payload?.points);
    const width = typeof payload?.width === "number" ? clamp(payload.width, 1, 12) : 4;
    const color = typeof payload?.color === "string" && COLORS.has(payload.color) ? payload.color : "chalk";
    if (!points) return failure(mutationId, "BAD_STROKE", "THE MARK FELL APART.");

    const quota = this.getQuota(session.visitorToken, now);
    const nextInk = spendInk(
      { balance: quota.ink_balance, updatedAt: quota.ink_updated_at },
      strokeInkCost(points, width),
      now,
    );
    if (!nextInk) return failure(mutationId, "NO_INK", "THE INK COMES BACK. LATER.");

    this.writeInk(session.visitorToken, quota, nextInk);
    const artifact = this.insertArtifact(
      `drawing_${mutationId}`,
      "drawing",
      session.visitorToken,
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
    const text = normalizeNote(payload?.text);
    const point = normalizePoint(payload?.point);
    if (!text || !point) return failure(mutationId, "BAD_NOTE", "THE NOTE STAYED BLANK.");

    const quota = this.getQuota(session.visitorToken, now);
    if (quota.last_note_at !== null && now - quota.last_note_at < NOTE_COOLDOWN_MS) {
      return failure(mutationId, "NOTE_COOLDOWN", "ONE NOTE AT A TIME.");
    }

    this.state.storage.sql.exec(
      "UPDATE quotas SET last_note_at = ? WHERE visitor_token = ?",
      now,
      session.visitorToken,
    );
    const artifact = this.insertArtifact(
      `note_${mutationId}`,
      "note",
      session.visitorToken,
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
    const point = normalizePoint(payload?.point);
    const shape = typeof payload?.shape === "string" && OBJECT_SHAPES.has(payload.shape) ? payload.shape : null;
    const color = typeof payload?.color === "string" && COLORS.has(payload.color) ? payload.color : "rust";
    if (!point || !shape) return failure(mutationId, "BAD_OBJECT", "THAT OBJECT REFUSED TO EXIST.");

    const quota = this.getQuota(session.visitorToken, now);
    if (!mayCreateObject(quota.last_object_at, now)) {
      return failure(mutationId, "OBJECT_COOLDOWN", "YOU ALREADY LEFT SOMETHING HERE TODAY.");
    }

    this.state.storage.sql.exec(
      "UPDATE quotas SET last_object_at = ? WHERE visitor_token = ?",
      now,
      session.visitorToken,
    );
    const artifact = this.insertArtifact(
      `object_${mutationId}`,
      "object",
      session.visitorToken,
      { shape, color, point: clampArtifactPosition(point), rotation: 0 },
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
    if (!this.readArtifact(artifactId)) return failure(mutationId, "MISSING", "IT IS ALREADY GONE.");
    this.state.storage.sql.exec(
      "INSERT INTO reports (id, artifact_id, reporter_token, reason, created_at) VALUES (?, ?, ?, ?, ?)",
      `report_${mutationId}`,
      artifactId,
      session.visitorToken,
      reason,
      now,
    );
    return success(mutationId, { type: "report.accepted", artifactId });
  }

  private async moderate(request: Request, action: "quarantine" | "restore"): Promise<Response> {
    const configuredToken = this.environment.MODERATOR_TOKEN;
    if (!configuredToken) return this.json({ error: "MODERATION_NOT_CONFIGURED" }, 503);
    if (request.headers.get("Authorization") !== `Bearer ${configuredToken}`) {
      return this.json({ error: "UNAUTHORIZED" }, 401);
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return this.json({ error: "BAD_REQUEST" }, 400);
    }
    const artifactId = typeof body.artifactId === "string" ? body.artifactId : "";
    const artifact = this.readArtifact(artifactId);
    if (!artifact) return this.json({ error: "NOT_FOUND" }, 404);

    const nextLifecycle: Lifecycle = action === "quarantine" ? "quarantined" : "active";
    if (artifact.lifecycle === nextLifecycle) {
      return this.json({ ok: true, artifact: publicArtifact(artifact) });
    }
    const now = Date.now();
    const priorLifecycle = artifact.lifecycle;
    artifact.lifecycle = nextLifecycle;
    artifact.revision += 1;
    artifact.updatedAt = now;
    this.updateArtifact(artifact);
    this.state.storage.sql.exec(
      "INSERT INTO moderation_audit (id, artifact_id, action, actor, prior_lifecycle, created_at) VALUES (?, ?, ?, 'operator', ?, ?)",
      crypto.randomUUID(),
      artifactId,
      action,
      priorLifecycle,
      now,
    );
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
    this.state.storage.sql.exec(
      "UPDATE quotas SET rate_window_at = ?, rate_count = ? WHERE visitor_token = ?",
      windowAt,
      count,
      visitorToken,
    );
    return count <= RATE_LIMIT;
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

  private insertArtifact(
    id: string,
    kind: ArtifactKind,
    creatorToken: string,
    payload: Record<string, unknown>,
    now: number,
  ): Artifact {
    this.state.storage.sql.exec(
      "INSERT INTO artifacts (id, kind, creator_token, created_at, updated_at, revision, lifecycle, payload) VALUES (?, ?, ?, ?, ?, 1, 'active', ?)",
      id,
      kind,
      creatorToken,
      now,
      now,
      JSON.stringify(payload),
    );
    return { id, kind, creatorToken, createdAt: now, updatedAt: now, revision: 1, lifecycle: "active", payload };
  }

  private readArtifact(id: string): Artifact | null {
    const row = this.state.storage.sql
      .exec(
        "SELECT id, kind, creator_token, created_at, updated_at, revision, lifecycle, payload FROM artifacts WHERE id = ?",
        id,
      )
      .toArray()[0] as unknown as ArtifactRow | undefined;
    return row ? artifactFromRow(row) : null;
  }

  private updateArtifact(artifact: Artifact): void {
    this.state.storage.sql.exec(
      "UPDATE artifacts SET updated_at = ?, revision = ?, lifecycle = ?, payload = ? WHERE id = ?",
      artifact.updatedAt,
      artifact.revision,
      artifact.lifecycle,
      JSON.stringify(artifact.payload),
      artifact.id,
    );
  }

  private async snapshot(visitorToken: string): Promise<Record<string, unknown>> {
    const now = Date.now();
    const artifacts = this.state.storage.sql
      .exec(
        "SELECT id, kind, creator_token, created_at, updated_at, revision, lifecycle, payload FROM artifacts WHERE lifecycle = 'active' ORDER BY created_at ASC LIMIT ?",
        MAX_ACTIVE_ARTIFACTS,
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
    const quota = this.getQuota(visitorToken, now);
    const ink = refillInk({ balance: quota.ink_balance, updatedAt: quota.ink_updated_at }, now).balance;

    const self = this.sessionAttachments().find((visitor) => visitor.visitorToken === visitorToken);
    return {
      type: "room.snapshot",
      room: ROOM_NAME,
      serverTime: now,
      occupancy: this.occupancy(),
      presence: this.presence(),
      self: self ? { presenceId: self.presenceId, displayName: self.displayName } : null,
      artifacts,
      fixtures,
      quota: { ink, inkCapacity: INK_CAPACITY, lastObjectAt: quota.last_object_at },
    };
  }

  private async health(): Promise<Response> {
    const activeArtifacts = this.state.storage.sql
      .exec("SELECT COUNT(*) AS count FROM artifacts WHERE lifecycle = 'active'")
      .toArray()[0] as { count: number };
    const reports = this.state.storage.sql.exec("SELECT COUNT(*) AS count FROM reports").toArray()[0] as {
      count: number;
    };
    return this.json({
      ok: true,
      room: ROOM_NAME,
      occupancy: this.occupancy(),
      activeArtifacts: activeArtifacts.count,
      reports: reports.count,
      checkedAt: new Date().toISOString(),
    });
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

  private openSession(request: Request): Response {
    const existingToken = this.readVisitorCookie(request);
    if (existingToken) {
      const existing = this.state.storage.sql
        .exec("SELECT display_name FROM visitors WHERE visitor_token = ?", existingToken)
        .toArray()[0] as { display_name: string } | undefined;
      if (existing) {
        this.state.storage.sql.exec(
          "UPDATE visitors SET last_seen_at = ? WHERE visitor_token = ?",
          Date.now(),
          existingToken,
        );
        return this.json({ displayName: existing.display_name });
      }
    }

    const visitorToken = crypto.randomUUID();
    const displayName = randomDisplayName();
    const now = Date.now();
    this.state.storage.sql.exec(
      "INSERT INTO visitors (visitor_token, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
      visitorToken,
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

  private json(value: unknown, status = 200): Response {
    return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
  }

  private async archiveOldArtifacts(): Promise<void> {
    const cutoff = Date.now() - ARCHIVE_AFTER_MS;
    const total = this.state.storage.sql
      .exec("SELECT COUNT(*) AS count FROM artifacts WHERE lifecycle = 'active'")
      .toArray()[0] as { count: number };
    const overflow = Math.max(0, total.count - MAX_ACTIVE_ARTIFACTS);
    const rows = this.state.storage.sql
      .exec(
        "SELECT id, kind, creator_token, created_at, updated_at, revision, lifecycle, payload FROM artifacts WHERE lifecycle = 'active' AND created_at < ? ORDER BY created_at ASC LIMIT ?",
        cutoff,
        Math.max(100, overflow),
      )
      .toArray() as unknown as ArtifactRow[];
    if (rows.length === 0) return;

    const archiveId = crypto.randomUUID();
    const key = `room-1/${new Date().toISOString().slice(0, 10)}/${archiveId}.json`;
    await this.environment.ARCHIVE.put(
      key,
      JSON.stringify({ room: ROOM_NAME, archivedAt: Date.now(), artifacts: rows.map(artifactFromRow) }),
      { httpMetadata: { contentType: "application/json" } },
    );

    this.state.storage.transactionSync(() => {
      for (const row of rows) this.state.storage.sql.exec("DELETE FROM artifacts WHERE id = ?", row.id);
      this.state.storage.sql.exec(
        "INSERT INTO archive_index (id, object_key, artifact_count, created_at) VALUES (?, ?, ?, ?)",
        archiveId,
        key,
        rows.length,
        Date.now(),
      );
    });
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function artifactFromRow(row: ArtifactRow): Artifact {
  return {
    id: row.id,
    kind: row.kind,
    creatorToken: row.creator_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: row.revision,
    lifecycle: row.lifecycle,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
  };
}

function publicArtifact(artifact: Artifact): Omit<Artifact, "creatorToken"> {
  const { creatorToken: _creatorToken, ...visible } = artifact;
  return visible;
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

function failure(
  mutationId: string | null,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { type: "mutation.result", mutationId, ok: false, code, message, ...extra };
}
