-- CreateEnum
CREATE TYPE "CallSentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateTable
CREATE TABLE "CallSummary" (
    "id"            TEXT NOT NULL,
    "callSessionId" TEXT NOT NULL,
    "outcome"       TEXT,
    "sentiment"     "CallSentiment" NOT NULL DEFAULT 'NEUTRAL',
    "keyTopics"     JSONB,
    "actionItems"   JSONB,
    "notes"         TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CallSummary_callSessionId_key" ON "CallSummary"("callSessionId");

-- CreateIndex
CREATE INDEX "CallSummary_callSessionId_idx" ON "CallSummary"("callSessionId");

-- AddForeignKey
ALTER TABLE "CallSummary" ADD CONSTRAINT "CallSummary_callSessionId_fkey"
    FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
