-- CreateEnum
CREATE TYPE "LoanOutcome" AS ENUM ('RETURNED', 'LOST', 'DAMAGED');

-- CreateEnum
CREATE TYPE "FineReason" AS ENUM ('OVERDUE', 'LOST', 'DAMAGED');

-- DropIndex
DROP INDEX "Author_name_trgm_idx";

-- DropIndex
DROP INDEX "Book_title_trgm_idx";

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "blocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "blockedReason" TEXT;

-- CreateTable
CREATE TABLE "Loan" (
    "id" SERIAL NOT NULL,
    "copyId" INTEGER NOT NULL,
    "memberId" INTEGER NOT NULL,
    "loanedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "returnedAt" TIMESTAMP(3),
    "outcome" "LoanOutcome",
    "renewals" INTEGER NOT NULL DEFAULT 0,
    "loanedById" INTEGER,
    "returnedById" INTEGER,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fine" (
    "id" SERIAL NOT NULL,
    "memberId" INTEGER NOT NULL,
    "loanId" INTEGER,
    "reason" "FineReason" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT,
    "waivedAt" TIMESTAMP(3),
    "waivedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "fineId" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "receivedById" INTEGER,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Loan_memberId_idx" ON "Loan"("memberId");

-- CreateIndex
CREATE INDEX "Loan_copyId_idx" ON "Loan"("copyId");

-- CreateIndex
CREATE INDEX "Loan_dueAt_idx" ON "Loan"("dueAt");

-- CreateIndex
CREATE INDEX "Fine_memberId_idx" ON "Fine"("memberId");

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_copyId_fkey" FOREIGN KEY ("copyId") REFERENCES "Copy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fine" ADD CONSTRAINT "Fine_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fine" ADD CONSTRAINT "Fine_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_fineId_fkey" FOREIGN KEY ("fineId") REFERENCES "Fine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Een exemplaar kan maar één actieve uitleen hebben (vangnet bovenop de rij-lock in de applicatie)
CREATE UNIQUE INDEX "Loan_copyId_active_key" ON "Loan" ("copyId") WHERE "returnedAt" IS NULL;
-- Bedragen en aantallen kunnen niet negatief zijn
ALTER TABLE "Fine" ADD CONSTRAINT "Fine_amount_positive" CHECK ("amountCents" > 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amountCents" > 0);
