const SVG_NS = "http://www.w3.org/2000/svg";
const ROOM_WIDTH = 1000;
const ROOM_HEIGHT = 640;
const ROOM_CAPACITY = 64;
const OBJECT_ALLOWANCE_MS = 24 * 60 * 60 * 1000;
const ENTRY_OCCUPANCY_REFRESH_MS = 5 * 60 * 1000;
const OUTBOX_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DRAWING_PREVIEW_INTERVAL_MS = 250;
const DRAWING_PREVIEW_EXPIRY_MS = 3000;
const OUTBOX_KEY = "room_1.outbox.v1";
const COLORS = new Set(["chalk", "rust", "moss", "sky", "gold"]);
const SHAPES = new Set(["crate", "lamp", "stool", "plant"]);
const OBJECT_DETAILS = new Set(["plain", "star", "stripe", "eye"]);
const lowEffects =
  window.matchMedia("(prefers-reduced-motion: reduce), (update: slow)").matches ||
  (Number.isFinite(navigator.hardwareConcurrency) && navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 2) ||
  (Number.isFinite(navigator.deviceMemory) && navigator.deviceMemory > 0 && navigator.deviceMemory <= 2);
document.documentElement.classList.toggle("low-effects", lowEffects);
const restoredOutbox = loadOutbox();

const elements = {
  entryScreen: document.querySelector("#entry-screen"),
  roomScreen: document.querySelector("#room-screen"),
  enter: document.querySelector("#enter"),
  entryError: document.querySelector("#entry-error"),
  occupancyEntry: document.querySelector("#occupancy-entry"),
  occupancyRoom: document.querySelector("#occupancy-room"),
  identity: document.querySelector("#identity"),
  connectionStatus: document.querySelector("#connection-status"),
  connectionLabel: document.querySelector("#connection-label"),
  saveStatus: document.querySelector("#save-status"),
  peopleToggle: document.querySelector("#people-toggle"),
  peoplePanel: document.querySelector("#people-panel"),
  peopleClose: document.querySelector("#people-close"),
  peopleList: document.querySelector("#people-list"),
  roomCanvas: document.querySelector("#room-canvas"),
  persistentDrawingsLayer: document.querySelector("#persistent-drawings-layer"),
  drawingsLayer: document.querySelector("#drawings-layer"),
  artifactsLayer: document.querySelector("#artifacts-layer"),
  presenceLayer: document.querySelector("#presence-layer"),
  strokePreview: document.querySelector("#stroke-preview"),
  placementTarget: document.querySelector("#placement-target"),
  lightSwitch: document.querySelector("#light-switch"),
  selectedActions: document.querySelector("#selected-actions"),
  selectedKind: document.querySelector("#selected-kind"),
  rotateArtifact: document.querySelector("#rotate-artifact"),
  reportArtifact: document.querySelector("#report-artifact"),
  deselectArtifact: document.querySelector("#deselect-artifact"),
  roomMessage: document.querySelector("#room-message"),
  drawOptions: document.querySelector("#draw-options"),
  ink: document.querySelector("#ink"),
  inkMeter: document.querySelector("#ink-meter"),
  noteComposer: document.querySelector("#note-composer"),
  noteForm: document.querySelector("#note-form"),
  noteText: document.querySelector("#note-text"),
  noteCount: document.querySelector("#note-count"),
  objectComposer: document.querySelector("#object-composer"),
  objectAllowance: document.querySelector("#object-allowance"),
  reportDialog: document.querySelector("#report-dialog"),
  reportForm: document.querySelector("#report-form"),
  reportReason: document.querySelector("#report-reason"),
  reportCancel: document.querySelector("#report-cancel"),
};

const state = {
  entered: false,
  socket: null,
  reconnectTimer: null,
  reconnectAttempt: 0,
  heartbeatTimer: null,
  displayName: "",
  selfPresenceId: null,
  artifacts: new Map(),
  artifactElements: new Map(),
  artifactActionActors: new Map(),
  presence: new Map(),
  cursorElements: new Map(),
  cursorTimers: new Map(),
  drawingPreviewElements: new Map(),
  drawingPreviewTimers: new Map(),
  mutedPresence: new Set(),
  outbox: restoredOutbox,
  inFlight: new Set(),
  pendingArtifacts: new Map(
    restoredOutbox
      .filter((message) => message.type === "artifact.move" && typeof message.payload?.id === "string")
      .map((message) => [message.mutationId, message.payload.id]),
  ),
  tool: "move",
  color: "chalk",
  width: 3,
  shape: "crate",
  detail: "plain",
  quota: { ink: 1200, inkCapacity: 1200, lastObjectAt: null },
  objectQueued: restoredOutbox.some((message) => message.type === "object.create"),
  fixturePending: restoredOutbox.some((message) => message.type === "fixture.toggle"),
  fixture: null,
  fixtureActionActor: null,
  occupancy: 0,
  entryOccupancyRefreshedAt: 0,
  roomFull: false,
  selectedId: null,
  drawing: null,
  drag: null,
  placementPoint: { x: ROOM_WIDTH / 2, y: ROOM_HEIGHT / 2 },
  lastCursorSentAt: 0,
  queuedCursor: null,
  cursorSendTimer: null,
  messageTimer: null,
  saveTimer: null,
};

elements.roomCanvas.dataset.tool = state.tool;
updateObjectAllowance();

elements.enter.addEventListener("click", enterRoom);
elements.peopleToggle.addEventListener("click", () => togglePeoplePanel());
elements.peopleClose.addEventListener("click", () => togglePeoplePanel(false));
elements.lightSwitch.addEventListener("click", toggleLight);
elements.roomCanvas.addEventListener("pointerdown", handlePointerDown);
elements.roomCanvas.addEventListener("pointermove", handlePointerMove);
elements.roomCanvas.addEventListener("pointerup", handlePointerUp);
elements.roomCanvas.addEventListener("pointercancel", handlePointerCancel);
elements.roomCanvas.addEventListener("keydown", handleRoomKeydown);
elements.noteForm.addEventListener("submit", handleNoteSubmit);
elements.noteText.addEventListener("input", updateNoteCount);
elements.noteText.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    placeNote(state.placementPoint);
  }
});
elements.rotateArtifact.addEventListener("click", rotateSelectedArtifact);
elements.reportArtifact.addEventListener("click", openReportDialog);
elements.deselectArtifact.addEventListener("click", () => selectArtifact(null));
elements.reportForm.addEventListener("submit", submitReport);
elements.reportCancel.addEventListener("click", () => elements.reportDialog.close());

document.querySelectorAll(".tool-button[data-tool]").forEach((button) => {
  button.addEventListener("click", () => setTool(button.dataset.tool));
});

document.querySelectorAll("[data-color]").forEach((button) => {
  button.addEventListener("click", () => setColor(button.dataset.color));
});

document.querySelectorAll("[data-width]").forEach((button) => {
  button.addEventListener("click", () => setWidth(Number(button.dataset.width)));
});

document.querySelectorAll("[data-shape]").forEach((button) => {
  button.addEventListener("click", () => setShape(button.dataset.shape));
});

document.querySelectorAll("[data-detail]").forEach((button) => {
  button.addEventListener("click", () => setDetail(button.dataset.detail));
});

document.querySelectorAll("[data-close-composer]").forEach((button) => {
  button.addEventListener("click", () => setTool("move"));
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  togglePeoplePanel(false);
  if (elements.reportDialog.open) elements.reportDialog.close();
  if (state.drawing) {
    cancelDrawing();
    setTool("move");
    return;
  }
  if (state.tool !== "move") setTool("move");
  else selectArtifact(null);
});

window.addEventListener("online", () => {
  if (state.entered) connectSocket();
});

