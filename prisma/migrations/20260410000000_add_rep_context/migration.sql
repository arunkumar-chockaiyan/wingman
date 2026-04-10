-- AlterTable: add sales-rep authored context columns to CallSession
ALTER TABLE "CallSession" ADD COLUMN "repNotes"        TEXT;
ALTER TABLE "CallSession" ADD COLUMN "repLinks"        TEXT;
ALTER TABLE "CallSession" ADD COLUMN "repInstructions" TEXT;
