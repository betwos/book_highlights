import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUserId } from "@/lib/user";
import { updateBook } from "@/actions/books";
import { MetadataForm } from "@/components/metadata-form";
import { CoverUploader } from "@/components/cover-uploader";
import { DeleteBookDialog } from "@/components/delete-book-dialog";

export default async function EditBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const book = await prisma.book.findFirst({ where: { id, userId: currentUserId() } });
  if (!book) notFound();

  const action = updateBook.bind(null, book.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Edit book</h1>
        <p className="text-sm text-[var(--muted-foreground)]">{book.title}</p>
      </div>

      <div className="grid gap-8 md:grid-cols-[16rem_1fr]">
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Cover</h2>
          <CoverUploader bookId={book.id} coverUrl={book.coverUrl} />
        </div>

        <div className="space-y-8">
          <MetadataForm
            action={action}
            values={book}
            submitLabel="Save changes"
            cancelHref={`/books/${book.id}`}
          />

          <div className="space-y-2 border-t border-[var(--border)] pt-6">
            <h2 className="text-sm font-medium">Danger zone</h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              Deleting the book removes its highlights and analyses too.
            </p>
            <DeleteBookDialog bookId={book.id} title={book.title} />
          </div>
        </div>
      </div>
    </div>
  );
}
