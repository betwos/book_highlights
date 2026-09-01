export type BookMeta = {
  title: string;
  subtitle?: string | null;
  author: string;
  publishedYear?: number | null;
  isbn?: string | null;
};

export function renderBookHeader(book: BookMeta, includeIsbn = false): string {
  const lines = [`Title: ${book.title}`];
  if (book.subtitle) lines.push(`Subtitle: ${book.subtitle}`);
  lines.push(`Author: ${book.author}`);
  if (book.publishedYear) lines.push(`Published: ${book.publishedYear}`);
  if (includeIsbn && book.isbn) lines.push(`ISBN: ${book.isbn}`);
  return lines.join("\n");
}
