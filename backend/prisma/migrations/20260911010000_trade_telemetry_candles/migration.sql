-- Apply manually in Supabase BEFORE deploying 2.4.19. Idempotent; assumes no migration history.
ALTER TABLE "Trade" ADD COLUMN IF NOT EXISTS "meta" JSONB;
CREATE TABLE IF NOT EXISTS "TradeEvent" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "type" TEXT NOT NULL,
  "reason" TEXT,
  "pair" TEXT,
  "amount" DOUBLE PRECISION,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TradeEvent_userId_createdAt_idx" ON "TradeEvent"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "TradeEvent_type_createdAt_idx" ON "TradeEvent"("type", "createdAt");
CREATE TABLE IF NOT EXISTS "MarketCandle" (
  "pair" TEXT NOT NULL,
  "periodSec" INTEGER NOT NULL,
  "time" INTEGER NOT NULL,
  "open" DOUBLE PRECISION NOT NULL,
  "high" DOUBLE PRECISION NOT NULL,
  "low" DOUBLE PRECISION NOT NULL,
  "close" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "MarketCandle_pkey" PRIMARY KEY ("pair", "periodSec", "time")
);
CREATE INDEX IF NOT EXISTS "MarketCandle_time_idx" ON "MarketCandle"("time");
-- Every existing public table has RLS on and anon holds no grants; match it.
-- No policies: the backend's privileged role bypasses RLS.
ALTER TABLE "TradeEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MarketCandle" ENABLE ROW LEVEL SECURITY;
