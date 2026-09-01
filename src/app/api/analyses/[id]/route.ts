import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId } from "@/lib/user";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const analysis = await prisma.analysis.findFirst({
    where: { id, book: { userId: currentUserId() } },
    select: {
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
    },
  });

  if (!analysis) return NextResponse.json({ error: "Analysis not found." }, { status: 404 });

  return NextResponse.json(analysis);
}
