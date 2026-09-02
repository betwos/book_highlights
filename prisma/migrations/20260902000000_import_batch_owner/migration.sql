-- Give ImportBatch an owner, so the commit route can check that the caller owns
-- the staged rows rather than only that the batch id exists.
--
-- Additive and safe on existing rows: the column defaults to 'local', the same
-- single-user default Book and ColumnAlias carry for data created before
-- accounts existed. A batch left pending mid-flight at deploy time becomes
-- 'local' and is therefore uncommittable by a real account — staged rows are
-- swept after 24h anyway, and re-uploading the file is the recovery.

-- AlterTable
ALTER TABLE "ImportBatch" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'local';

-- CreateIndex
CREATE INDEX "ImportBatch_userId_status_createdAt_idx" ON "ImportBatch"("userId", "status", "createdAt");
