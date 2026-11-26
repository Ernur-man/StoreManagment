-- Arrival email notifications (transactional outbox).
-- This migration is additive: it adds two nullable/defaulted request columns
-- and one new table. No existing row is deleted or overwritten.

-- AlterTable
ALTER TABLE "CustomerRequest" ADD COLUMN "email" TEXT;
ALTER TABLE "CustomerRequest" ADD COLUMN "emailLanguage" TEXT NOT NULL DEFAULT 'en';

-- CreateTable
CREATE TABLE "ArrivalEmailNotification" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "arrivalId" TEXT NOT NULL,
    "arrivalItemId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "emailLanguage" TEXT NOT NULL DEFAULT 'en',
    "productName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),

    CONSTRAINT "ArrivalEmailNotification_pkey" PRIMARY KEY ("id")
);

-- Database-level idempotency for one arrival notification per request.
CREATE UNIQUE INDEX "ArrivalEmailNotification_arrivalId_requestId_key" ON "ArrivalEmailNotification"("arrivalId", "requestId");
CREATE INDEX "ArrivalEmailNotification_storeId_createdAt_idx" ON "ArrivalEmailNotification"("storeId", "createdAt");
CREATE INDEX "ArrivalEmailNotification_storeId_status_idx" ON "ArrivalEmailNotification"("storeId", "status");
CREATE INDEX "ArrivalEmailNotification_requestId_idx" ON "ArrivalEmailNotification"("requestId");

-- AddForeignKey
ALTER TABLE "ArrivalEmailNotification" ADD CONSTRAINT "ArrivalEmailNotification_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArrivalEmailNotification" ADD CONSTRAINT "ArrivalEmailNotification_arrivalId_fkey" FOREIGN KEY ("arrivalId") REFERENCES "StockArrival"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArrivalEmailNotification" ADD CONSTRAINT "ArrivalEmailNotification_arrivalItemId_fkey" FOREIGN KEY ("arrivalItemId") REFERENCES "StockArrivalItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArrivalEmailNotification" ADD CONSTRAINT "ArrivalEmailNotification_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CustomerRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
