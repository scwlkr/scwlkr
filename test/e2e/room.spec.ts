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
    await pageA.mouse.up();
    await expect(pageB.locator(".artifact-drawing")).toHaveCount(drawingsBefore + 1);

    const existingObjects = new Set(await artifactIds(pageB, ".artifact-object"));
    await pageB.locator('[data-tool="object"]').click();
    await pageB.getByRole("button", { name: "PLANT", exact: true }).click();
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

    const initialLight = await pageB.locator("#light-switch").getAttribute("aria-pressed");
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
    await noteA.click();
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
    const repeatedIdentity = await enterRoom(pageA);
    expect(repeatedIdentity).toBe(identityA);
    await expect(pageA.getByLabel(`Shared note: ${noteText}`, { exact: true })).toHaveCount(1);

    await contextB.setOffline(true);
    await expect(pageB.locator("#connection-label")).toHaveText("OFFLINE");
    await pageB.locator('[data-tool="note"]').click();
    await pageB.locator("#note-text").fill(recoveredText);
    await pageB.locator("#note-form").getByRole("button", { name: "DROP HERE" }).click();
    await expect(pageB.locator("#save-status")).toHaveText("HELD 1");
    await contextB.setOffline(false);
    await pageB.reload();
    await enterRoom(pageB);
    await expect(pageA.getByLabel(`Shared note: ${recoveredText}`, { exact: true })).toHaveCount(1);
    await expect(pageB.getByLabel(`Shared note: ${recoveredText}`, { exact: true })).toHaveCount(1);

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
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(
      ["0.001ms", "1e-06s"].includes(
        await page.locator(".hanging-light").evaluate((element) => getComputedStyle(element).animationDuration),
      ),
    ).toBe(true);

    const text = `keys ${Date.now().toString(36)}`;
    await page.locator('[data-tool="note"]').focus();
    await page.keyboard.press("Enter");
    await page.locator("#note-text").fill(text);
    await page.keyboard.press("Control+Enter");
    await expect(page.getByLabel(`Shared note: ${text}`, { exact: true })).toHaveCount(1);

    const drawingsBefore = await page.locator(".artifact-drawing").count();
    await page.locator('[data-tool="draw"]').click();
    const box = await page.locator("#room-canvas").boundingBox();
    expect(box).not.toBeNull();
    if (!box) throw new Error("Mobile room canvas has no bounds");
    const session = await context.newCDPSession(page);
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

    const pressed = await page.locator("#light-switch").getAttribute("aria-pressed");
    await page.locator("#light-switch").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#light-switch")).toHaveAttribute("aria-pressed", pressed === "true" ? "false" : "true");
  } finally {
    await context.close();
  }
});
