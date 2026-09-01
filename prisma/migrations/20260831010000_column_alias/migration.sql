-- CreateTable
CREATE TABLE "ColumnAlias" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL DEFAULT 'local',
    "headerKey" TEXT NOT NULL,
    "headerSample" TEXT NOT NULL,
    "field" TEXT,
    "source" TEXT NOT NULL,
    "timesSeen" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ColumnAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ColumnAlias_userId_headerKey_key" ON "ColumnAlias"("userId", "headerKey");
