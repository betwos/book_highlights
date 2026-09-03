-- Ownership for staged imports. Without it the commit route can only check that
-- a batch id exists, which lets any signed-in account commit another account's
-- staged rows into its own books.
--
-- Additive: existing batches take 'local', matching the userId that Book,
-- Highlight and ColumnAlias rows created before accounts already carry.

-- AlterTable
ALTER TABLE "ImportBatch" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'local';

-- CreateIndex
CREATE INDEX "ImportBatch_userId_status_createdAt_idx" ON "ImportBatch"("userId", "status", "createdAt");
