-- Reconcilia o histórico de migrations com o banco.
--
-- A coluna Customer.email e os ON DELETE CASCADE abaixo já existiam no banco e
-- no schema.prisma, mas foram aplicados por fora (db push ou SQL manual) e
-- nunca viraram migration. O histórico defasado fez o `prisma migrate dev`
-- recusar novas migrations e propor um reset destrutivo.
--
-- Esta migration descreve o estado que o banco já tem e é registrada como
-- aplicada — ela não deve alterar nada em produção.

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "email" TEXT;

-- DropForeignKey
ALTER TABLE "Sale" DROP CONSTRAINT IF EXISTS "Sale_customerId_fkey";
ALTER TABLE "SaleItem" DROP CONSTRAINT IF EXISTS "SaleItem_saleId_fkey";
ALTER TABLE "Installment" DROP CONSTRAINT IF EXISTS "Installment_saleId_fkey";

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
