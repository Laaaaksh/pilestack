import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sign } from "@octokit/webhooks-methods";
import { NextRequest } from "next/server";
import { useTestDatabase } from "./setup/test-db";

// Route Handlers are just async functions — call POST directly with a real
// NextRequest rather than spinning up a server.
let POST: typeof import("@/app/api/webhooks/github/route").POST;
let prisma: typeof import("@/lib/prisma").prisma;
let cleanupDb: () => void;

const SECRET = "test-webhook-secret";

beforeAll(async () => {
  process.env.GITHUB_WEBHOOK_SECRET = SECRET;
  const db = useTestDatabase();
  cleanupDb = db.cleanup;
  ({ POST } = await import("@/app/api/webhooks/github/route"));
  ({ prisma } = await import("@/lib/prisma"));
});

afterAll(async () => {
  await prisma.$disconnect();
  cleanupDb();
});

function makeRequest(body: string, headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/github", {
    method: "POST",
    headers,
    body,
  });
}

describe("POST /api/webhooks/github", () => {
  it("rejects a request with an invalid signature", async () => {
    const body = JSON.stringify({ action: "created", installation: { id: 1, account: { login: "x" } } });
    const res = await POST(
      makeRequest(body, {
        "x-github-event": "installation",
        "x-github-delivery": "d1",
        "x-hub-signature-256": "sha256=deadbeef",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a request missing required headers", async () => {
    const res = await POST(makeRequest("{}", {}));
    expect(res.status).toBe(400);
  });

  it("accepts a correctly signed installation event and writes it to the DB", async () => {
    const body = JSON.stringify({
      action: "created",
      installation: { id: 123, account: { login: "webhook-org", type: "Organization" } },
    });
    const signature = await sign(SECRET, body);

    const res = await POST(
      makeRequest(body, {
        "x-github-event": "installation",
        "x-github-delivery": "d2",
        "x-hub-signature-256": signature,
      }),
    );

    expect(res.status).toBe(200);
    const installation = await prisma.installation.findUnique({ where: { id: 123 } });
    expect(installation?.accountLogin).toBe("webhook-org");
  });

  it("returns 200 and does nothing for an event type it doesn't handle", async () => {
    const body = JSON.stringify({ zen: "Keep it logically awesome." });
    const signature = await sign(SECRET, body);

    const res = await POST(
      makeRequest(body, {
        "x-github-event": "ping",
        "x-github-delivery": "d3",
        "x-hub-signature-256": signature,
      }),
    );
    expect(res.status).toBe(200);
  });
});
