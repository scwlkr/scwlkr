import { expect, test, type Page } from "@playwright/test";

const ways = [
  { name: "wlkr.si", href: "https://wlkr.si" },
  { name: "x", href: "https://x.com/scwlkr" },
  { name: "instagram", href: "https://instagram.com/scwlkr_" },
];

// The live version only runs where WebGL2 does; everywhere else the plain version is the site.
async function settle(page: Page): Promise<boolean> {
  await page.waitForFunction(() => {
    const root = document.documentElement;
    return Boolean(root.dataset.view) || !root.classList.contains("live");
  });
  return page.evaluate(() => document.documentElement.classList.contains("live"));
}

test("presents scwlkr and exactly three ways out", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("scwlkr");
  await expect(page.getByRole("heading", { level: 1, name: "scwlkr" })).toBeAttached();
  await expect(page.locator("a")).toHaveCount(ways.length);

  for (const way of ways) {
    await expect(page.locator(`a[href="${way.href}"]`)).toHaveText(way.name);
  }
});

test("publishes the complete scwlkr favicon package", async ({ page, request }) => {
  await page.goto("/");

  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute("href", "/favicon.svg");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/apple-touch-icon.png");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/site.webmanifest");

  for (const asset of [
    "/favicon.svg",
    "/favicon.ico",
    "/apple-touch-icon.png",
    "/icon-192.png",
    "/icon-512.png",
    "/site.webmanifest",
    "/wordmark.svg",
    "/og.png",
    "/fonts/inter-800.woff2",
  ]) {
    const response = await request.get(asset);
    expect(response.ok(), asset).toBeTruthy();
    expect(response.headers()["content-type"], asset).not.toContain("text/html");
  }
});

test("reduced motion gets the plain version", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  expect(await settle(page)).toBe(false);
  await expect(page.getByRole("img", { name: "scwlkr" })).toBeVisible();
  for (const way of ways) {
    await expect(page.locator(`a[href="${way.href}"]`)).toBeVisible();
  }
});

test("the page is complete without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");

  await expect(page.getByRole("img", { name: "scwlkr" })).toBeVisible();
  for (const way of ways) {
    await expect(page.locator(`a[href="${way.href}"]`)).toBeVisible();
  }

  await context.close();
});

test("nothing overflows at the 320px support boundary", async ({ page }) => {
  for (const reducedMotion of ["reduce", "no-preference"] as const) {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/");
    await settle(page);

    const layout = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(layout.content, reducedMotion).toBeLessThanOrEqual(layout.viewport + 1);
  }
});

test("the live version is driven by keys alone", async ({ page }) => {
  await page.goto("/");
  test.skip(!(await settle(page)), "WebGL2 is unavailable here, so the plain version is served");

  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-view", "scwlkr");

  await page.keyboard.press("ArrowDown");
  await expect(root).toHaveAttribute("data-view", "mark");

  await page.keyboard.press("End");
  await expect(root).toHaveAttribute("data-view", "instagram");
  await expect(page.locator("#out a.on")).toHaveAttribute("href", "https://instagram.com/scwlkr_");

  await page.keyboard.press("ArrowDown");
  await expect(root).toHaveAttribute("data-view", "scwlkr");
  await expect(page.locator("#out a.on")).toHaveCount(0);
});

test("typing is the search box", async ({ page }) => {
  await page.goto("/");
  test.skip(!(await settle(page)), "WebGL2 is unavailable here, so the plain version is served");

  const root = page.locator("html");
  await page.keyboard.press("w");
  await page.keyboard.press("l");
  await expect(root).toHaveClass(/typing/);

  await page.keyboard.press("Enter");
  await expect(root).toHaveAttribute("data-view", "wlkr.si");
  await expect(root).not.toHaveClass(/typing/);
  await expect(page.locator("#out a.on")).toHaveAttribute("href", "https://wlkr.si");

  await page.keyboard.press("h");
  await page.keyboard.press("i");
  await expect(root).toHaveClass(/typing/);
  await page.keyboard.press("Escape");
  await expect(root).not.toHaveClass(/typing/);
  await expect(root).toHaveAttribute("data-view", "wlkr.si");
});

