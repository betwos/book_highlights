import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

const optionalYear = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  })
  .refine((v) => v === null || (v >= 0 && v <= 3000), { message: "Enter a plausible year." });

const optionalCount = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  })
  .refine((v) => v === null || (v > 0 && v <= 100000), { message: "Enter a plausible page count." });

/** One schema drives the form, the Server Action, and the database write. */
export const BookFormSchema = z.object({
  title: z.string().trim().min(1, "A title is required.").max(300),
  subtitle: optionalText,
  author: z.string().trim().min(1, "An author is required.").max(200),
  isbn: optionalText,
  publisher: optionalText,
  publishedYear: optionalYear,
  pageCount: optionalCount,
  notes: optionalText,
});

export type BookFormValues = z.input<typeof BookFormSchema>;
export type BookFormData = z.output<typeof BookFormSchema>;

export const HighlightFormSchema = z.object({
  text: z.string().trim().min(1, "Highlight text cannot be empty.").max(20000),
  note: optionalText,
  location: optionalText,
});
