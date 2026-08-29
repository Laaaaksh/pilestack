import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import nock from "nock";
import { generateKeyPairSync } from "node:crypto";

// The App/installation-auth wiring reads its config from process.env at
// getGitHubApp() call time and caches the App instance module-globally, so
// each test that varies env needs a fresh module instance via
// vi.resetModules() rather than a single top-level import.
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "pkcs1", format: "pem" },
});

const APP_ID = "123456";
const WEBHOOK_SECRET = "test-webhook-secret";

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const [, payload] = jwt.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

beforeEach(() => {
  vi.resetModules();
  delete process.env.GITHUB_APP_ID;
  delete process.env.GITHUB_APP_PRIVATE_KEY;
  delete process.env.GITHUB_APP_PRIVATE_KEY_PATH;
  delete process.env.GITHUB_WEBHOOK_SECRET;
});

afterEach(() => {
  nock.cleanAll();
});

describe("getGitHubApp env validation", () => {
  it("throws when GITHUB_APP_ID is missing", async () => {
    process.env.GITHUB_APP_PRIVATE_KEY = privateKey;
    process.env.GITHUB_WEBHOOK_SECRET = WEBHOOK_SECRET;
    const { getGitHubApp } = await import("@/lib/github-app");
    expect(() => getGitHubApp()).toThrow(/GITHUB_APP_ID/);
  });

  it("throws when GITHUB_WEBHOOK_SECRET is missing", async () => {
    process.env.GITHUB_APP_ID = APP_ID;
    process.env.GITHUB_APP_PRIVATE_KEY = privateKey;
    const { getGitHubApp } = await import("@/lib/github-app");
    expect(() => getGitHubApp()).toThrow(/GITHUB_WEBHOOK_SECRET/);
  });

  it("throws when neither GITHUB_APP_PRIVATE_KEY nor _PATH is set", async () => {
    process.env.GITHUB_APP_ID = APP_ID;
    process.env.GITHUB_WEBHOOK_SECRET = WEBHOOK_SECRET;
    const { getGitHubApp } = await import("@/lib/github-app");
    expect(() => getGitHubApp()).toThrow(/GITHUB_APP_PRIVATE_KEY/);
  });
});

describe("installation authentication against a real (mocked-transport) GitHub API", () => {
  beforeEach(() => {
    process.env.GITHUB_APP_ID = APP_ID;
    process.env.GITHUB_APP_PRIVATE_KEY = privateKey;
    process.env.GITHUB_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  it("signs a real app JWT and exchanges it for an installation token", async () => {
    const { getInstallationToken } = await import("@/lib/github-app");

    let seenAuth = "";
    nock("https://api.github.com")
      .post("/app/installations/42/access_tokens")
      .reply(function () {
        seenAuth = this.req.headers["authorization"] as string;
        return [201, { token: "ghs_faketoken123", expires_at: "2099-01-01T00:00:00Z" }];
      });

    const token = await getInstallationToken(42);

    expect(token).toBe("ghs_faketoken123");
    expect(seenAuth).toMatch(/^bearer /i);
    const jwt = seenAuth.replace(/^bearer /i, "");
    expect(jwt.split(".")).toHaveLength(3); // real RS256 JWT, not a stub

    const payload = decodeJwtPayload(jwt);
    expect(payload.iss).toBe(APP_ID);
  });

  it("getInstallationOctokit returns a client authenticated with the installation token, not the app JWT", async () => {
    const { getInstallationOctokit } = await import("@/lib/github-app");

    nock("https://api.github.com")
      .post("/app/installations/42/access_tokens")
      .reply(201, { token: "ghs_faketoken123", expires_at: "2099-01-01T00:00:00Z" });

    let seenAuth = "";
    nock("https://api.github.com")
      .get("/repos/acme/widgets")
      .reply(function () {
        seenAuth = this.req.headers["authorization"] as string;
        return [200, { id: 1, full_name: "acme/widgets" }];
      });

    const octokit = await getInstallationOctokit(42);
    const { data } = await octokit.request("GET /repos/{owner}/{repo}", {
      owner: "acme",
      repo: "widgets",
    });

    expect(data.full_name).toBe("acme/widgets");
    expect(seenAuth).toBe("token ghs_faketoken123");
  });

  it("propagates a real GitHub error response instead of swallowing it", async () => {
    const { getInstallationToken } = await import("@/lib/github-app");

    nock("https://api.github.com")
      .post("/app/installations/999/access_tokens")
      .reply(404, { message: "Not Found" });

    await expect(getInstallationToken(999)).rejects.toThrow();
  });
});
