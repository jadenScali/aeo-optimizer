-- CreateTable
CREATE TABLE "AiReferrerDailyStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "AiReferrerDailyStat_shop_day_idx" ON "AiReferrerDailyStat"("shop", "day");

-- CreateIndex
CREATE UNIQUE INDEX "AiReferrerDailyStat_shop_day_platform_key" ON "AiReferrerDailyStat"("shop", "day", "platform");