window.addEventListener("offline", () => {
  setConnection("offline", "OFFLINE");
  if (state.socket) state.socket.close();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  if (!state.entered) void refreshEntryOccupancy();
  else if (!isSocketOpen()) connectSocket();
});

void refreshEntryOccupancy(true);
window.setInterval(updateObjectAllowance, 15_000);
window.setInterval(() => void refreshEntryOccupancy(), ENTRY_OCCUPANCY_REFRESH_MS);

async function refreshEntryOccupancy(force = false) {
  if (state.entered || document.visibilityState !== "visible") return;
  const now = Date.now();
  if (!force && now - state.entryOccupancyRefreshedAt < ENTRY_OCCUPANCY_REFRESH_MS) return;
  state.entryOccupancyRefreshedAt = now;
  const occupancy = await fetchOccupancy();
  if (occupancy === null) elements.occupancyEntry.textContent = "?";
}

async function fetchOccupancy() {
  try {
    const response = await fetch("/api/occupancy", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("occupancy unavailable");
    const data = await response.json();
    if (!Number.isFinite(data.occupancy)) throw new Error("occupancy invalid");
    setOccupancy(data.occupancy);
    return data.occupancy;
  } catch {
    return null;
  }
}

async function enterRoom() {
  elements.enter.disabled = true;
  elements.enter.textContent = "OPENING";
  elements.entryError.hidden = true;

  try {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error(`session ${response.status}`);
    const session = await response.json();
    if (typeof session.displayName !== "string" || !session.displayName.trim()) {
      throw new Error("session identity missing");
    }

    state.displayName = session.displayName.trim();
    state.entered = true;
    elements.identity.textContent = state.displayName;
    elements.entryScreen.hidden = true;
    elements.roomScreen.hidden = false;
    elements.roomCanvas.focus({ preventScroll: true });
    connectSocket();
  } catch {
    elements.entryError.textContent = "THE DOOR STUCK. TRY IT AGAIN.";
    elements.entryError.hidden = false;
    elements.enter.disabled = false;
    elements.enter.textContent = "ENTER";
  }
}

function connectSocket() {
  if (!state.entered || !navigator.onLine) {
    setConnection("offline", "OFFLINE");
    return;
  }
  if (state.socket && (state.socket.readyState === WebSocket.OPEN || state.socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  window.clearTimeout(state.reconnectTimer);
  if (state.roomFull) setConnection("full", "ROOM FULL · RETRYING");
  else {
    setConnection(
      state.reconnectAttempt > 0 ? "reconnecting" : "connecting",
      state.reconnectAttempt > 0 ? "RECONNECTING" : "CONNECTING",
    );
  }
  const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${scheme}//${window.location.host}/ws`);
  state.socket = socket;

  socket.addEventListener("open", () => {
    if (state.socket !== socket) return;
    state.reconnectAttempt = 0;
    state.roomFull = false;
    state.inFlight.clear();
    setConnection("connected", "CONNECTED");
    flushOutbox();
    window.clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = window.setInterval(() => {
      if (isSocketOpen()) socket.send(JSON.stringify({ type: "ping" }));
    }, 60_000);
  });

  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    handleServerMessage(message);
  });

  socket.addEventListener("close", async () => {
    if (state.socket !== socket) return;
    state.socket = null;
    state.inFlight.clear();
    window.clearInterval(state.heartbeatTimer);
    clearRemoteCursors();
    clearRemoteDrawingPreviews();
    if (!navigator.onLine) {
      setConnection("offline", "OFFLINE");
      return;
    }
    const occupancy = document.visibilityState === "visible" ? await fetchOccupancy() : null;
    if (state.socket) return;
    state.roomFull = document.visibilityState === "visible" && occupancy !== null && occupancy >= ROOM_CAPACITY;
    if (state.roomFull) {
      setConnection("full", "ROOM FULL · RETRYING");
      showMessage("ROOM FULL. THE DOOR WILL KEEP TRYING.");
    } else {
      setConnection("reconnecting", "RECONNECTING");
    }
    scheduleReconnect();
  });

  socket.addEventListener("error", () => {
    if (socket.readyState !== WebSocket.CLOSING && socket.readyState !== WebSocket.CLOSED) socket.close();
  });
}

function scheduleReconnect() {
  window.clearTimeout(state.reconnectTimer);
  const delay = Math.min(15_000, 600 * 2 ** state.reconnectAttempt) + Math.floor(Math.random() * 300);
  state.reconnectAttempt += 1;
  state.reconnectTimer = window.setTimeout(connectSocket, delay);
}

function handleServerMessage(message) {
  if (!message || typeof message !== "object") return;

  if (message.type === "room.snapshot") {
    applySnapshot(message);
    return;
  }

  if (message.type === "mutation.result") {
    handleMutationResult(message);
    return;
  }

  applyEvent(message);
}

function applySnapshot(snapshot) {
  cancelDrawing();
  cancelDragging();
  clearRemoteDrawingPreviews();
  selectArtifact(null);
  state.selfPresenceId = typeof snapshot.self?.presenceId === "string" ? snapshot.self.presenceId : null;
  if (typeof snapshot.self?.displayName === "string") {
    state.displayName = snapshot.self.displayName;
    elements.identity.textContent = state.displayName;
  }

  state.artifacts.clear();
  state.artifactElements.clear();
  state.artifactActionActors.clear();
  elements.persistentDrawingsLayer.replaceChildren();
  elements.drawingsLayer.replaceChildren();
  elements.artifactsLayer.replaceChildren();

  if (Array.isArray(snapshot.artifacts)) {
    snapshot.artifacts.forEach((artifact) => upsertArtifact(artifact, true));
    sortArtifactElements();
    setRovingArtifact(latestArtifactId());
  }

  if (snapshot.quota && typeof snapshot.quota === "object") {
    if (Number.isFinite(snapshot.quota.ink)) state.quota.ink = snapshot.quota.ink;
    if (Number.isFinite(snapshot.quota.inkCapacity)) state.quota.inkCapacity = snapshot.quota.inkCapacity;
    state.quota.lastObjectAt = Number.isFinite(snapshot.quota.lastObjectAt) ? snapshot.quota.lastObjectAt : null;
    updateQuotaDisplay();
  }

  if (Array.isArray(snapshot.fixtures)) {
    state.fixtureActionActor = null;
    snapshot.fixtures.forEach((fixture) => applyFixture(fixture));
  }

  updatePresence(snapshot.presence, snapshot.occupancy);
  renderQueuedDrawingPreviews();
}

function handleMutationResult(result) {
  const queued = state.outbox.find((message) => message.mutationId === result.mutationId);
  settleMutation(result.mutationId);

  if (queued?.type === "fixture.toggle") state.fixturePending = false;
  if (queued?.type === "object.create") state.objectQueued = false;
  if (queued?.type === "artifact.move") {
    const artifactId = state.pendingArtifacts.get(result.mutationId);
    if (artifactId) state.pendingArtifacts.delete(result.mutationId);
  }

  if (result.ok === true) {
    if (result.event && typeof result.event === "object") applyEvent(result.event);
    if (Number.isFinite(result.ink)) {
      state.quota.ink = result.ink;
      updateQuotaDisplay();
    }
    if (queued?.type === "object.create" && result.replayed !== true) {
      state.quota.lastObjectAt = Date.now();
      updateObjectAllowance();
    }
    if (queued?.type === "report.create") showMessage("REPORT LEFT QUIETLY.");
    return;
  }

  if (result.artifact && typeof result.artifact === "object") upsertArtifact(result.artifact);
  if (queued?.type === "object.create" && result.code === "OBJECT_COOLDOWN" && result.replayed !== true) {
    state.quota.lastObjectAt = Date.now();
  }
  updateObjectAllowance();
  showMessage(typeof result.message === "string" ? result.message : "NOTHING HAPPENED.");
  if (queued?.type === "artifact.move") rerenderArtifact(queued.payload?.id);
}

function applyEvent(event) {
  switch (event.type) {
    case "presence.updated":
      updatePresence(event.presence, event.occupancy);
      break;
    case "presence.cursor":
      updateRemoteCursor(event);
      break;
    case "presence.cursors":
      if (Array.isArray(event.cursors)) event.cursors.forEach(updateRemoteCursor);
      break;
    case "drawing.previews":
      if (Array.isArray(event.previews)) event.previews.forEach(updateRemoteDrawingPreview);
      break;
    case "drawing.preview.removed":
      removeRemoteDrawingPreview(event.presenceId, event.previewId);
      break;
    case "artifact.upsert":
      applyArtifactUpsertEvent(event);
      break;
    case "artifact.removed":
      applyArtifactRemovedEvent(event);
      break;
    case "artifacts.removed":
      if (Array.isArray(event.artifactIds)) event.artifactIds.forEach(removeArtifact);
      break;
    case "fixture.updated":
      applyFixture(event.fixture, event.actorPresenceId);
      break;
    case "pong":
      break;
    default:
      break;
  }
}

function updatePresence(presence, occupancy) {
  state.presence.clear();
  if (Array.isArray(presence)) {
    presence.forEach((visitor) => {
      if (visitor && typeof visitor.presenceId === "string" && typeof visitor.displayName === "string") {
        state.presence.set(visitor.presenceId, visitor);
      }
    });
  }

  for (const presenceId of state.cursorElements.keys()) {
    if (!state.presence.has(presenceId)) removeRemoteCursor(presenceId);
  }
  for (const [key, element] of state.drawingPreviewElements) {
    if (!state.presence.has(element.dataset.presenceId)) removeRemoteDrawingPreviewByKey(key);
  }
  for (const presenceId of Array.from(state.mutedPresence)) {
    if (!state.presence.has(presenceId)) setPresenceMuted(presenceId, false);
  }

  setOccupancy(Number.isFinite(occupancy) ? occupancy : state.presence.size);
  renderPeople();
}

function renderPeople() {
  elements.peopleList.replaceChildren();
  const visitors = Array.from(state.presence.values()).sort((left, right) => {
    if (left.presenceId === state.selfPresenceId) return -1;
    if (right.presenceId === state.selfPresenceId) return 1;
    return left.displayName.localeCompare(right.displayName);
  });

  if (visitors.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-people";
    empty.textContent = "THE ROOM IS LISTENING.";
    elements.peopleList.append(empty);
    return;
  }

  visitors.forEach((visitor) => {
    const item = document.createElement("li");
    const name = document.createElement("span");
    const isSelf = visitor.presenceId === state.selfPresenceId;
    name.textContent = `${visitor.displayName}${isSelf ? " · YOU" : ""}`;
    item.append(name);

    if (isSelf) {
      item.classList.add("is-self");
    } else {
      const muted = state.mutedPresence.has(visitor.presenceId);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = muted ? "UNMUTE" : "MUTE";
      button.setAttribute("aria-pressed", String(muted));
      button.addEventListener("click", () => {
        setPresenceMuted(visitor.presenceId, !muted);
        renderPeople();
      });
      item.append(button);
    }

    elements.peopleList.append(item);
  });
}

function updateRemoteCursor(event) {
  if (
    typeof event.presenceId !== "string" ||
    event.presenceId === state.selfPresenceId ||
    state.mutedPresence.has(event.presenceId) ||
    !isPoint(event.point)
  ) {
    return;
  }

  let cursor = state.cursorElements.get(event.presenceId);
  if (!cursor) {
    const label = typeof event.displayName === "string" ? event.displayName.slice(0, 28) : "SOMEONE";
    cursor = svgElement("g", {
      class: "presence-cursor",
      "data-presence-id": event.presenceId,
    });
    cursor.append(
      svgElement("path", { d: "M0 0L3 25L10 18L16 31L22 28L15 15L25 14Z" }),
      svgElement("rect", { x: 18, y: 25, width: Math.max(74, label.length * 7 + 14), height: 22, rx: 2 }),
      svgElement("text", { x: 25, y: 40 }, label),
    );
    elements.presenceLayer.append(cursor);
    state.cursorElements.set(event.presenceId, cursor);
  }

  cursor.setAttribute("transform", `translate(${event.point.x} ${event.point.y})`);
  window.clearTimeout(state.cursorTimers.get(event.presenceId));
  state.cursorTimers.set(
    event.presenceId,
    window.setTimeout(() => removeRemoteCursor(event.presenceId), Math.max(4000, state.occupancy * 80)),
  );
}

function removeRemoteCursor(presenceId) {
  state.cursorElements.get(presenceId)?.remove();
  state.cursorElements.delete(presenceId);
  window.clearTimeout(state.cursorTimers.get(presenceId));
  state.cursorTimers.delete(presenceId);
}

function clearRemoteCursors() {
  Array.from(state.cursorElements.keys()).forEach(removeRemoteCursor);
}

function updateRemoteDrawingPreview(preview) {
  if (
    !preview ||
    typeof preview.presenceId !== "string" ||
    typeof preview.previewId !== "string" ||
    preview.presenceId === state.selfPresenceId ||
    state.mutedPresence.has(preview.presenceId)
  ) {
    return;
  }

  const points = Array.isArray(preview.points) ? preview.points.filter(isPoint) : [];
  if (points.length < 2 || points.length > 80) return;
  const color = COLORS.has(preview.color) ? preview.color : "chalk";
  const width = clamp(Number(preview.width) || 3, 1, 12);
  const key = drawingPreviewKey(preview.presenceId, preview.previewId);
  let path = state.drawingPreviewElements.get(key);
  if (!path) {
    path = svgElement("path", {
      class: `drawing live-drawing-preview ink-${color}`,
      "data-live-preview": preview.previewId,
      "data-presence-id": preview.presenceId,
      "data-preview-id": preview.previewId,
    });
    elements.drawingsLayer.append(path);
    state.drawingPreviewElements.set(key, path);
  }

  path.setAttribute("class", `drawing live-drawing-preview ink-${color}`);
  path.setAttribute("d", pointsToPath(points));
  path.setAttribute("stroke-width", String(width));
  window.clearTimeout(state.drawingPreviewTimers.get(key));
  state.drawingPreviewTimers.set(
    key,
    window.setTimeout(() => removeRemoteDrawingPreviewByKey(key), DRAWING_PREVIEW_EXPIRY_MS),
  );
}

function removeRemoteDrawingPreview(presenceId, previewId) {
  if (typeof presenceId !== "string" || typeof previewId !== "string") return;
  removeRemoteDrawingPreviewByKey(drawingPreviewKey(presenceId, previewId));
}

function removeRemoteDrawingPreviewByKey(key) {
  state.drawingPreviewElements.get(key)?.remove();
  state.drawingPreviewElements.delete(key);
  window.clearTimeout(state.drawingPreviewTimers.get(key));
  state.drawingPreviewTimers.delete(key);
}

function removeRemoteDrawingPreviewsForPresence(presenceId) {
  for (const [key, element] of state.drawingPreviewElements) {
    if (element.dataset.presenceId === presenceId) removeRemoteDrawingPreviewByKey(key);
  }
}

function removeRemoteDrawingPreviewsByPreviewId(previewId) {
  for (const [key, element] of state.drawingPreviewElements) {
    if (element.dataset.previewId === previewId) removeRemoteDrawingPreviewByKey(key);
  }
}

function clearRemoteDrawingPreviews() {
  Array.from(state.drawingPreviewElements.keys()).forEach(removeRemoteDrawingPreviewByKey);
}

function drawingPreviewKey(presenceId, previewId) {
  return `${presenceId}:${previewId}`;
}

function applyArtifactUpsertEvent(event) {
  const artifact = event?.artifact;
  if (!isSupportedArtifact(artifact)) return;
  const actorPresenceId = typeof event.actorPresenceId === "string" ? event.actorPresenceId : null;
  if (actorPresenceId && state.mutedPresence.has(actorPresenceId)) {
    state.artifacts.set(artifact.id, artifact);
    state.artifactActionActors.set(artifact.id, actorPresenceId);
    removePendingPreviewForArtifact(artifact);
    return;
  }
  state.artifactActionActors.delete(artifact.id);
  upsertArtifact(artifact);
}

function applyArtifactRemovedEvent(event) {
  if (typeof event?.artifactId !== "string") return;
  const actorPresenceId = typeof event.actorPresenceId === "string" ? event.actorPresenceId : null;
  if (actorPresenceId && state.mutedPresence.has(actorPresenceId)) {
    state.artifacts.delete(event.artifactId);
    state.artifactActionActors.set(event.artifactId, actorPresenceId);
    return;
  }
  state.artifactActionActors.delete(event.artifactId);
  removeArtifact(event.artifactId);
}

function setPresenceMuted(presenceId, muted) {
  if (typeof presenceId !== "string") return;
  if (muted) {
    state.mutedPresence.add(presenceId);
    removeRemoteCursor(presenceId);
    removeRemoteDrawingPreviewsForPresence(presenceId);
    return;
  }
  state.mutedPresence.delete(presenceId);
  reconcileMutedArtifactActions(presenceId);
  reconcileMutedFixtureAction(presenceId);
}

function reconcileMutedArtifactActions(presenceId) {
  for (const [artifactId, actorPresenceId] of Array.from(state.artifactActionActors)) {
    if (actorPresenceId !== presenceId) continue;
    state.artifactActionActors.delete(artifactId);
    const artifact = state.artifacts.get(artifactId);
    if (artifact) upsertArtifact(artifact);
    else removeArtifact(artifactId);
  }
}

function artifactHasMutedAction(artifactId) {
  const actorPresenceId = state.artifactActionActors.get(artifactId);
  return typeof actorPresenceId === "string" && state.mutedPresence.has(actorPresenceId);
}

function reconcileMutedFixtureAction(presenceId) {
  if (state.fixtureActionActor !== presenceId || !state.fixture) return;
  state.fixtureActionActor = null;
  renderFixture(state.fixture);
}

function isSupportedArtifact(artifact) {
  return artifact && typeof artifact.id === "string" && ["drawing", "note", "object"].includes(artifact.kind);
}

function upsertArtifact(artifact, deferSort = false) {
  if (!isSupportedArtifact(artifact)) return;
  state.artifacts.set(artifact.id, artifact);
  const oldElement = state.artifactElements.get(artifact.id);
  const wasRoving = oldElement?.getAttribute("tabindex") === "0";
  if (oldElement) oldElement.remove();

  let element = null;
  if (artifact.kind === "drawing") element = renderDrawing(artifact);
  if (artifact.kind === "note") element = renderNote(artifact);
  if (artifact.kind === "object") element = renderObject(artifact);
  if (!element) return;

  element.setAttribute("data-z-index", String(artifactStackIndex(artifact)));
  state.artifactElements.set(artifact.id, element);
  const layer = artifactLayer(artifact);
  if (deferSort) layer.append(element);
  else insertArtifactElement(element, artifact, layer);
  if (wasRoving || !document.querySelector('[data-artifact-id][tabindex="0"]')) {
    setRovingArtifact(artifact.id);
  }
  removePendingPreviewForArtifact(artifact);
  if (state.selectedId === artifact.id) selectArtifact(artifact.id);
}

function artifactLayer(artifact) {
  return artifact.kind === "drawing" ? elements.persistentDrawingsLayer : elements.artifactsLayer;
}

function insertArtifactElement(element, artifact, layer) {
  const last = layer.lastElementChild;
  if (!last || compareArtifactToElement(artifact, last) >= 0) {
    layer.append(element);
    return;
  }

  for (const sibling of layer.children) {
    if (compareArtifactToElement(artifact, sibling) < 0) {
      layer.insertBefore(element, sibling);
      return;
    }
  }
  layer.append(element);
}

function compareArtifactToElement(artifact, element) {
  const zIndex = artifactStackIndex(artifact);
  const siblingZIndex = Number(element.getAttribute("data-z-index"));
  const zDifference = zIndex - (Number.isFinite(siblingZIndex) ? siblingZIndex : 0);
  if (zDifference !== 0) return zDifference;
  return artifact.id.localeCompare(element.dataset.artifactId || "");
}

function sortArtifactElements() {
  Array.from(state.artifacts.values())
    .filter((artifact) => state.artifactElements.has(artifact.id))
    .sort((left, right) => artifactStackIndex(left) - artifactStackIndex(right) || left.id.localeCompare(right.id))
    .forEach((artifact) => artifactLayer(artifact).append(state.artifactElements.get(artifact.id)));
}

function latestArtifactId() {
  return Array.from(state.artifacts.values())
    .filter((artifact) => state.artifactElements.has(artifact.id))
    .sort((left, right) => artifactStackIndex(left) - artifactStackIndex(right) || left.id.localeCompare(right.id))
    .at(-1)?.id ?? null;
}

function setRovingArtifact(artifactId) {
  document.querySelectorAll('[data-artifact-id][tabindex="0"]').forEach((element) => {
    element.setAttribute("tabindex", "-1");
  });
  state.artifactElements.get(artifactId)?.setAttribute("tabindex", "0");
}

function artifactStackIndex(artifact) {
  if (Number.isFinite(artifact.zIndex)) return artifact.zIndex;
  if (Number.isFinite(artifact.createdAt)) return artifact.createdAt;
  return 0;
}

function renderDrawing(artifact) {
  const points = Array.isArray(artifact.payload?.points) ? artifact.payload.points.filter(isPoint) : [];
  if (points.length < 2) return null;
  const color = COLORS.has(artifact.payload?.color) ? artifact.payload.color : "chalk";
  const width = clamp(Number(artifact.payload?.width) || 3, 1, 12);
  const path = svgElement("path", {
    class: `artifact artifact-drawing drawing ink-${color}`,
    d: pointsToPath(points),
    "stroke-width": width,
    tabindex: -1,
    role: "button",
    "aria-label": "Shared drawing. Select to report.",
    "data-artifact-id": artifact.id,
  });
  const ageDays = Math.max(0, (Date.now() - Number(artifact.createdAt || Date.now())) / 86_400_000);
  path.setAttribute("opacity", String(Math.max(0.48, 0.9 - ageDays * 0.004)));
  return path;
}

function renderNote(artifact) {
  if (!isPoint(artifact.payload?.point)) return null;
  const group = svgElement("g", {
    class: "artifact artifact-note",
    tabindex: -1,
    role: "button",
    "aria-label": `Shared note: ${String(artifact.payload?.text || "blank note").slice(0, 90)}`,
    "data-artifact-id": artifact.id,
  });
  group.dataset.tilt = String(stableTilt(artifact.id));
  group.append(
    svgElement("rect", { class: "artifact-hit", x: -78, y: -61, width: 156, height: 122, rx: 3, fill: "transparent" }),
    svgElement("path", { class: "note-paper", d: "M-70-52L68-55L73 49L-66 54Z" }),
    svgElement("path", { class: "note-fold", d: "M49 49L73 29L73 49Z" }),
    svgElement("circle", { class: "note-pin", cx: 1, cy: -47, r: 5 }),
  );

  const text = svgElement("text", { class: "note-text", x: -57, y: -27 });
  wrapNoteText(String(artifact.payload?.text || "")).forEach((line, index) => {
    text.append(svgElement("tspan", { x: -57, dy: index === 0 ? 0 : 17 }, line));
  });
  group.append(text);
  setArtifactTransform(group, artifact);
  return group;
}

function renderObject(artifact) {
  if (!isPoint(artifact.payload?.point)) return null;
  const color = COLORS.has(artifact.payload?.color) ? artifact.payload.color : "rust";
  const shape = SHAPES.has(artifact.payload?.shape) ? artifact.payload.shape : "crate";
  const detail = OBJECT_DETAILS.has(artifact.payload?.detail) ? artifact.payload.detail : "plain";
  const description = detail === "plain" ? `plain ${color} ${shape}` : `${color} ${shape} with ${detail} detail`;
  const group = svgElement("g", {
    class: `artifact artifact-object object-${shape} ink-${color}`,
    tabindex: -1,
    role: "button",
    "aria-label": `Shared ${description}. Drag to move, or select for more actions.`,
    "data-artifact-id": artifact.id,
    "data-object-detail": detail,
  });

  if (shape === "lamp") appendLamp(group);
  else if (shape === "stool") appendStool(group);
  else if (shape === "plant") appendPlant(group);
  else appendCrate(group);
  appendObjectDetail(group, detail, shape);

  setArtifactTransform(group, artifact);
  return group;
}

function appendObjectDetail(group, detail, shape) {
  if (detail === "plain") return;
  const verticalOffset = shape === "lamp" ? -36 : shape === "stool" ? -26 : shape === "plant" ? 39 : 0;
  const detailGroup = svgElement("g", {
    class: `object-detail object-detail-${detail}`,
    transform: `translate(0 ${verticalOffset})`,
    "aria-hidden": "true",
  });
  if (detail === "star") {
    detailGroup.append(
      svgElement("path", {
        class: "detail-star",
        d: "M0-14L4-5L14-4L6 3L9 13L0 7L-9 13L-6 3L-14-4L-4-5Z",
      }),
    );
  } else if (detail === "stripe") {
    detailGroup.append(
      svgElement("path", { class: "detail-stripe", d: "M-18-9L18-13M-18 1L18-3M-18 11L18 7" }),
    );
  } else if (detail === "eye") {
    detailGroup.append(
      svgElement("ellipse", { class: "detail-eye", cx: 0, cy: 0, rx: 16, ry: 10 }),
      svgElement("circle", { class: "detail-pupil", cx: 0, cy: 0, r: 4 }),
    );
  }
  group.append(detailGroup);
}

function appendCrate(group) {
  group.append(
    svgElement("rect", { class: "artifact-hit", x: -50, y: -48, width: 100, height: 96, rx: 5, fill: "transparent" }),
    svgElement("path", { class: "object-main", d: "M-42-32L29-40L44-25L42 35L-36 40L-44 22Z" }),
    svgElement("path", { class: "object-line", d: "M-35-22L35 27M34-29L-31 31M-43-14L43-20M-38 19L42 14" }),
  );
}

function appendLamp(group) {
  group.append(
    svgElement("rect", { class: "artifact-hit", x: -48, y: -79, width: 96, height: 158, rx: 5, fill: "transparent" }),
    svgElement("path", { class: "object-main", d: "M-37-55L29-58L43-17L-45-15Z" }),
    svgElement("path", { class: "object-light", d: "M-28-47L22-50L30-23L-35-22Z" }),
    svgElement("path", { class: "object-line", d: "M-1-15L1 51M-28 59Q0 45 30 59" }),
    svgElement("ellipse", { class: "object-main", cx: 1, cy: 59, rx: 33, ry: 9 }),
  );
}

function appendStool(group) {
  group.append(
    svgElement("rect", { class: "artifact-hit", x: -52, y: -51, width: 104, height: 102, rx: 5, fill: "transparent" }),
    svgElement("ellipse", { class: "object-main", cx: 0, cy: -25, rx: 42, ry: 18 }),
    svgElement("path", { class: "object-main", d: "M-40-26L-34-10Q0 4 38-13L42-29Q0-9-40-26Z" }),
    svgElement("path", { class: "object-line", d: "M-29-9L-34 41M27-8L34 40M-32 25L32 23" }),
  );
}

function appendPlant(group) {
  group.append(
    svgElement("rect", { class: "artifact-hit", x: -55, y: -78, width: 110, height: 156, rx: 5, fill: "transparent" }),
    svgElement("path", { class: "object-line", d: "M0 20L-22-39M0 18L28-51M-2 3L-38-6M4-6L38-17" }),
    svgElement("path", { class: "object-main", d: "M-24-35Q-54-56-39-70Q-12-67-15-38ZM24-47Q28-76 48-68Q54-45 29-36ZM-32-8Q-58-31-52-43Q-26-42-16-14ZM31-16Q49-42 61-27Q55-3 28-1Z" }),
    svgElement("path", { class: "object-main", d: "M-34 15L35 13L28 65L-25 68Z" }),
    svgElement("path", { class: "object-line", d: "M-32 26L31 25M-20 39L26 38" }),
  );
}

function removeArtifact(artifactId) {
  if (typeof artifactId !== "string") return;
  const wasRoving = state.artifactElements.get(artifactId)?.getAttribute("tabindex") === "0";
  state.artifacts.delete(artifactId);
  state.artifactActionActors.delete(artifactId);
  state.artifactElements.get(artifactId)?.remove();
  state.artifactElements.delete(artifactId);
  if (state.selectedId === artifactId) selectArtifact(null);
  if (wasRoving) setRovingArtifact(latestArtifactId());
}

function rerenderArtifact(artifactId) {
  if (artifactHasMutedAction(artifactId)) return;
  const artifact = state.artifacts.get(artifactId);
  if (artifact) upsertArtifact(artifact);
}

function setArtifactTransform(element, artifact, point = artifact.payload?.point, rotation = artifact.payload?.rotation) {
  if (!isPoint(point)) return;
  const angle = artifact.kind === "note" ? Number(element.dataset.tilt || 0) : Number(rotation || 0);
  element.setAttribute("transform", `translate(${point.x} ${point.y}) rotate(${angle})`);
}

function applyFixture(fixture, actorPresenceId = null) {
  if (!fixture || fixture.id !== "light" || !["on", "off"].includes(fixture.state)) return;
  state.fixture = fixture;
  if (typeof actorPresenceId === "string" && state.mutedPresence.has(actorPresenceId)) {
    state.fixtureActionActor = actorPresenceId;
    return;
  }
  state.fixtureActionActor = null;
  renderFixture(fixture);
}

function renderFixture(fixture) {
  const on = fixture.state === "on";
  elements.roomScreen.classList.toggle("light-off", !on);
  elements.lightSwitch.setAttribute("aria-pressed", String(on));
  elements.lightSwitch.setAttribute("aria-label", `Turn the shared light ${on ? "off" : "on"}`);
}

function toggleLight() {
  if (state.fixturePending) {
    showMessage("THE SWITCH IS CATCHING UP.");
    return;
  }
  state.fixturePending = true;
  queueMutation("fixture.toggle", { id: "light" });
}

function handlePointerDown(event) {
  if (event.button !== 0) return;
  const point = eventPoint(event);
  state.placementPoint = point;
  updatePlacementTarget();

  if (state.tool === "draw") {
    event.preventDefault();
    startDrawing(event, point);
    return;
  }

  queueCursor(point);

  if (state.tool === "note") {
    event.preventDefault();
    placeNote(point);
    return;
  }

  if (state.tool === "object") {
    event.preventDefault();
    placeObject(point);
    return;
  }

  const artifactElement = event.target.closest?.("[data-artifact-id]");
  if (!artifactElement) {
    selectArtifact(null);
    return;
  }

  const artifactId = artifactElement.dataset.artifactId;
  const artifact = state.artifacts.get(artifactId);
  selectArtifact(artifactId);
  if (!artifact || artifact.kind === "drawing") return;
  if (artifactHasMutedAction(artifactId)) {
    showMessage("THAT THING IS QUIET FOR NOW.");
    return;
  }
  if (hasPendingMove(artifactId)) {
    showMessage("SOMEONE IS STILL MOVING THAT.");
    return;
  }

  event.preventDefault();
  state.drag = {
    pointerId: event.pointerId,
    artifactId,
    element: artifactElement,
    origin: artifact.payload.point,
    point: artifact.payload.point,
    rotation: Number(artifact.payload.rotation || 0),
    moved: false,
  };
  artifactElement.classList.add("is-dragging");
  elements.roomCanvas.classList.add("is-dragging");
  elements.roomCanvas.setPointerCapture(event.pointerId);
}

function handlePointerMove(event) {
  const point = eventPoint(event);

  if (state.drawing?.pointerId === event.pointerId) {
    event.preventDefault();
    const previous = state.drawing.points.at(-1);
    if (state.drawing.points.length < 80 && distance(previous, point) >= 4) {
      state.drawing.points.push(point);
      elements.strokePreview.setAttribute("d", pointsToPath(state.drawing.points));
      scheduleDrawingPreview(state.drawing);
    }
    return;
  }

  queueCursor(point);

  if (state.drag?.pointerId === event.pointerId) {
    event.preventDefault();
    const artifact = state.artifacts.get(state.drag.artifactId);
    if (!artifact) return;
    state.drag.point = clampArtifactPoint(point);
    state.drag.moved ||= distance(state.drag.origin, state.drag.point) > 3;
    setArtifactTransform(state.drag.element, artifact, state.drag.point, state.drag.rotation);
  }
}

function handlePointerUp(event) {
  if (state.drawing?.pointerId === event.pointerId) finishDrawing(event);
  if (state.drag?.pointerId === event.pointerId) finishDragging(event);
}

function handlePointerCancel(event) {
  if (state.drawing?.pointerId === event.pointerId) cancelDrawing();
  if (state.drag?.pointerId === event.pointerId) cancelDragging();
}

function startDrawing(event, point) {
  window.clearTimeout(state.cursorSendTimer);
  state.cursorSendTimer = null;
  state.queuedCursor = null;
  state.drawing = {
    pointerId: event.pointerId,
    mutationId: makeMutationId(),
    points: [point],
    width: state.width,
    color: state.color,
    previewSent: false,
    previewTimer: null,
    lastPreviewSentAt: 0,
  };
  elements.strokePreview.setAttribute("class", `stroke-preview ink-${state.drawing.color}`);
  elements.strokePreview.setAttribute("stroke-width", String(state.drawing.width));
  elements.strokePreview.setAttribute("d", `M${point.x} ${point.y}`);
  elements.roomCanvas.setPointerCapture(event.pointerId);
}

function finishDrawing(event) {
  const drawing = state.drawing;
  state.drawing = null;
  if (drawing) window.clearTimeout(drawing.previewTimer);
  if (elements.roomCanvas.hasPointerCapture(event.pointerId)) elements.roomCanvas.releasePointerCapture(event.pointerId);
  elements.strokePreview.setAttribute("d", "");
  if (!drawing || drawing.points.length < 2) {
    if (drawing?.previewSent) sendDrawingPreviewEnd(drawing);
    showMessage("A MARK NEEDS SOMEWHERE TO GO.");
    return;
  }

  queueMutation(
    "drawing.create",
    {
      points: drawing.points,
      width: drawing.width,
      color: drawing.color,
    },
    drawing.mutationId,
  );
  renderPendingDrawing(drawing.mutationId, drawing.points, drawing.width, drawing.color);
}

function cancelDrawing() {
  const drawing = state.drawing;
  state.drawing = null;
  if (drawing) {
    window.clearTimeout(drawing.previewTimer);
    if (elements.roomCanvas.hasPointerCapture(drawing.pointerId)) {
      elements.roomCanvas.releasePointerCapture(drawing.pointerId);
    }
    if (drawing.previewSent) sendDrawingPreviewEnd(drawing);
  }
  elements.strokePreview.setAttribute("d", "");
}

function finishDragging(event) {
  const drag = state.drag;
  state.drag = null;
  elements.roomCanvas.classList.remove("is-dragging");
  drag?.element.classList.remove("is-dragging");
  if (elements.roomCanvas.hasPointerCapture(event.pointerId)) elements.roomCanvas.releasePointerCapture(event.pointerId);
  if (!drag) return;
  if (!drag.moved) {
    rerenderArtifact(drag.artifactId);
    return;
  }

  const artifact = state.artifacts.get(drag.artifactId);
  if (!artifact) return;
  const payload = {
    id: artifact.id,
    revision: artifact.revision,
    point: drag.point,
  };
  if (artifact.kind === "object") payload.rotation = drag.rotation;
  const mutationId = queueMutation("artifact.move", payload);
  state.pendingArtifacts.set(mutationId, artifact.id);
}

function cancelDragging() {
  const drag = state.drag;
  state.drag = null;
  elements.roomCanvas.classList.remove("is-dragging");
  drag?.element.classList.remove("is-dragging");
  if (drag) rerenderArtifact(drag.artifactId);
}

function handleRoomKeydown(event) {
  const artifactElement = event.target.closest?.("[data-artifact-id]");
  if (artifactElement) {
    const artifactId = artifactElement.dataset.artifactId;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectArtifact(artifactId);
      return;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      nudgeArtifact(artifactId, event.key, event.shiftKey ? 40 : 12);
      return;
    }
    if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      selectArtifact(artifactId);
      rotateSelectedArtifact();
    }
    return;
  }

  if (!["note", "object"].includes(state.tool)) return;
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    const amount = event.shiftKey ? 40 : 12;
    if (event.key === "ArrowLeft") state.placementPoint.x -= amount;
    if (event.key === "ArrowRight") state.placementPoint.x += amount;
    if (event.key === "ArrowUp") state.placementPoint.y -= amount;
    if (event.key === "ArrowDown") state.placementPoint.y += amount;
    state.placementPoint = clampArtifactPoint(state.placementPoint);
    updatePlacementTarget();
  }
  if (event.key === "Enter") {
    event.preventDefault();
    if (state.tool === "note") placeNote(state.placementPoint);
    if (state.tool === "object") placeObject(state.placementPoint);
  }
}

