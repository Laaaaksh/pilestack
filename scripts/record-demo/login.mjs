// One-time, interactive: opens a real, visible browser so a human can sign
// in to GitHub and approve the OAuth consent screen themselves — this repo
// has no dev-mode auth bypass, and the demo must never fabricate one.
// record.mjs then loads the storageState this produces and starts already
// authenticated, so the sign-in flow never appears in the recorded video.
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, ".auth");
const STORAGE_STATE_PATH = path.join(AUTH_DIR, "storageState.json");
const APP_URL = process.env.DEMO_APP_URL ?? "http://localhost:3000";

await mkdir(AUTH_DIR, { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

await page.goto(APP_URL);

console.log("\nA browser window has opened.");
console.log("Sign in with GitHub and approve the OAuth consent screen there.");
console.log("This step is interactive by design and is never recorded.\n");
console.log(`Waiting for ${APP_URL}/stacks ...`);

await page.waitForURL(`${APP_URL}/stacks`, { timeout: 5 * 60 * 1000 });

await context.storageState({ path: STORAGE_STATE_PATH });
console.log(`\nSigned in. Session saved to ${STORAGE_STATE_PATH}`);
console.log("record.mjs will reuse it, so the recording starts already authenticated.");

await browser.close();
