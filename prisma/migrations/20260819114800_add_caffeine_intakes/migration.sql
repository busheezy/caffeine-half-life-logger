-- CreateTable
CREATE TABLE "CaffeineIntake" (
    "id" SERIAL NOT NULL,
    "label" TEXT,
    "amountMg" DOUBLE PRECISION NOT NULL,
    "consumedAt" TIMESTAMP(3) NOT NULL,
    "halfLifeHours" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaffeineIntake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaffeineIntake_consumedAt_idx" ON "CaffeineIntake"("consumedAt");
