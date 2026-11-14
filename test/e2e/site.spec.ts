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
    await expect(page.getByRole("link", { name: way.name, exact: true })).toHaveAttribute("href", way.href);
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
    await expect(page.getByRole("link", { name: way.name, exact: true })).toBeVisible();
  }
});

test("the page is complete without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");

  await expect(page.getByRole("img", { name: "scwlkr" })).toBeVisible();
  for (const way of ways) {
    await expect(page.getByRole("link", { name: way.name, exact: true })).toBeVisible();
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

  const x = page.getByRole("link", { name: "x", exact: true });
  await x.focus();
  await expect(page.locator("html")).toHaveAttribute("data-view", "x");
  await expect(x).toHaveClass(/on/);

  const box = await x.boundingBox();
  expect(box && box.width > 40 && box.height > 40, "the focused link covers the word on screen").toBeTruthy();
});
