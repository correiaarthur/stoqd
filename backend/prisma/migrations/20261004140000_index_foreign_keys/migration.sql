-- Índices nas chaves estrangeiras.
--
-- O Postgres cria índice para PRIMARY KEY e UNIQUE, mas **não** para FK. Antes
-- desta migration, conferido com EXPLAIN no banco de produção, as cinco
-- consultas mais usadas do sistema eram todas Seq Scan:
--
--   Sale por customerId      Seq Scan    (extrato do cliente)
--   Sale por date            Seq Scan    (relatório de vendas, resumo do mês)
--   Installment por saleId   Seq Scan    (parcelas de uma venda)
--   SaleItem por saleId      Seq Scan    (itens de uma venda)
--   Product por brandId      Seq Scan    (apagar marca, filtro do Dashboard)
--
-- Com 9 vendas isso não dói. É a única otimização da lista que fica **mais
-- caro quanto mais tarde for feita**, porque o índice passa a ser construído
-- sobre uma tabela maior — daí fazer agora, enquanto custa milissegundos.
--
-- Dois índices vão além da FK:
--   Sale(date)                  é por onde o relatório corta o período
--   Installment(paidAt,dueDate) responde "quais parcelas estão em aberto e
--                               venceram", a pergunta que a listagem de
--                               clientes faz sobre a tabela inteira
--
-- SQL gerado por `prisma migrate diff`, para não divergir do schema.

-- CreateIndex
CREATE INDEX "Product_brandId_idx" ON "Product"("brandId");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Sale_customerId_idx" ON "Sale"("customerId");

-- CreateIndex
CREATE INDEX "Sale_date_idx" ON "Sale"("date");

-- CreateIndex
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");

-- CreateIndex
CREATE INDEX "SaleItem_productId_idx" ON "SaleItem"("productId");

-- CreateIndex
CREATE INDEX "Installment_saleId_idx" ON "Installment"("saleId");

-- CreateIndex
CREATE INDEX "Installment_paidAt_dueDate_idx" ON "Installment"("paidAt", "dueDate");

-- CreateIndex
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

