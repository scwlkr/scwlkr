import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

async function enterRoom(page: Page): Promise<string> {
  await page.goto("/");
  await expect(page.locator("#entry-screen")).toBeVisible();
  await page.getByRole("button", { name: "ENTER", exact: true }).click();
  await expect(page.locator("#room-screen")).toBeVisible();
  await expect(page.locator("#connection-label")).toHaveText("CONNECTED");
  await expect(page.locator("#identity")).not.toHaveText("ANONYMOUS");
  return (await page.locator("#identity").textContent())?.trim() ?? "";
}

async function artifactIds(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).evaluateAll((elements) =>
    elements.flatMap((element) => {
      const id = element.getAttribute("data-artifact-id");
      return id ? [id] : [];
    }),
  );
}

async function closeContexts(...contexts: BrowserContext[]): Promise<void> {
  await Promise.allSettled(contexts.map((context) => context.close()));
}

test("two isolated visitors share one persistent, recoverable room", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const noteText = `note ${unique}`;
  const recoveredText = `held ${unique}`;

  try {
    const [identityA] = await Promise.all([enterRoom(pageA), enterRoom(pageB)]);
    await expect(pageA.locator("#occupancy-room")).toHaveText("2");
    await expect(pageB.locator("#occupancy-room")).toHaveText("2");

    await pageA.locator('[data-tool="note"]').click();
    await pageA.locator("#note-text").fill(noteText);
    await pageA.locator("#note-form").getByRole("button", { name: "DROP HERE" }).click();
    const noteA = pageA.getByLabel(`Shared note: ${noteText}`, { exact: true });
    const noteB = pageB.getByLabel(`Shared note: ${noteText}`, { exact: true });
    await expect(noteA).toHaveCount(1);
    await expect(noteB).toHaveCount(1);
    await expect(pageA.locator("#save-status")).toHaveText(/SAVED|QUIET/);

    const drawingsBefore = await pageB.locator(".artifact-drawing").count();
    await pageA.locator('[data-tool="draw"]').click();
    const canvasBox = await pageA.locator("#room-canvas").boundingBox();
    expect(canvasBox).not.toBeNull();
    if (!canvasBox) throw new Error("Room canvas has no bounds");
    await pageA.mouse.move(canvasBox.x + canvasBox.width * 0.25, canvasBox.y + canvasBox.height * 0.35);
    await pageA.mouse.down();
    await pageA.mouse.move(canvasBox.x + canvasBox.width * 0.42, canvasBox.y + canvasBox.height * 0.45, {
      steps: 8,
    });
    await expect(pageB.locator(".live-drawing-preview")).toHaveCount(1);
    await pageA.mouse.move(canvasBox.x + canvasBox.width * 0.4, canvasBox.y + canvasBox.height * 0.4, {
      steps: 4,
    });
    await pageA.mouse.up();
    await expect(pageB.locator(".artifact-drawing")).toHaveCount(drawingsBefore + 1);
    await expect(pageB.locator(".live-drawing-preview")).toHaveCount(0);

    await pageB.locator("#people-toggle").click();
    const visitorA = pageB.locator("#people-list li").filter({ hasText: identityA });
    await visitorA.getByRole("button", { name: "MUTE", exact: true }).click();
    await expect(visitorA.getByRole("button", { name: "UNMUTE", exact: true })).toBeVisible();
    const mutedLightState = await pageB.locator("#light-switch").getAttribute("aria-pressed");
    await pageA.locator("#light-switch").click();
    await expect(pageA.locator("#light-switch")).toHaveAttribute(
      "aria-pressed",
      mutedLightState === "true" ? "false" : "true",
    );
    await expect(pageB.locator("#light-switch")).toHaveAttribute("aria-pressed", mutedLightState ?? "true");

    await pageA.mouse.move(canvasBox.x + canvasBox.width * 0.55, canvasBox.y + canvasBox.height * 0.3);
    await pageA.mouse.down();
    await pageA.mouse.move(canvasBox.x + canvasBox.width * 0.7, canvasBox.y + canvasBox.height * 0.38, {
      steps: 8,
    });
    await pageA.waitForTimeout(350);
    await expect(pageB.locator(".live-drawing-preview")).toHaveCount(0);
    await pageA.mouse.up();
    await expect(pageA.locator(".artifact-drawing")).toHaveCount(drawingsBefore + 2);
    await expect(pageB.locator(".artifact-drawing")).toHaveCount(drawingsBefore + 1);
    await visitorA.getByRole("button", { name: "UNMUTE", exact: true }).click();
    await expect(pageB.locator(".artifact-drawing")).toHaveCount(drawingsBefore + 2);
    await expect(pageB.locator("#light-switch")).toHaveAttribute(
      "aria-pressed",
      mutedLightState === "true" ? "false" : "true",
    );
    await pageB.locator("#people-close").click();

    const existingObjects = new Set(await artifactIds(pageB, ".artifact-object"));
    await pageB.locator('[data-tool="object"]').click();
    await pageB.getByRole("button", { name: "PLANT", exact: true }).click();
    await pageB.getByRole("button", { name: "Sky object", exact: true }).click();
    await pageB.getByRole("button", { name: "EYE", exact: true }).click();
    const objectCanvasBox = await pageB.locator("#room-canvas").boundingBox();
    expect(objectCanvasBox).not.toBeNull();
    if (!objectCanvasBox) throw new Error("Room canvas has no bounds");
    await pageB.mouse.click(objectCanvasBox.x + objectCanvasBox.width * 0.68, objectCanvasBox.y + objectCanvasBox.height * 0.68);
    await expect
      .poll(async () => (await artifactIds(pageA, ".artifact-object")).filter((id) => !existingObjects.has(id)))
      .toHaveLength(1);
    const objectId = (await artifactIds(pageA, ".artifact-object")).find((id) => !existingObjects.has(id));
    expect(objectId).toBeTruthy();
    if (!objectId) throw new Error("New shared object is missing");

    const objectA = pageA.locator(`[data-artifact-id="${objectId}"]`);
    const objectB = pageB.locator(`[data-artifact-id="${objectId}"]`);
    await expect(objectA).toHaveAttribute("data-object-detail", "eye");
    await expect(objectA).toHaveClass(/ink-sky/);
    await expect(objectA).toHaveAccessibleName(/sky plant with eye detail/i);
    await pageA.locator('[data-tool="move"]').click();
    const initialObjectTransform = await objectA.getAttribute("transform");
    const objectBox = await objectA.boundingBox();
    expect(objectBox).not.toBeNull();
    if (!objectBox) throw new Error("Shared object has no bounds");
    await pageA.mouse.move(objectBox.x + objectBox.width / 2, objectBox.y + objectBox.height / 2);
    await pageA.mouse.down();
    await pageA.mouse.move(objectBox.x + objectBox.width / 2 - 90, objectBox.y + objectBox.height / 2 - 45, {
      steps: 5,
    });
    await pageA.mouse.up();
    await expect
      .poll(async () => {
        const [left, right] = await Promise.all([
          objectA.getAttribute("transform"),
          objectB.getAttribute("transform"),
        ]);
        return left === right && left !== initialObjectTransform;
      })
      .toBe(true);

    const movedTransform = await objectA.getAttribute("transform");
    await objectA.click();
    await expect(pageA.locator("#rotate-artifact")).toBeVisible();
    await pageA.locator("#rotate-artifact").click();
    await expect
      .poll(async () => {
        const [left, right] = await Promise.all([
          objectA.getAttribute("transform"),
          objectB.getAttribute("transform"),
        ]);
        return left === right && left !== movedTransform && left?.includes("rotate(15)");
      })
      .toBe(true);

    const topArtifactId = (page: Page) =>
      page.locator("#artifacts-layer").evaluate((layer) => layer.lastElementChild?.getAttribute("data-artifact-id"));
    await expect.poll(() => topArtifactId(pageA)).toBe(objectId);
    await expect.poll(() => topArtifactId(pageB)).toBe(objectId);
    await pageA.reload();
    const repeatedIdentity = await enterRoom(pageA);
    expect(repeatedIdentity).toBe(identityA);
    await expect.poll(() => topArtifactId(pageA)).toBe(objectId);
    await expect(objectA).toHaveAttribute("data-object-detail", "eye");
    await expect(objectA).toHaveClass(/ink-sky/);
    await expect(objectA).toHaveAttribute("transform", /rotate\(15\)/);

    const convergedTransform = await objectA.getAttribute("transform");
    const [conflictBoxA, conflictBoxB] = await Promise.all([objectA.boundingBox(), objectB.boundingBox()]);
    expect(conflictBoxA).not.toBeNull();
    expect(conflictBoxB).not.toBeNull();
    if (!conflictBoxA || !conflictBoxB) throw new Error("Concurrent object bounds are missing");
    await Promise.all([
      pageA.mouse.move(conflictBoxA.x + conflictBoxA.width / 2, conflictBoxA.y + conflictBoxA.height / 2),
      pageB.mouse.move(conflictBoxB.x + conflictBoxB.width / 2, conflictBoxB.y + conflictBoxB.height / 2),
    ]);
    await Promise.all([pageA.mouse.down(), pageB.mouse.down()]);
    await Promise.all([
      pageA.mouse.move(conflictBoxA.x + conflictBoxA.width / 2 + 80, conflictBoxA.y + conflictBoxA.height / 2, {
        steps: 4,
      }),
      pageB.mouse.move(conflictBoxB.x + conflictBoxB.width / 2 - 80, conflictBoxB.y + conflictBoxB.height / 2, {
        steps: 4,
      }),
    ]);
    await Promise.all([pageA.mouse.up(), pageB.mouse.up()]);
    await expect
      .poll(async () => {
        const [left, right] = await Promise.all([
          objectA.getAttribute("transform"),
          objectB.getAttribute("transform"),
        ]);
        return left === right && left !== convergedTransform;
      })
      .toBe(true);

    const initialLight = await pageB.locator("#light-switch").getAttribute("aria-pressed");
    await pageA.waitForTimeout(1500);
    await pageA.locator("#light-switch").click();
    await expect(pageB.locator("#light-switch")).toHaveAttribute(
      "aria-pressed",
      initialLight === "true" ? "false" : "true",
    );

    const reportsBefore = await pageA.evaluate(async () => {
      const response = await fetch("/api/health", { cache: "no-store" });
      const body = (await response.json()) as { reports: number };
      return body.reports;
    });
    await noteA.focus();
    await pageA.keyboard.press("Enter");
    await pageA.locator("#report-artifact").click();
    await expect(pageA.locator("#report-dialog")).toBeVisible();
    await pageA.locator("#report-form").getByRole("button", { name: "REPORT", exact: true }).click();
    await expect
      .poll(() =>
        pageA.evaluate(async () => {
          const response = await fetch("/api/health", { cache: "no-store" });
          const body = (await response.json()) as { reports: number };
          return body.reports;
        }),
      )
      .toBe(reportsBefore + 1);

    const noteId = await noteA.getAttribute("data-artifact-id");
    expect(noteId).toBeTruthy();
    if (!noteId) throw new Error("Reported note ID is missing");
    const moderatorToken = process.env.E2E_MODERATOR_TOKEN ?? (process.env.E2E_BASE_URL ? null : "e2e-moderator-token");
    if (moderatorToken) {
      const quarantine = await pageA.request.post(new URL("/api/moderation/quarantine", pageA.url()).toString(), {
        headers: { Authorization: `Bearer ${moderatorToken}` },
        data: { artifactId: noteId },
      });
      expect(quarantine.ok()).toBe(true);
      await expect(noteA).toHaveCount(0);
      await expect(noteB).toHaveCount(0);

      const restore = await pageA.request.post(new URL("/api/moderation/restore", pageA.url()).toString(), {
        headers: { Authorization: `Bearer ${moderatorToken}` },
        data: { artifactId: noteId },
      });
      expect(restore.ok()).toBe(true);
      await expect(pageA.getByLabel(`Shared note: ${noteText}`, { exact: true })).toHaveCount(1);
      await expect(pageB.getByLabel(`Shared note: ${noteText}`, { exact: true })).toHaveCount(1);
    }

    await pageA.reload();
    await enterRoom(pageA);
    await expect(pageA.getByLabel(`Shared note: ${noteText}`, { exact: true })).toHaveCount(1);

    const siblingTab = await contextB.newPage();
    await siblingTab.goto("/");
    await contextB.setOffline(true);
    await expect(pageB.locator("#connection-label")).toHaveText("OFFLINE");
    await pageB.locator('[data-tool="note"]').click();
    await pageB.locator("#note-text").fill(recoveredText);
    await pageB.locator("#note-form").getByRole("button", { name: "DROP HERE" }).click();
    await expect(pageB.locator("#save-status")).toHaveText("HELD 1");
    expect(await siblingTab.evaluate(() => sessionStorage.getItem("room_1.outbox.v1"))).toBeNull();
    await contextB.setOffline(false);
    await pageB.reload();
    await enterRoom(pageB);
    await expect(pageB.locator('[data-tool="object"]')).toBeDisabled();
    await expect(pageA.getByLabel(`Shared note: ${recoveredText}`, { exact: true })).toHaveCount(1);
    await expect(pageB.getByLabel(`Shared note: ${recoveredText}`, { exact: true })).toHaveCount(1);
    await siblingTab.close();

    await contextB.close();
    await expect(pageA.locator("#occupancy-room")).toHaveText("1");
  } finally {
    await closeContexts(contextA, contextB);
  }
});

