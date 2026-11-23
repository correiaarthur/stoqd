-- Escada de juros contínua: 2 pontos percentuais por parcela, começando em 4x.
--
-- A tabela anterior saltava de 0% (3x) para 4% (4x) e só depois seguia de 2 em
-- 2 — um degrau dobrado logo na primeira parcela com juros, justamente onde a
-- pessoa decide se vale a pena. Agora o passo é o mesmo do começo ao fim:
-- 3x = 0%, 4x = 2%, e daí por diante até 12x = 18%.
UPDATE "InstallmentPlan" SET "interestPercent" = 0,  "active" = true WHERE "installments" = 2;
UPDATE "InstallmentPlan" SET "interestPercent" = 0,  "active" = true WHERE "installments" = 3;
UPDATE "InstallmentPlan" SET "interestPercent" = 2,  "active" = true WHERE "installments" = 4;
UPDATE "InstallmentPlan" SET "interestPercent" = 4,  "active" = true WHERE "installments" = 5;
UPDATE "InstallmentPlan" SET "interestPercent" = 6,  "active" = true WHERE "installments" = 6;
UPDATE "InstallmentPlan" SET "interestPercent" = 8,  "active" = true WHERE "installments" = 7;
UPDATE "InstallmentPlan" SET "interestPercent" = 10, "active" = true WHERE "installments" = 8;
UPDATE "InstallmentPlan" SET "interestPercent" = 12, "active" = true WHERE "installments" = 9;
UPDATE "InstallmentPlan" SET "interestPercent" = 14, "active" = true WHERE "installments" = 10;
UPDATE "InstallmentPlan" SET "interestPercent" = 16, "active" = true WHERE "installments" = 11;
UPDATE "InstallmentPlan" SET "interestPercent" = 18, "active" = true WHERE "installments" = 12;