function nudgeArtifact(artifactId, key, amount) {
  const artifact = state.artifacts.get(artifactId);
  if (!artifact || artifact.kind === "drawing" || !isPoint(artifact.payload?.point)) return;
  if (artifactHasMutedAction(artifactId)) {
    showMessage("THAT THING IS QUIET FOR NOW.");
    return;
  }
  if (hasPendingMove(artifactId)) {
    showMessage("SOMEONE IS STILL MOVING THAT.");
    return;
  }
  const point = { ...artifact.payload.point };
  if (key === "ArrowLeft") point.x -= amount;
  if (key === "ArrowRight") point.x += amount;
  if (key === "ArrowUp") point.y -= amount;
  if (key === "ArrowDown") point.y += amount;
  const payload = { id: artifact.id, revision: artifact.revision, point: clampArtifactPoint(point) };
  if (artifact.kind === "object") payload.rotation = Number(artifact.payload.rotation || 0);
  const mutationId = queueMutation("artifact.move", payload);
  state.pendingArtifacts.set(mutationId, artifact.id);
}

function rotateSelectedArtifact() {
  const artifact = state.artifacts.get(state.selectedId);
  if (!artifact || artifact.kind !== "object" || !isPoint(artifact.payload?.point)) return;
  if (artifactHasMutedAction(artifact.id)) {
    showMessage("THAT THING IS QUIET FOR NOW.");
    return;
  }
  if (hasPendingMove(artifact.id)) {
    showMessage("SOMEONE IS STILL MOVING THAT.");
    return;
  }
  const rotation = (Number(artifact.payload.rotation || 0) + 15) % 360;
  const mutationId = queueMutation("artifact.move", {
    id: artifact.id,
    revision: artifact.revision,
    point: artifact.payload.point,
    rotation,
  });
  state.pendingArtifacts.set(mutationId, artifact.id);
}

