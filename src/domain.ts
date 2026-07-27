export const ROOM_NAME = "ROOM_1";
export const ROOM_WIDTH = 1000;
export const ROOM_HEIGHT = 640;
export const NOTE_MAX_LENGTH = 140;
export const STROKE_MAX_POINTS = 80;
export const INK_CAPACITY = 1200;
export const INK_REFILL_PER_SECOND = 0.5;
export const OBJECT_ALLOWANCE_MS = 24 * 60 * 60 * 1000;

export interface Point {
  x: number;
  y: number;
}

export interface InkState {
  balance: number;
  updatedAt: number;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function normalizePoint(value: unknown): Point | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) return null;

  return {
    x: Math.round(clamp(candidate.x as number, 0, ROOM_WIDTH) * 10) / 10,
    y: Math.round(clamp(candidate.y as number, 0, ROOM_HEIGHT) * 10) / 10,
  };
}

export function normalizeNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized || normalized.length > NOTE_MAX_LENGTH) return null;
  return normalized;
}

export function normalizeToken(value: unknown): string | null {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{20,80}$/.test(value)) {
    return null;
  }
  return value;
}

export function normalizeDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[^a-zA-Z0-9 _-]/g, "").trim().slice(0, 36);
  return normalized || null;
}

export function normalizeMutationId(value: unknown): string | null {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{12,80}$/.test(value)) {
    return null;
  }
  return value;
}

export function normalizeStroke(value: unknown): Point[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > STROKE_MAX_POINTS) {
    return null;
  }

  const points = value.map(normalizePoint);
  if (points.some((point) => point === null)) return null;
  const normalized = points as Point[];
  const hasLength = normalized.some((point, index) => {
    const previous = normalized[index - 1];
    return previous ? Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.5 : false;
  });
  return hasLength ? normalized : null;
}

export function strokeInkCost(points: Point[], width: number): number {
  let distance = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (!previous || !current) continue;
    distance += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return Math.max(1, Math.ceil(distance * clamp(width, 1, 12) * 0.08));
}

export function refillInk(state: InkState | null, now: number): InkState {
  if (!state) return { balance: INK_CAPACITY, updatedAt: now };
  const elapsedSeconds = Math.max(0, now - state.updatedAt) / 1000;
  return {
    balance: Math.min(INK_CAPACITY, state.balance + elapsedSeconds * INK_REFILL_PER_SECOND),
    updatedAt: now,
  };
}

export function spendInk(state: InkState | null, cost: number, now: number): InkState | null {
  const refilled = refillInk(state, now);
  if (cost > refilled.balance) return null;
  return { balance: refilled.balance - cost, updatedAt: now };
}

export function mayCreateObject(lastCreatedAt: number | null, now: number): boolean {
  return lastCreatedAt === null || now - lastCreatedAt >= OBJECT_ALLOWANCE_MS;
}

export function clampArtifactPosition(point: Point): Point {
  return {
    x: clamp(point.x, 40, ROOM_WIDTH - 40),
    y: clamp(point.y, 80, ROOM_HEIGHT - 40),
  };
}
