-- Política de juros: sem juros até 3x, e a partir de 4x uma escada de 2 pontos
-- percentuais por parcela extra (4x = 4% … 12x = 20%).
--
-- A escada é regular de propósito: quem atende consegue explicar a regra em uma
-- frase, e conferir de cabeça se o valor da parcela faz sentido. A loja ajusta
-- qualquer linha em Ajustes — isto é só o ponto de partida.
UPDATE "InstallmentPlan" SET "interestPercent" = 0,  "active" = true WHERE "installments" = 2;
UPDATE "InstallmentPlan" SET "interestPercent" = 0,  "active" = true WHERE "installments" = 3;
UPDATE "InstallmentPlan" SET "interestPercent" = 4,  "active" = true WHERE "installments" = 4;
UPDATE "InstallmentPlan" SET "interestPercent" = 6,  "active" = true WHERE "installments" = 5;
UPDATE "InstallmentPlan" SET "interestPercent" = 8,  "active" = true WHERE "installments" = 6;
UPDATE "InstallmentPlan" SET "interestPercent" = 10, "active" = true WHERE "installments" = 7;
UPDATE "InstallmentPlan" SET "interestPercent" = 12, "active" = true WHERE "installments" = 8;
UPDATE "InstallmentPlan" SET "interestPercent" = 14, "active" = true WHERE "installments" = 9;
UPDATE "InstallmentPlan" SET "interestPercent" = 16, "active" = true WHERE "installments" = 10;
UPDATE "InstallmentPlan" SET "interestPercent" = 18, "active" = true WHERE "installments" = 11;
UPDATE "InstallmentPlan" SET "interestPercent" = 20, "active" = true WHERE "installments" = 12;
