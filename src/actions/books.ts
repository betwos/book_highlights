"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUserId, requireSession } from "@/lib/user";
import { deleteImage } from "@/lib/storage";
import { BookFormSchema } from "@/lib/schemas/book";

export type ActionState = { error?: string; fieldErrors?: Record<string, string[]> };

function readForm(formData: FormData) {
  return BookFormSchema.safeParse({
    title: formData.get("title") ?? "",
    subtitle: formData.get("subtitle") ?? "",
    author: formData.get("author") ?? "",
    isbn: formData.get("isbn") ?? "",
    publisher: formData.get("publisher") ?? "",
    publishedYear: formData.get("publishedYear") ?? "",
    pageCount: formData.get("pageCount") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

export async function createBook(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession();

  const parsed = readForm(formData);
  if (!parsed.success) {
    return { error: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const book = await prisma.book.create({
    data: { ...parsed.data, userId: await currentUserId() },
    select: { id: true },
  });

  revalidatePath("/");
  redirect(`/books/${book.id}`);
}

export async function updateBook(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const parsed = readForm(formData);
  if (!parsed.success) {
    return { error: "Check the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const existing = await prisma.book.findFirst({
    where: { id, userId: await currentUserId() },
    select: { id: true },
  });
  if (!existing) return { error: "Book not found." };

  await prisma.book.update({ where: { id: existing.id }, data: parsed.data });

  revalidatePath("/");
  revalidatePath(`/books/${id}`);
  redirect(`/books/${id}`);
}

export async function deleteBook(id: string): Promise<void> {
  await requireSession();

  const book = await prisma.book.findFirst({
    where: { id, userId: await currentUserId() },
    select: { id: true, coverUrl: true },
  });
  if (!book) return;

  // Cascades to highlights and analyses.
  await prisma.book.delete({ where: { id: book.id } });
  if (book.coverUrl) await deleteImage(book.coverUrl);

  revalidatePath("/");
  redirect("/");
}