test("narrow touch and reduced-motion visitors can use core controls", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  try {
    await page.goto("/");
    await page.getByRole("button", { name: "ENTER", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#connection-label")).toHaveText("CONNECTED");
    const session = await context.newCDPSession(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await expect(page.locator("html")).toHaveClass(/low-effects/);
    expect(await page.locator(".hanging-light").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");

    const text = `touch ${Date.now().toString(36)}`;
    await page.locator('[data-tool="note"]').focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#note-composer")).toBeVisible();
    await page.locator("#note-composer [data-close-composer]").click();
    await expect(page.locator("#note-composer")).toBeHidden();
    await page.locator('[data-tool="note"]').click();
    await page.locator("#note-text").fill(text);
    const noteBox = await page.locator("#room-canvas").boundingBox();
    expect(noteBox).not.toBeNull();
    if (!noteBox) throw new Error("Mobile room canvas has no bounds");
    const notePoint = { x: noteBox.x + noteBox.width * 0.5, y: noteBox.y + noteBox.height * 0.3 };
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [notePoint] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(page.getByLabel(`Shared note: ${text}`, { exact: true })).toHaveCount(1);

    const drawingsBefore = await page.locator(".artifact-drawing").count();
    await page.locator('[data-tool="draw"]').click();
    const box = await page.locator("#room-canvas").boundingBox();
    expect(box).not.toBeNull();
    if (!box) throw new Error("Mobile room canvas has no bounds");
    const start = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.45 };
    const end = { x: box.x + box.width * 0.62, y: box.y + box.height * 0.55 };
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [start] });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }],
    });
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [end] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(page.locator(".artifact-drawing")).toHaveCount(drawingsBefore + 1);

    const objectsBefore = await page.locator(".artifact-object").count();
    await page.locator('[data-tool="object"]').click();
    const objectPlacement = await page.locator("#room-canvas").evaluate((canvas) => {
      const bounds = canvas.getBoundingClientRect();
      for (const [xRatio, yRatio] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.7], [0.8, 0.7]] as const) {
        const point = { x: bounds.left + bounds.width * xRatio, y: bounds.top + bounds.height * yRatio };
        const hit = document.elementFromPoint(point.x, point.y);
        if (hit && (hit === canvas || canvas.contains(hit))) return point;
      }
      throw new Error("No unobstructed mobile room point");
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [objectPlacement],
    });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(page.locator(".artifact-object")).toHaveCount(objectsBefore + 1);
    const object = page.locator(".artifact-object").last();
    const objectTransform = await object.getAttribute("transform");
    const objectBox = await object.boundingBox();
    expect(objectBox).not.toBeNull();
    if (!objectBox) throw new Error("Mobile object has no bounds");
    const objectStart = { x: objectBox.x + objectBox.width / 2, y: objectBox.y + objectBox.height / 2 };
    const objectEnd = { x: objectStart.x - 55, y: objectStart.y - 35 };
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [objectStart] });
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [objectEnd] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => object.getAttribute("transform")).not.toBe(objectTransform);

    const pressed = await page.locator("#light-switch").getAttribute("aria-pressed");
    await page.locator("#light-switch").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#light-switch")).toHaveAttribute("aria-pressed", pressed === "true" ? "false" : "true");
  } finally {
    await context.close();
  }
});

