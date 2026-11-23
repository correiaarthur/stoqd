-- O parcelamento passa a ir até 12x. As linhas de 7x a 12x nascem sem juros e
-- ativas, para aparecerem no dropdown desde já; a loja ajusta a taxa ou
-- desliga o que não quiser em Ajustes.
--
-- ON CONFLICT DO NOTHING: quem já tinha alguma dessas linhas configuradas
-- mantém a própria taxa.
INSERT INTO "InstallmentPlan" ("installments", "interestPercent", "active") VALUES
  (7,  0, true),
  (8,  0, true),
  (9,  0, true),
  (10, 0, true),
  (11, 0, true),
  (12, 0, true)
ON CONFLICT ("installments") DO NOTHING;
