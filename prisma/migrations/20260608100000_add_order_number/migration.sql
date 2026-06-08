-- Add orderNumber with a temporary default so existing rows get a value
ALTER TABLE "Order" ADD COLUMN "orderNumber" TEXT NOT NULL DEFAULT '';

-- Backfill existing rows with a unique short code
UPDATE "Order" SET "orderNumber" = UPPER(SUBSTRING(MD5(id::text || RANDOM()::text), 1, 8)) WHERE "orderNumber" = '';

-- Remove the default (new rows will get value from app code)
ALTER TABLE "Order" ALTER COLUMN "orderNumber" DROP DEFAULT;

-- Add unique constraint
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
