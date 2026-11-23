-- Versão da sessão do cliente, para revogar tokens.
--
-- Até aqui um token valia até expirar (1 dia), mesmo depois de a senha ser
-- trocada ou a conta apagada. Agora o token leva a versão com que foi emitido e o
-- servidor a compara com esta coluna: trocar a senha incrementa, e os tokens
-- antigos deixam de valer na hora.
--
-- DEFAULT 0 e NOT NULL: as contas existentes entram na versão 0, e o token
-- emitido antes desta coluna (sem versão) vale como 0 — ninguém é deslogado no
-- deploy, mas a primeira troca de senha já o revoga.

ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
