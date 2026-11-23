-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('VISTA', 'PRAZO');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('PERCENT', 'FIXED');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "couponId" INTEGER,
ADD COLUMN     "installmentsCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "paymentType" "PaymentType" NOT NULL DEFAULT 'VISTA';

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "couponId" INTEGER,
ADD COLUMN     "interest" DOUBLE PRECISION DEFAULT 0;

-- CreateTable
CREATE TABLE "Coupon" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "minimumTotal" DOUBLE PRECISION,
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentPlan" (
    "installments" INTEGER NOT NULL,
    "interestPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "InstallmentPlan_pkey" PRIMARY KEY ("installments")
);

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_code_active_idx" ON "Coupon"("code", "active");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- As opções de parcelamento precisam existir para a tela abrir com algo. Todas
-- entram com juros zero: cobrar juros é uma decisão da loja, e o sistema não
-- pode tomá-la sozinho no dia em que a migration roda. 2x fica ativo, o resto
-- inativo — assim a loja liga cada opção quando quiser.
INSERT INTO "InstallmentPlan" ("installments", "interestPercent", "active") VALUES
  (2,  0, true),
  (3,  0, false),
  (4,  0, false),
  (5,  0, false),
  (6,  0, false)
ON CONFLICT ("installments") DO NOTHING;
