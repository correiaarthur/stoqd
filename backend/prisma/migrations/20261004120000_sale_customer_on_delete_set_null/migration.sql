-- Apagar um cliente não pode apagar as vendas dele.
--
-- A FK estava em ON DELETE CASCADE, então `DELETE FROM "Customer"` levava
-- junto as vendas daquele cliente e, por cascata, os itens e as parcelas —
-- pagas inclusive. O faturamento saía do Dashboard e do relatório de vendas
-- sem aviso e sem volta, a um clique do botão "Remover" na tela de Clientes.
--
-- Nunca foi decisão de ninguém: a FK nasceu SET NULL em
-- `adiciona_clientes_e_parcelas`, virou CASCADE por um `db push` fora do
-- histórico, e `reconcile_schema_drift` apenas registrou o estado que o banco
-- já tinha, sem revisar se estava certo. Esta migration desfaz aquilo.
--
-- Os outros dois cascades daquele arquivo ficam como estão: SaleItem e
-- Installment são partes de uma venda e morrem com ela. A venda, não — ela
-- aconteceu, e continua valendo mesmo que o cliente saia do cadastro.
ALTER TABLE "Sale" DROP CONSTRAINT IF EXISTS "Sale_customerId_fkey";

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
