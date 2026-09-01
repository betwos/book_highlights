-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('pending', 'committed', 'discarded');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "Book" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL DEFAULT 'local',
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "author" TEXT NOT NULL,
    "isbn" TEXT,
    "publisher" TEXT,
    "publishedYear" INTEGER,
    "pageCount" INTEGER,
    "coverUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Highlight" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "note" TEXT,
    "location" TEXT,
    "locationType" TEXT,
    "color" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "highlightedAt" TIMESTAMP(3),
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "contentHash" TEXT NOT NULL,
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Highlight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "mapping" JSONB NOT NULL,
    "stagedRows" JSONB,
    "status" "ImportStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'queued',
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "highlightSetHash" TEXT NOT NULL,
    "highlightCount" INTEGER NOT NULL,
    "takeaways" JSONB,
    "chapters" JSONB,
    "chaptersMeta" JSONB,
    "error" TEXT,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "cachedTokensRead" INTEGER,
    "costCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Book_userId_updatedAt_idx" ON "Book"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Highlight_bookId_orderIndex_idx" ON "Highlight"("bookId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Highlight_bookId_contentHash_key" ON "Highlight"("bookId", "contentHash");

-- CreateIndex
CREATE INDEX "Analysis_bookId_createdAt_idx" ON "Analysis"("bookId", "createdAt");

-- CreateIndex
CREATE INDEX "Analysis_bookId_highlightSetHash_promptVersion_model_idx" ON "Analysis"("bookId", "highlightSetHash", "promptVersion", "model");

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

