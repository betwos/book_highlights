import Link from "next/link";
import { createBook } from "@/actions/books";
import { MetadataForm } from "@/components/metadata-form";

export default function NewBookPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Add a book</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Enter the metadata now; you can upload a cover and import highlights once it exists. Or{" "}
          <Link href="/import" className="text-[var(--accent)] underline underline-offset-4">
            import a CSV
          </Link>{" "}
          to create books from an export.
        </p>
      </div>

      <MetadataForm action={createBook} submitLabel="Create book" cancelHref="/" />
    </div>
  );
}