function selectArtifact(artifactId) {
  if (state.selectedId) state.artifactElements.get(state.selectedId)?.classList.remove("is-selected");
  const artifact = state.artifacts.get(artifactId);
  state.selectedId = artifact ? artifactId : null;
  if (!artifact) {
    elements.selectedActions.hidden = true;
    return;
  }
  setRovingArtifact(artifactId);
  state.artifactElements.get(artifactId)?.classList.add("is-selected");
  elements.selectedKind.textContent = artifact.kind.toUpperCase();
  elements.rotateArtifact.hidden = artifact.kind !== "object";
  elements.selectedActions.hidden = false;
}

function openReportDialog() {
  if (!state.artifacts.has(state.selectedId)) return;
  if (typeof elements.reportDialog.showModal === "function") elements.reportDialog.showModal();
  else elements.reportDialog.setAttribute("open", "");
}

function submitReport(event) {
  event.preventDefault();
  if (!state.artifacts.has(state.selectedId)) {
    elements.reportDialog.close();
    return;
  }
  queueMutation("report.create", {
    artifactId: state.selectedId,
    reason: elements.reportReason.value,
  });
  elements.reportDialog.close();
}

function handleNoteSubmit(event) {
  event.preventDefault();
  placeNote(state.placementPoint);
}

