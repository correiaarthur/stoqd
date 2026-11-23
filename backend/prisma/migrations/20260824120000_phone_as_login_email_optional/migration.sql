-- O telefone passa a ser o identificador de acesso do cliente, e o e-mail vira
-- opcional: nem todo mundo tem e-mail à mão, e a loja fala por telefone.
--
-- O índice único de `email` continua valendo. O Postgres não trata NULLs como
-- valores repetidos, então várias contas sem e-mail convivem sob a mesma
-- constraint — o que ela impede é duas contas com o MESMO e-mail informado.

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
