-- Keep AI-assisted CSV column-matching usage with its staged import.
-- Nullable so existing batches and imports that needed no model call remain unchanged.
ALTER TABLE "ImportBatch" ADD COLUMN "mappingUsage" JSONB;