function placeNote(point) {
  const text = elements.noteText.value.replace(/\s+/g, " ").trim();
  if (!text) {
    showMessage("THE NOTE STAYED BLANK.");
    elements.noteText.focus();
    return;
  }
  queueMutation("note.create", { text, point: clampArtifactPoint(point) });
  elements.noteText.value = "";
  updateNoteCount();
  setTool("move");
}

function placeObject(point) {
  if (!objectIsAvailable()) {
    showMessage("YOU ALREADY LEFT SOMETHING HERE TODAY.");
    updateObjectAllowance();
    return;
  }
  state.objectQueued = true;
  queueMutation("object.create", {
    shape: state.shape,
    color: state.color,
    detail: state.detail,
    point: clampArtifactPoint(point),
  });
  updateObjectAllowance();
  setTool("move");
}

function setTool(tool) {
  if (!["move", "draw", "note", "object"].includes(tool)) return;
  if (tool === "object" && !objectIsAvailable()) {
    showMessage("YOU ALREADY LEFT SOMETHING HERE TODAY.");
    updateObjectAllowance();
    return;
  }
  state.tool = tool;
  elements.roomCanvas.dataset.tool = tool;
  document.querySelectorAll(".tool-button[data-tool]").forEach((button) => {
    const active = button.dataset.tool === tool;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  elements.drawOptions.hidden = tool !== "draw";
  elements.noteComposer.hidden = tool !== "note";
  elements.objectComposer.hidden = tool !== "object";
  elements.placementTarget.hidden = !["note", "object"].includes(tool);
  if (tool === "note") window.setTimeout(() => elements.noteText.focus(), 0);
  if (tool === "object") elements.roomCanvas.focus({ preventScroll: true });
  if (tool === "move" || tool === "draw") selectArtifact(null);
}

function setColor(color) {
  if (!COLORS.has(color)) return;
  state.color = color;
  document.querySelectorAll("[data-color]").forEach((button) => {
    const active = button.dataset.color === color;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function setWidth(width) {
  if (![3, 6, 10].includes(width)) return;
  state.width = width;
  document.querySelectorAll("[data-width]").forEach((button) => {
    button.setAttribute("aria-pressed", String(Number(button.dataset.width) === width));
  });
}

function setShape(shape) {
  if (!SHAPES.has(shape)) return;
  state.shape = shape;
  document.querySelectorAll("[data-shape]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.shape === shape));
  });
}

function setDetail(detail) {
  if (!OBJECT_DETAILS.has(detail)) return;
  state.detail = detail;
  document.querySelectorAll("[data-detail]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.detail === detail));
  });
}

function updatePlacementTarget() {
  elements.placementTarget.setAttribute("transform", `translate(${state.placementPoint.x} ${state.placementPoint.y})`);
}

function updateNoteCount() {
  elements.noteCount.textContent = String(elements.noteText.value.length);
}

function updateQuotaDisplay() {
  const capacity = Math.max(1, Number(state.quota.inkCapacity) || 1200);
  const ink = clamp(Number(state.quota.ink) || 0, 0, capacity);
  elements.ink.max = capacity;
  elements.ink.value = ink;
  elements.ink.textContent = String(Math.round(ink));
  elements.inkMeter.setAttribute("aria-label", `${Math.round(ink)} of ${Math.round(capacity)} ink remaining`);
  updateObjectAllowance();
}

function objectIsAvailable() {
  return !state.objectQueued && (!Number.isFinite(state.quota.lastObjectAt) || Date.now() - state.quota.lastObjectAt >= OBJECT_ALLOWANCE_MS);
}

function updateObjectAllowance() {
  const toolButton = document.querySelector('[data-tool="object"]');
  const available = objectIsAvailable();
  toolButton.disabled = !available;
  if (available) {
    elements.objectAllowance.textContent = "ONE / DAY · CLICK TO PLACE";
    toolButton.title = "Place one object";
    return;
  }
  if (state.objectQueued) {
    elements.objectAllowance.textContent = "WAITING FOR THE ROOM";
    toolButton.title = "Object is saving";
    return;
  }
  const availableAt = state.quota.lastObjectAt + OBJECT_ALLOWANCE_MS;
  const hours = Math.max(1, Math.ceil((availableAt - Date.now()) / 3_600_000));
  elements.objectAllowance.textContent = `ANOTHER ONE IN ABOUT ${hours}H`;
  toolButton.title = `Another object in about ${hours} hours`;
}

function queueMutation(type, payload, mutationId = makeMutationId()) {
  const message = { type, mutationId, payload, queuedAt: Date.now() };
  state.outbox.push(message);
  saveOutbox();
  updateSaveStatus();
  flushOutbox();
  return mutationId;
}

function flushOutbox() {
  if (!isSocketOpen()) {
    updateSaveStatus();
    return;
  }
  state.outbox.forEach((message) => {
    if (state.inFlight.has(message.mutationId)) return;
    try {
      state.socket.send(JSON.stringify(message));
      state.inFlight.add(message.mutationId);
    } catch {
      state.inFlight.delete(message.mutationId);
    }
  });
  updateSaveStatus();
}

function settleMutation(mutationId) {
  if (typeof mutationId !== "string") return;
  state.outbox = state.outbox.filter((message) => message.mutationId !== mutationId);
  state.inFlight.delete(mutationId);
  removePendingPreview(mutationId);
  saveOutbox();
  updateSaveStatus(true);
}

function loadOutbox() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(OUTBOX_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
      .filter(
        (message) =>
          message &&
          typeof message.type === "string" &&
          typeof message.mutationId === "string" &&
          message.payload &&
          typeof message.payload === "object" &&
          (!Number.isFinite(message.queuedAt) || now - message.queuedAt <= OUTBOX_RETENTION_MS),
      )
      .map((message) => ({
        ...message,
        queuedAt: Number.isFinite(message.queuedAt) ? message.queuedAt : now,
      }));
  } catch {
    return [];
  }
}

function saveOutbox() {
  try {
    if (state.outbox.length === 0) sessionStorage.removeItem(OUTBOX_KEY);
    else sessionStorage.setItem(OUTBOX_KEY, JSON.stringify(state.outbox));
  } catch {
    showMessage("THIS BROWSER WILL NOT HOLD UNSENT THINGS.");
  }
}

function updateSaveStatus(justSettled = false) {
  window.clearTimeout(state.saveTimer);
  if (state.outbox.length > 0) {
    elements.saveStatus.textContent = isSocketOpen() ? `SAVING ${state.outbox.length}` : `HELD ${state.outbox.length}`;
    return;
  }
  elements.saveStatus.textContent = justSettled ? "SAVED" : "QUIET";
  if (justSettled) {
    state.saveTimer = window.setTimeout(() => {
      elements.saveStatus.textContent = "QUIET";
    }, 1600);
  }
}

function renderPendingDrawing(mutationId, points, width, color) {
  const path = svgElement("path", {
    class: `drawing pending-drawing ink-${color}`,
    d: pointsToPath(points),
    "stroke-width": width,
    "data-pending-id": mutationId,
  });
  path.setAttribute("opacity", "0.45");
  elements.drawingsLayer.append(path);
}

function renderQueuedDrawingPreviews() {
  state.outbox.forEach((message) => {
    if (message.type !== "drawing.create") return;
    if (state.artifacts.has(`drawing_${message.mutationId}`)) return;
    if (elements.drawingsLayer.querySelector(`[data-pending-id="${safeSelector(message.mutationId)}"]`)) return;
    const points = Array.isArray(message.payload?.points) ? message.payload.points.filter(isPoint) : [];
    if (points.length < 2) return;
    renderPendingDrawing(
      message.mutationId,
      points,
      clamp(Number(message.payload.width) || 3, 1, 12),
      COLORS.has(message.payload.color) ? message.payload.color : "chalk",
    );
  });
}

function removePendingPreview(mutationId) {
  elements.drawingsLayer.querySelector(`[data-pending-id="${safeSelector(mutationId)}"]`)?.remove();
}

function removePendingPreviewForArtifact(artifact) {
  const prefix = `${artifact.kind}_`;
  if (!artifact.id.startsWith(prefix)) return;
  const mutationId = artifact.id.slice(prefix.length);
  removePendingPreview(mutationId);
  if (artifact.kind === "drawing") removeRemoteDrawingPreviewsByPreviewId(mutationId);
}

function scheduleDrawingPreview(drawing) {
  if (state.drawing !== drawing || drawing.points.length < 2 || !isSocketOpen()) return;
  const elapsed = performance.now() - drawing.lastPreviewSentAt;
  if (!drawing.previewSent || elapsed >= DRAWING_PREVIEW_INTERVAL_MS) {
    sendDrawingPreview(drawing);
    return;
  }
  if (drawing.previewTimer) return;
  drawing.previewTimer = window.setTimeout(() => {
    drawing.previewTimer = null;
    if (state.drawing === drawing) sendDrawingPreview(drawing);
  }, DRAWING_PREVIEW_INTERVAL_MS - elapsed);
}

function sendDrawingPreview(drawing) {
  if (state.drawing !== drawing || drawing.points.length < 2 || !isSocketOpen()) return;
  try {
    state.socket.send(
      JSON.stringify({
        type: "drawing.preview",
        mutationId: drawing.mutationId,
        payload: {
          points: drawing.points,
          width: drawing.width,
          color: drawing.color,
        },
      }),
    );
    drawing.previewSent = true;
    drawing.lastPreviewSentAt = performance.now();
  } catch {
    // Drawing previews are disposable. The completed stroke uses the durable outbox.
  }
}

function sendDrawingPreviewEnd(drawing) {
  if (!isSocketOpen()) return;
  try {
    state.socket.send(JSON.stringify({ type: "drawing.preview.end", mutationId: drawing.mutationId }));
  } catch {
    // Presence reconciliation and expiry also remove abandoned previews.
  }
}

function queueCursor(point) {
  if (state.drawing || !isSocketOpen()) return;
  const now = performance.now();
  const elapsed = now - state.lastCursorSentAt;
  const interval = cursorSendInterval();
  if (elapsed >= interval) {
    sendCursor(point);
    return;
  }
  state.queuedCursor = point;
  if (state.cursorSendTimer) return;
  state.cursorSendTimer = window.setTimeout(() => {
    state.cursorSendTimer = null;
    const queuedCursor = state.queuedCursor;
    state.queuedCursor = null;
    if (queuedCursor) queueCursor(queuedCursor);
  }, interval - elapsed);
}

function sendCursor(point) {
  if (state.drawing || !isSocketOpen()) return;
  state.lastCursorSentAt = performance.now();
  try {
    state.socket.send(JSON.stringify({ type: "cursor", payload: { point } }));
  } catch {
    // Presence is ephemeral. Persistent mutations remain in the outbox.
  }
}

function cursorSendInterval() {
  return Math.max(250, state.occupancy * 20);
}

function hasPendingMove(artifactId) {
  return Array.from(state.pendingArtifacts.values()).includes(artifactId);
}

function setConnection(status, label) {
  elements.connectionStatus.dataset.state = status;
  elements.connectionLabel.textContent = label;
  updateSaveStatus();
}

function setOccupancy(value) {
  const occupancy = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  state.occupancy = occupancy;
  elements.occupancyEntry.textContent = String(occupancy);
  elements.occupancyRoom.textContent = String(occupancy);
}

function togglePeoplePanel(force) {
  const open = typeof force === "boolean" ? force : elements.peoplePanel.hidden;
  elements.peoplePanel.hidden = !open;
  elements.peopleToggle.setAttribute("aria-expanded", String(open));
  if (open) renderPeople();
}

function showMessage(message) {
  window.clearTimeout(state.messageTimer);
  elements.roomMessage.textContent = String(message).toUpperCase();
  elements.roomMessage.hidden = false;
  state.messageTimer = window.setTimeout(() => {
    elements.roomMessage.hidden = true;
  }, 2800);
}

function eventPoint(event) {
  const bounds = elements.roomCanvas.getBoundingClientRect();
  return {
    x: Math.round(clamp(((event.clientX - bounds.left) / bounds.width) * ROOM_WIDTH, 0, ROOM_WIDTH) * 10) / 10,
    y: Math.round(clamp(((event.clientY - bounds.top) / bounds.height) * ROOM_HEIGHT, 0, ROOM_HEIGHT) * 10) / 10,
  };
}

function clampArtifactPoint(point) {
  return {
    x: Math.round(clamp(point.x, 40, ROOM_WIDTH - 40) * 10) / 10,
    y: Math.round(clamp(point.y, 80, ROOM_HEIGHT - 40) * 10) / 10,
  };
}

function pointsToPath(points) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x} ${points[0].y}`;
  let path = `M${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    const next = points[index + 1];
    const midpoint = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
    path += ` Q${point.x} ${point.y} ${midpoint.x} ${midpoint.y}`;
  }
  const last = points.at(-1);
  path += ` L${last.x} ${last.y}`;
  return path;
}

function wrapNoteText(value) {
  const words = value.replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let line = "";
  for (const rawWord of words) {
    const pieces = rawWord.match(/.{1,18}/g) || [];
    for (const word of pieces) {
      const next = line ? `${line} ${word}` : word;
      if (next.length <= 18) line = next;
      else {
        if (line) lines.push(line);
        line = word;
      }
      if (lines.length === 5) break;
    }
    if (lines.length === 5) break;
  }
  if (line && lines.length < 5) lines.push(line);
  if (lines.length === 5 && words.join(" ").length > lines.join(" ").length) {
    lines[4] = `${lines[4].slice(0, 16)}…`;
  }
  return lines;
}

function svgElement(name, attributes = {}, text = null) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  if (text !== null) element.textContent = text;
  return element;
}

function stableTilt(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) | 0;
  return ((Math.abs(hash) % 61) - 30) / 10;
}

function isPoint(value) {
  return value && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function distance(left, right) {
  if (!left || !right) return Infinity;
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function isSocketOpen() {
  return state.socket?.readyState === WebSocket.OPEN;
}

function makeMutationId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}

function safeSelector(value) {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, "");
}
