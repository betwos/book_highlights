import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

export type StoredImage = { url: string };

type Driver = "local" | "blob";

function driver(): Driver {
  return process.env.STORAGE_DRIVER === "blob" ? "blob" : "local";
}

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

/** Callers pass an already-processed buffer; `sharp` lives in the route handler. */
export async function saveImage(buffer: Buffer, ext: string): Promise<StoredImage> {
  const clean = ext.replace(/^\./, "").toLowerCase() || "webp";
  const name = `${randomUUID()}.${clean}`;

  if (driver() === "blob") {
    const { put } = await import("@vercel/blob");
    const res = await put(`covers/${name}`, buffer, {
      access: "public",
      contentType: `image/${clean === "jpg" ? "jpeg" : clean}`,
    });
    return { url: res.url };
  }

  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, name), buffer);
  return { url: `/uploads/${name}` };
}

export async function deleteImage(url: string): Promise<void> {
  if (!url) return;

  if (url.startsWith("/uploads/")) {
    const name = path.basename(url);
    await unlink(path.join(UPLOAD_DIR, name)).catch(() => undefined);
    return;
  }

  if (driver() === "blob" && /^https?:\/\//.test(url)) {
    const { del } = await import("@vercel/blob");
    await del(url).catch(() => undefined);
  }
}
