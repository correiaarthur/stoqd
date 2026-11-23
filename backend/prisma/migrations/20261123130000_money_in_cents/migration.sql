-- Dinheiro em centavos inteiros.
--
-- `Float` guarda 0,1 + 0,2 como 0,30000000000000004: a soma das parcelas deixava
-- de bater com o total por um centavo, e o SUM do banco acumulava o erro. Um
-- inteiro não tem esse problema. O código continua falando em reais — quem
-- converte é a extensão do Prisma (`lib/moneyColumns.ts`).
--
-- Conversão: ROUND(valor::numeric * 100). O cast para `numeric` primeiro importa:
-- `numeric` arredonda metade para longe do zero e lê o `double` com 15 dígitos
-- significativos, então 5.9 vira 590 e não 589 (5.9 * 100 em ponto flutuante dá
-- 590.0000000000001, mas 1.005 * 100 dá 100.49999999999999). Estoura se algum valor
-- passar de R$ 21 milhões (limite do INTEGER): a migração aborta em vez de gravar
-- um número errado.
--
-- Fora da conversão, de propósito: Product.averageCost (média ponderada, que pode
-- ter fração de centavo) e InstallmentPlan.interestPercent (uma taxa).
--
-- Coupon.value guarda percentual OU valor fixo na mesma coluna: ambos em
-- centésimos (10% = 1000, R$ 5,00 = 500), a mesma conversão por 100.
--
-- Os DEFAULT saem antes da troca de tipo e voltam depois: o Postgres não converte
-- o default de `double precision` para `integer` sozinho.
--
-- Para desfazer: ALTER COLUMN ... TYPE DOUBLE PRECISION USING (col::numeric / 100),
-- coluna a coluna, e voltar o schema.prisma.

-- Product
ALTER TABLE "Product" ALTER COLUMN "sellingPrice" DROP DEFAULT;
ALTER TABLE "Product" ALTER COLUMN "sellingPrice" TYPE INTEGER USING ROUND("sellingPrice"::numeric * 100)::INTEGER;
ALTER TABLE "Product" ALTER COLUMN "sellingPrice" SET DEFAULT 0;
ALTER TABLE "Product" ALTER COLUMN "promotionalPrice" TYPE INTEGER USING ROUND("promotionalPrice"::numeric * 100)::INTEGER;

-- Sale
ALTER TABLE "Sale" ALTER COLUMN "total" TYPE INTEGER USING ROUND("total"::numeric * 100)::INTEGER;
ALTER TABLE "Sale" ALTER COLUMN "discount" DROP DEFAULT;
ALTER TABLE "Sale" ALTER COLUMN "discount" TYPE INTEGER USING ROUND("discount"::numeric * 100)::INTEGER;
ALTER TABLE "Sale" ALTER COLUMN "discount" SET DEFAULT 0;
ALTER TABLE "Sale" ALTER COLUMN "interest" DROP DEFAULT;
ALTER TABLE "Sale" ALTER COLUMN "interest" TYPE INTEGER USING ROUND("interest"::numeric * 100)::INTEGER;
ALTER TABLE "Sale" ALTER COLUMN "interest" SET DEFAULT 0;

-- SaleItem, OrderItem, Installment
ALTER TABLE "SaleItem" ALTER COLUMN "unitPrice" TYPE INTEGER USING ROUND("unitPrice"::numeric * 100)::INTEGER;
ALTER TABLE "OrderItem" ALTER COLUMN "unitPrice" TYPE INTEGER USING ROUND("unitPrice"::numeric * 100)::INTEGER;
ALTER TABLE "Installment" ALTER COLUMN "value" TYPE INTEGER USING ROUND("value"::numeric * 100)::INTEGER;

-- Coupon
ALTER TABLE "Coupon" ALTER COLUMN "value" TYPE INTEGER USING ROUND("value"::numeric * 100)::INTEGER;
ALTER TABLE "Coupon" ALTER COLUMN "minimumTotal" TYPE INTEGER USING ROUND("minimumTotal"::numeric * 100)::INTEGER;