test("a cluttered room keeps the core keyboard path bounded", async ({ page }) => {
  const now = Date.now();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, get: () => 2 });
  });
  const artifacts = Array.from({ length: 1500 }, (_, index) => {
    const common = {
      id: `seed_${String(index).padStart(4, "0")}`,
      createdAt: now - (1500 - index) * 60_000,
      updatedAt: now - (1500 - index) * 30_000,
      revision: 1,
      zIndex: index + 1,
      lifecycle: "active",
    };
    const point = { x: 60 + (index % 30) * 30, y: 90 + (index % 18) * 28 };
    if (index % 3 === 0) {
      return { ...common, kind: "drawing", payload: { points: [point, { x: point.x + 12, y: point.y + 8 }], width: 3, color: "chalk" } };
    }
    if (index % 3 === 1) {
      return { ...common, kind: "note", payload: { point, text: `old scratch ${index}` } };
    }
    return { ...common, kind: "object", payload: { point, shape: "crate", color: "rust", detail: "plain", rotation: 0 } };
  });
  const fixture = { id: "light", state: "on", revision: 1, updatedAt: now };

  await page.route("**/api/occupancy", (route) => route.fulfill({ json: { occupancy: 0 } }));
  await page.route("**/api/session", (route) => route.fulfill({ status: 201, json: { displayName: "QUIET MOTH 50" } }));
  await page.routeWebSocket("**/ws", (socket) => {
    socket.onMessage((raw) => {
      const message = JSON.parse(String(raw)) as { type?: string; mutationId?: string; payload?: Record<string, unknown> };
      if (message.type === "ping") {
        socket.send(JSON.stringify({ type: "pong" }));
        return;
      }
      if (message.type === "note.create" && typeof message.mutationId === "string") {
        const artifact = {
          id: `note_${message.mutationId}`,
          kind: "note",
          createdAt: now + 1,
          updatedAt: now + 1,
          revision: 1,
          zIndex: 1501,
          lifecycle: "active",
          payload: message.payload,
        };
        socket.send(JSON.stringify({
          type: "mutation.result",
          mutationId: message.mutationId,
          ok: true,
          event: { type: "artifact.upsert", artifact },
        }));
        return;
      }
      if (message.type === "fixture.toggle" && typeof message.mutationId === "string") {
        fixture.state = fixture.state === "on" ? "off" : "on";
        fixture.revision += 1;
        fixture.updatedAt = Date.now();
        socket.send(JSON.stringify({
          type: "mutation.result",
          mutationId: message.mutationId,
          ok: true,
          event: { type: "fixture.updated", fixture },
        }));
      }
    });
    setTimeout(() => {
      socket.send(JSON.stringify({
        type: "room.snapshot",
        room: "ROOM_1",
        occupancy: 1,
        presence: [{ presenceId: "self-50", displayName: "QUIET MOTH 50", joinedAt: now }],
        self: { presenceId: "self-50", displayName: "QUIET MOTH 50" },
        artifacts,
        fixtures: [fixture],
        quota: { ink: 1200, inkCapacity: 1200, lastObjectAt: null },
      }));
    }, 0);
  });

  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/low-effects/);
  await page.getByRole("button", { name: "ENTER", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#connection-label")).toHaveText("CONNECTED");
  await expect(page.locator(".artifact")).toHaveCount(1500);
  await expect(page.locator('[data-artifact-id][tabindex="0"]')).toHaveCount(1);

  await page.locator("#room-canvas").focus();
  for (let index = 0; index < 6; index += 1) {
    if (await page.evaluate(() => document.activeElement?.getAttribute("data-tool") === "note")) break;
    await page.keyboard.press("Tab");
  }
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-tool"))).toBe("note");
  expect(
    await page.locator('[data-tool="note"]').evaluate((element) => {
      const style = getComputedStyle(element);
      return element.matches(":focus-visible") && style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2;
    }),
  ).toBe(true);
  await page.keyboard.press("Enter");
  await page.locator("#note-text").fill("still reachable");
  await page.keyboard.press("Control+Enter");
  await expect(page.getByLabel("Shared note: still reachable", { exact: true })).toHaveCount(1);
  await expect(page.locator('[data-artifact-id][tabindex="0"]')).toHaveCount(1);

  await page.locator("#light-switch").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#light-switch")).toHaveAttribute("aria-pressed", "false");
});
