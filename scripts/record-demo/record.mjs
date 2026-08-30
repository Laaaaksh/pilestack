// Records the real Pilestack demo: a live dev server, a real seeded stack
// (see seed-demo.mts), driven entirely through the actual UI. No mocked
// screens, no synthetic overlays — what's on screen is what `pnpm dev`
// genuinely renders. Requires `npm run login` to have been run once first
// (see README.md) so this script starts from an already-authenticated
// session and the sign-in flow never appears on camera.
import { chromium } from "@playwright/test";
import { mkdir, readdir, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_STATE_PATH = path.join(__dirname, ".auth", "storageState.json");
const OUTPUT_DIR = path.join(__dirname, "output");
const APP_URL = process.env.DEMO_APP_URL ?? "http://localhost:3000";

const VIEWPORT = { width: 1280, height: 800 };
const beat = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    storageState: STORAGE_STATE_PATH,
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    recordVideo: { dir: OUTPUT_DIR, size: VIEWPORT },
  });

  const page = await context.newPage();

  // 1. Land on the stack list — the dependency chain is legible at a glance:
  // one card, three PRs, in order, each with live review/CI status.
  await page.goto(`${APP_URL}/stacks`);
  await page.waitForSelector("text=Stacks");
  await beat(2500);

  await page.getByRole("link", { name: /pilestack-demo-sandbox/i }).click();
  await page.waitForSelector("text=Stack comments");
  await beat(2000);

  // 2. Navigate between the stacked PRs — hover each in order so the
  // dependency chain (headRef -> baseRef) reads clearly, top to bottom.
  const prRows = page.locator('a[href*="/pull/"]');
  const rowCount = await prRows.count();
  for (let i = 0; i < rowCount; i++) {
    await prRows.nth(i).hover();
    await beat(1400);
  }

  // 3. Open the bottom PR's real diff on github.com — Pilestack hands off to
  // GitHub's own diff view rather than reimplementing one; show that handoff
  // honestly instead of staging an in-app diff viewer that doesn't exist.
  const [ghTab] = await Promise.all([
    context.waitForEvent("page"),
    prRows.first().click(),
  ]);
  await ghTab.waitForLoadState("domcontentloaded");
  await beat(1500);
  const filesTabUrl = ghTab.url().replace(/\/?$/, "/files");
  await ghTab.goto(filesTabUrl).catch(() => {});
  await beat(2500);
  await ghTab.close();
  await page.bringToFront();
  await beat(1000);

  // 4. Leave a cross-PR stack comment — one thread, visible on every PR in
  // the stack, which is the thing GitHub's own PR view has no equivalent for.
  const commentBox = page.getByPlaceholder("Comment on the whole stack…");
  await commentBox.click();
  await commentBox.pressSequentially(
    "The split makes this easy to review — approving the limiter and the wiring, holding the docs PR for a benchmark.",
    { delay: 18 },
  );
  await beat(600);
  await page.getByRole("button", { name: "Comment" }).click();
  await page.waitForSelector("text=The split makes this easy to review");
  await beat(2500);

  // 5. Restack: the bottom PR picked up a follow-up commit after the stack
  // was opened, so the branches above it are rebasing onto real new history —
  // preview the plan, confirm, and watch it reconcile.
  await page.getByRole("button", { name: "Restack" }).click();
  await page.waitForSelector("text=Restack this stack?");
  await beat(3000);

  await page.getByRole("button", { name: "Confirm restack" }).click();
  await page.waitForSelector("text=Restack succeeded", { timeout: 60_000 });
  await beat(3500);

  await context.close();
  await browser.close();

  const [rawVideo] = (await readdir(OUTPUT_DIR)).filter((f) => f.endsWith(".webm"));
  if (rawVideo) {
    await rename(path.join(OUTPUT_DIR, rawVideo), path.join(OUTPUT_DIR, "demo-raw.webm"));
    console.log(`Recording saved to ${path.join(OUTPUT_DIR, "demo-raw.webm")}`);
    console.log("Run `npm run convert` to produce docs/assets/demo.mp4 and demo.gif.");
  } else {
    console.error("No .webm recording found in output/ — something aborted before context.close().");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
