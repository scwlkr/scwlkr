import { expect, test } from "@playwright/test";

test("presents the personal site and all selected work", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/scwlkr — I build whatever/);
  await expect(page.getByRole("heading", { level: 1, name: "scwlkr" })).toBeAttached();
  await expect(page.getByText("I build whatever", { exact: true })).toBeVisible();
  await expect(page.locator("[data-project]")).toHaveCount(6);

  const projects = ["OpenJob", "WalkLang", "LocalHub", "UQIQ", "Vampyre", "paletteWOW"];
  for (const project of projects) {
    await expect(page.getByRole("heading", { level: 3, name: project })).toBeAttached();
  }

  await expect(page.getByRole("link", { name: /See every rabbit hole/ })).toHaveAttribute(
    "href",
    "https://github.com/scwlkr?tab=repositories",
  );
});

test("color signal is interactive and keyboard accessible", async ({ page }) => {
  await page.goto("/");

  const toggle = page.getByRole("button", { name: "Change the site color signal" });
  await toggle.focus();
  await expect(toggle).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.locator("html")).toHaveAttribute("data-palette", "orange");
  await expect(page.locator("#palette-status")).toHaveText("Flare signal active.");
});

test("layout stays inside the viewport", async ({ page }) => {
  await page.goto("/");
  await page.locator("#about").scrollIntoViewIfNeeded();

  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));

  expect(layout.content).toBeLessThanOrEqual(layout.viewport + 1);
  await expect(page.locator("#about")).toBeVisible();
});

test("reduced motion keeps the page readable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await expect(page.locator(".hero-name")).toBeVisible();
  await expect(page.locator(".reveal").first()).toHaveCSS("opacity", "1");
});

test("the complete page remains usable without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 2, name: /No niche/ })).toBeVisible();
  await expect(page.locator("[data-project]")).toHaveCount(6);
  await expect(page.getByRole("heading", { level: 2, name: /Curiosity with/ })).toBeVisible();

  await context.close();
});

test("project names fit at the 320px support boundary", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");

  const bounds = await page.locator("[data-project]").evaluateAll((projects) => projects.map((project) => {
    const card = project.getBoundingClientRect();
    const title = project.querySelector("h3")?.getBoundingClientRect();
    return {
      name: project.querySelector("h3")?.textContent,
      fits: Boolean(title && title.left >= card.left && title.right <= card.right + 1),
    };
  }));

  expect(bounds.filter((project) => !project.fits)).toEqual([]);
});