test("keyboard focus brings its destination on stage", async ({ page }) => {
  await page.goto("/");
  test.skip(!(await settle(page)), "WebGL2 is unavailable here, so the plain version is served");

  const x = page.locator('a[href="https://x.com/scwlkr"]');
  await x.focus();
  await expect(page.locator("html")).toHaveAttribute("data-view", "x");
  await expect(x).toHaveClass(/on/);

  const box = await x.boundingBox();
  expect(box && box.width > 40 && box.height > 40, "the focused link covers the word on screen").toBeTruthy();
});

test("a link can carry a greeting", async ({ page }) => {
  await page.goto("/#hey_jake");
  test.skip(!(await settle(page)), "WebGL2 is unavailable here, so the plain version is served");

  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-say", "hey jake");
  await expect(root).toHaveAttribute("data-mode", "say");
});

test("typed commands open the clock and the sand", async ({ page }) => {
  await page.goto("/");
  test.skip(!(await settle(page)), "WebGL2 is unavailable here, so the plain version is served");

  const root = page.locator("html");
  for (const key of ["t", "i", "Enter"]) await page.keyboard.press(key);
  await expect(root).toHaveAttribute("data-mode", "clock");
  await page.keyboard.press("Escape");
  await expect(root).not.toHaveAttribute("data-mode", "clock");

  for (const key of ["s", "a", "Enter"]) await page.keyboard.press(key);
  await expect(root).toHaveAttribute("data-mode", "sand");
  await page.keyboard.press("ArrowDown");
  await expect(root).not.toHaveAttribute("data-mode", "sand");
  await expect(root).toHaveAttribute("data-view", "scwlkr");
});

test("a sideways drag types on a phone", async ({ page }) => {
  await page.goto("/");
  test.skip(!(await settle(page)), "WebGL2 is unavailable here, so the plain version is served");

  await page.evaluate(() => {
    const fire = (type: string, x: number, y: number) => window.dispatchEvent(
      new PointerEvent(type, { pointerType: "touch", clientX: x, clientY: y, button: 0, bubbles: true }),
    );
    const x = window.innerWidth * 0.5;
    fire("pointerdown", x - 60, 300);
    fire("pointermove", x - 30, 301);
    fire("pointermove", x, 302);
    fire("pointerup", x, 302);
  });
  await expect(page.locator("html")).toHaveClass(/typing/);
});

test("a finger that rests before dragging still types", async ({ page }) => {
  await page.goto("/");
  test.skip(!(await settle(page)), "WebGL2 is unavailable here, so the plain version is served");

  await page.evaluate(async () => {
    const fire = (type: string, x: number, y: number) => window.dispatchEvent(
      new PointerEvent(type, { pointerType: "touch", clientX: x, clientY: y, button: 0, bubbles: true }),
    );
    const x = window.innerWidth * 0.5;
    fire("pointerdown", x - 60, 300);
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    fire("pointermove", x - 30, 301);
    fire("pointermove", x, 302);
    fire("pointerup", x, 302);
  });
  const root = page.locator("html");
  await expect(root).toHaveClass(/typing/);
  await expect(root).not.toHaveClass(/hold/);
});

test("anything else gets a one-sentence reply from the in-browser model", async ({ page }) => {
  await page.goto("/");
  test.skip(!(await settle(page)), "WebGL2 is unavailable here, so the plain version is served");

  for (const key of ["h", "e", "l", "l", "o", "Enter"]) await page.keyboard.press(key);
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-say", /\S{2,}/, { timeout: 20_000 });
  await expect(root).toHaveAttribute("data-mode", "say");
});
