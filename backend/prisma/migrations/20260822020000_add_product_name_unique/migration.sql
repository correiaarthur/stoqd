-- O schema.prisma declara Product.name como @unique desde o commit 67bc7f3,
-- mas a constraint nunca chegou ao banco. Sem ela, o findUnique por nome usado
-- no cadastro de produtos (que decide entre criar e somar estoque) apoiava-se
-- numa unicidade inexistente, e dois nomes chegaram a duplicar.
--
-- Os duplicados foram consolidados por src/scripts/merge-duplicate-products.ts
-- antes desta migration.

-- CreateIndex
CREATE UNIQUE INDEX "Product_name_key" ON "Product"("name");
