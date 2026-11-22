-- Índice em Reservation.expiresAt.
--
-- A limpeza de reservas vencidas apaga por `expiresAt < now()`. Sem este índice
-- o DELETE leria a tabela inteira; com ele, só as linhas vencidas.

CREATE INDEX "Reservation_expiresAt_idx" ON "Reservation"("expiresAt");
