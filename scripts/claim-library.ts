/**
 * Move pre-account data to a registered account.
 *
 * Books, highlights and remembered column aliases created before accounts
 * existed carry userId "local" (SPEC 4.10's single-user default). Once queries
 * scope by a real account id, that data is simply invisible — it is not deleted,
 * just unowned. This hands it to whoever asks for it.
 *
 *   npx tsx scripts/claim-library.ts reader@example.com
 *
 * Idempotent: running it twice moves nothing the second time.
 */
import { PrismaClient } from "@prisma/client";
// Not from src/lib/user: that imports Auth.js and next/server, which a plain
// tsx script has no reason to load and cannot resolve without the app running.
import { LOCAL_USER_ID } from "../src/lib/auth-constants";
import { normalizeEmail } from "../src/lib/accounts";

const prisma = new PrismaClient();

async function main() {
  const email = normalizeEmail(process.argv[2] ?? "");
  if (!email) {
    console.error("Usage: npx tsx scripts/claim-library.ts <email>");
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (!user) {
    console.error(`No account for ${email}. Sign up first, then run this again.`);
    process.exitCode = 1;
    return;
  }

  // ColumnAlias is unique on (userId, headerKey), so an alias the target account
  // has already learned cannot be moved onto it. Keep theirs and skip ours.
  const taken = await prisma.columnAlias.findMany({
    where: { userId: user.id },
    select: { headerKey: true },
  });
  const takenKeys = taken.map((a) => a.headerKey);

  const [books, aliases] = await prisma.$transaction([
    prisma.book.updateMany({ where: { userId: LOCAL_USER_ID }, data: { userId: user.id } }),
    prisma.columnAlias.updateMany({
      where: { userId: LOCAL_USER_ID, headerKey: { notIn: takenKeys } },
      data: { userId: user.id },
    }),
  ]);

  const skipped = await prisma.columnAlias.count({ where: { userId: LOCAL_USER_ID } });

  // Highlights and analyses follow their book; only Book and ColumnAlias carry userId.
  console.info(`Moved ${books.count} book(s) and ${aliases.count} column alias(es) to ${email}.`);
  if (skipped > 0) {
    console.info(`Left ${skipped} alias(es) behind — that account already had those headers.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
