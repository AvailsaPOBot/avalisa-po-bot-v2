-- Funnel analytics — FunnelEvent table + enable flag.
--
-- HOW TO APPLY (Board / operator, one-time):
--   Run this in the Supabase SQL Editor. NEVER `prisma migrate` from Render
--   (hard rail: Supabase SQL only). This is additive and non-destructive —
--   it creates one new table + indexes and sets one AppConfig flag.
--
-- Until this runs AND the flag is 'true', the shipped backend code is fully
-- inert: recordFunnelEvent() no-ops and GET /api/admin/funnel returns empty.
--
-- Column types mirror the Prisma model in backend/prisma/schema.prisma
-- (id is app-generated cuid → TEXT, no DB default needed).

CREATE TABLE IF NOT EXISTS "FunnelEvent" (
  "id"        TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "userId"    TEXT,
  "meta"      JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FunnelEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FunnelEvent_type_createdAt_idx" ON "FunnelEvent" ("type", "createdAt");
CREATE INDEX IF NOT EXISTS "FunnelEvent_userId_idx" ON "FunnelEvent" ("userId");

-- Match the 8/8 RLS hardening on this project (backend connects as the table
-- owner via DATABASE_URL and is not subject to RLS; the Data API stays locked).
ALTER TABLE "FunnelEvent" ENABLE ROW LEVEL SECURITY;

-- Turn collection ON (flip 'true' → 'false' to pause without a deploy):
INSERT INTO "AppConfig" ("key", "value", "updatedAt")
VALUES ('funnel_analytics_enabled', 'true', now())
ON CONFLICT ("key") DO UPDATE SET "value" = 'true', "updatedAt" = now();
