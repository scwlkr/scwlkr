import { describe, expect, it } from "vitest";
import {
  INK_CAPACITY,
  OBJECT_ALLOWANCE_MS,
  clampArtifactPosition,
  mayCreateObject,
  normalizeNote,
  normalizePoint,
  normalizeStroke,
  refillInk,
  spendInk,
  strokeInkCost,
} from "../src/domain";

describe("room domain rules", () => {
  it("bounds every accepted point to the room", () => {
    expect(normalizePoint({ x: -100, y: 800 })).toEqual({ x: 0, y: 640 });
    expect(clampArtifactPosition({ x: 0, y: 0 })).toEqual({ x: 40, y: 80 });
  });

  it("keeps notes short, plain, and non-empty", () => {
    expect(normalizeNote("  hello\nroom  ")).toBe("hello room");
    expect(normalizeNote(" ")).toBeNull();
    expect(normalizeNote("x".repeat(141))).toBeNull();
  });

  it("rejects malformed and oversized strokes", () => {
    expect(normalizeStroke([{ x: 1, y: 2 }])).toBeNull();
    expect(normalizeStroke([{ x: 1, y: 2 }, { x: 1, y: 2 }])).toBeNull();
    expect(normalizeStroke(Array.from({ length: 81 }, () => ({ x: 1, y: 2 })))).toBeNull();
    expect(normalizeStroke([{ x: 1, y: 2 }, { x: 4, y: 6 }])).toHaveLength(2);
  });

  it("charges wider and longer strokes more ink", () => {
    const points = [{ x: 0, y: 0 }, { x: 30, y: 40 }];
    expect(strokeInkCost(points, 8)).toBeGreaterThan(strokeInkCost(points, 1));
  });

  it("refills ink without exceeding capacity", () => {
    expect(refillInk({ balance: 10, updatedAt: 0 }, 2_000).balance).toBe(11);
    expect(refillInk({ balance: INK_CAPACITY, updatedAt: 0 }, 2_000).balance).toBe(INK_CAPACITY);
    expect(spendInk({ balance: 2, updatedAt: 0 }, 3, 0)).toBeNull();
  });

  it("enforces one object per rolling day", () => {
    expect(mayCreateObject(null, 0)).toBe(true);
    expect(mayCreateObject(0, OBJECT_ALLOWANCE_MS - 1)).toBe(false);
    expect(mayCreateObject(0, OBJECT_ALLOWANCE_MS)).toBe(true);
  });
});
