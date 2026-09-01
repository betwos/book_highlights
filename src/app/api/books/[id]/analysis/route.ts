import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId } from "@/lib/user";
import { currentHighlightSetHash, MODEL, PROMPT_VERSION } from "@/lib/analysis";
import { runAnalysis } from "@/lib/ai/run";

export const maxDuration = 300;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const force = new URL(req.url).searchParams.get("force") === "1";

  const book = await prisma.book.findFirst({
    where: { id, userId: currentUserId() },
    select: { id: true },
  });
  if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

  const { hash, count } = await currentHighlightSetHash(book.id);
  if (count === 0) {
    return NextResponse.json({ error: "This book has no highlights yet." }, { status: 400 });
  }

  if (!force) {
    const cached = await prisma.analysis.findFirst({
      where: {
        bookId: book.id,
        status: "succeeded",
        highlightSetHash: hash,
        promptVersion: PROMPT_VERSION,
        model: MODEL,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (cached) return NextResponse.json({ analysisId: cached.id, cached: true });
  }

  const analysis = await prisma.analysis.create({
    data: {
      bookId: book.id,
      status: "queued",
      model: MODEL,
      promptVersion: PROMPT_VERSION,
      highlightSetHash: hash,
      highlightCount: count,
    },
    select: { id: true },
  });

  after(() => runAnalysis(analysis.id));

  return NextResponse.json({ analysisId: analysis.id, cached: false }, { status: 202 });
}
