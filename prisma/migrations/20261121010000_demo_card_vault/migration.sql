-- DEMO CARD VAULT (metadata only).
-- This migration is additive: no existing table or row is modified or removed.
-- The table intentionally has no column for a full card number or CVV.

-- CreateTable
CREATE TABLE "DemoCard" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "expiryMonth" INTEGER NOT NULL,
    "expiryYear" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoCard_pkey" PRIMARY KEY ("id")
);

-- One demo card per user per workspace. Replacing a card updates this row.
CREATE UNIQUE INDEX "DemoCard_storeId_userId_key" ON "DemoCard"("storeId", "userId");
CREATE INDEX "DemoCard_userId_idx" ON "DemoCard"("userId");

-- AddForeignKey
ALTER TABLE "DemoCard" ADD CONSTRAINT "DemoCard_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DemoCard" ADD CONSTRAINT "DemoCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
