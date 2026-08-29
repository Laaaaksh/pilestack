import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { canAccessStack } from "@/lib/data";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({ body: z.string().trim().min(1).max(4000) });

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/stacks/[stackId]/comments">,
) {
  const { stackId } = await ctx.params;
  const session = await auth();
  if (!session?.githubAccessToken || !session.githubLogin) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { allowed } = await canAccessStack(stackId, session.githubAccessToken);
  if (!allowed) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const comment = await prisma.stackComment.create({
    data: {
      stackId,
      authorLogin: session.githubLogin,
      authorAvatarUrl: session.user?.image ?? null,
      body: parsed.data.body,
    },
  });

  return NextResponse.json({ comment }, { status: 201 });
}
