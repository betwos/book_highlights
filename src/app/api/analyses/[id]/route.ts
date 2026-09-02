import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, unauthorized } from "@/lib/user";

const FIELDS = {
  id: true,
  status: true,
  takeaways: true,
  chapters: true,
  chaptersMeta: true,
  error: true,
  costCents: true,
  highlightSetHash: true,
  createdAt: true,
  completedAt: true,
} as const;

/**
 * How long an analysis may sit unfinished before we call it dead.
 *
 * The job runs inside the request function via `after()` (SPEC 4.6), not on a
 * durable queue, so a platform timeout kills the process outright: the catch-all
 * in `run.ts` never fires and the row would stay `running` forever. SPEC 14's
 * "no unhandled rejection leaves an analysis stuck in running" does not cover
 * this — a hard kill is not a rejection. `queued` is swept too, for the case
 * where the process died before `after()` ever ran.
 *
 * Comfortably beyond this route's `maxDuration = 300`.
 */
const STALL_TIMEOUT_MS = 10 * 60 * 1000;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await unauthorized();
  if (denied) return denied;

  const { id } = await ctx.params;

  const analysis = await prisma.analysis.findFirst({
    where: { id, book: { userId: await currentUserId() } },
    select: FIELDS,
  });

  if (!analysis) return NextResponse.json({ error: "Analysis not found." }, { status: 404 });

  const unfinished = analysis.status === "running" || analysis.status === "queued";
  const stalled = Date.now() - analysis.createdAt.getTime() > STALL_TIMEOUT_MS;

  if (unfinished && stalled) {
    // The poll loop in analysis-panel.tsx already renders `failed` with a retry.
    const swept = await prisma.analysis.update({
      where: { id: analysis.id },
      data: {
        status: "failed",
        error: "The run stopped before it finished. Try generating again.",
        completedAt: new Date(),
      },
      select: FIELDS,
    });

    return NextResponse.json(swept);
  }

  return NextResponse.json(analysis);
}
