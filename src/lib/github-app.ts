import { App } from "@octokit/app";
import { readFileSync } from "node:fs";

/**
 * The GitHub App client, built directly on `@octokit/app` — the same
 * authentication (JWT + installation tokens) and webhook-signature-verification
 * primitives Probot itself wraps. Using them directly, instead of Probot's own
 * server/CLI layer, keeps Pilestack a single Next.js process: one `next start`,
 * no second long-running service a self-hoster has to babysit.
 */
let cachedApp: App | null = null;

function loadPrivateKey(): string {
  const inline = process.env.GITHUB_APP_PRIVATE_KEY;
  if (inline) return inline.replace(/\\n/g, "\n");

  const path = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
  if (path) return readFileSync(path, "utf8");

  throw new Error(
    "Set GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH — see .env.example.",
  );
}

export function getGitHubApp(): App {
  if (cachedApp) return cachedApp;

  const appId = process.env.GITHUB_APP_ID;
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!appId || !webhookSecret) {
    throw new Error(
      "GITHUB_APP_ID and GITHUB_WEBHOOK_SECRET must be set — see .env.example.",
    );
  }

  cachedApp = new App({
    appId,
    privateKey: loadPrivateKey(),
    webhooks: { secret: webhookSecret },
  });
  return cachedApp;
}

/** Octokit authenticated as the app's installation on a given repository. */
export async function getInstallationOctokit(installationId: number) {
  const app = getGitHubApp();
  return app.getInstallationOctokit(installationId);
}

/** An installation access token, for git operations that need a plain credential. */
export async function getInstallationToken(installationId: number): Promise<string> {
  const app = getGitHubApp();
  const { data } = await app.octokit.request(
    "POST /app/installations/{installation_id}/access_tokens",
    { installation_id: installationId },
  );
  return data.token;
}
