"use client";

import { useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { deleteBook } from "@/actions/books";

export function DeleteBookDialog({ bookId, title }: { bookId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="danger">Delete book</Button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-lg">
          <Dialog.Title className="text-base font-medium">Delete “{title}”?</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-[var(--muted-foreground)]">
            This deletes the book, all of its highlights, and every analysis of it. It cannot be
            undone.
          </Dialog.Description>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => startTransition(() => void deleteBook(bookId))}
            >
              {pending ? "Deleting…" : "Delete permanently"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
