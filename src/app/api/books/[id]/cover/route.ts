import { NextResponse } from "next/server";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { currentUserId, unauthorized } from "@/lib/user";
import { saveImage, deleteImage } from "@/lib/storage";
import { revalidatePath } from "next/cache";

export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await unauthorized();
  if (denied) return denied;

  const { id } = await ctx.params;

  const book = await prisma.book.findFirst({
    where: { id, userId: await currentUserId() },
    select: { id: true, coverUrl: true },
  });
  if (!book) return NextResponse.json({ error: "Book not found." }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was uploaded." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Cover images must be under 5 MB." }, { status: 400 });
  }
  if (!ACCEPTED.includes(file.type)) {
    return NextResponse.json({ error: "Use a JPEG, PNG, or WebP image." }, { status: 400 });
  }

  let processed: Buffer;
  try {
    processed = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: 600, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "That image could not be processed." }, { status: 400 });
  }

  const { url } = await saveImage(processed, "webp");
  const previous = book.coverUrl;

  await prisma.book.update({ where: { id: book.id }, data: { coverUrl: url } });
  if (previous && previous !== url) await deleteImage(previous);

  revalidatePath("/");
  revalidatePath(`/books/${book.id}`);

  return NextResponse.json({ coverUrl: url });
}
