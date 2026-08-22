/**
 * Junta produtos com nome duplicado em um único registro.
 *
 * O schema declara Product.name como @unique, mas a constraint nunca foi criada
 * no banco, e dois nomes acabaram duplicados. Este script consolida cada par
 * antes de a constraint ser aplicada.
 *
 * Regras da consolidação:
 *  - mantém o registro mais antigo (menor id) e apaga os demais;
 *  - soma as quantidades;
 *  - custo médio ponderado, ignorando registros com custo 0 (lacuna de cadastro,
 *    não custo real — incluí-los rebaixaria o custo e inflaria o lucro);
 *  - entre duas validades, mantém a que vence primeiro (a mais conservadora);
 *  - preserva imagem, categoria e preço promocional de quem tiver;
 *  - reaponta itens de venda dos duplicados para o registro mantido.
 *
 * Rodar com: npx tsx src/scripts/merge-duplicate-products.ts
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: `${process.env.DATABASE_URL}` }),
});

async function main() {
  const duplicated = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM "Product" GROUP BY name HAVING COUNT(*) > 1`
  );

  if (duplicated.length === 0) {
    console.log('Nenhum nome duplicado encontrado.');
    return;
  }

  for (const { name } of duplicated) {
    const rows = await prisma.product.findMany({ where: { name }, orderBy: { id: 'asc' } });
    const [keeper, ...extras] = rows;
    if (!keeper || extras.length === 0) continue;

    const extraIds = extras.map(e => e.id);
    const totalQuantity = rows.reduce((acc, r) => acc + r.quantity, 0);

    const priced = rows.filter(r => r.averageCost > 0);
    const pricedQuantity = priced.reduce((acc, r) => acc + r.quantity, 0);
    const averageCost = pricedQuantity > 0
      ? priced.reduce((acc, r) => acc + r.averageCost * r.quantity, 0) / pricedQuantity
      : 0;

    const expiryDates = rows.map(r => r.expiryDate).filter((d): d is Date => d !== null);

    const merged = {
      quantity: totalQuantity,
      averageCost: Number(averageCost.toFixed(2)),
      sellingPrice: Math.max(...rows.map(r => r.sellingPrice)),
      promotionalPrice: rows.find(r => r.promotionalPrice != null)?.promotionalPrice ?? null,
      expiryDate: expiryDates.length
        ? new Date(Math.min(...expiryDates.map(d => d.getTime())))
        : null,
      imageUrl: rows.find(r => r.imageUrl)?.imageUrl ?? null,
      categoryId: rows.find(r => r.categoryId)?.categoryId ?? null,
    };

    await prisma.$transaction(async (tx) => {
      const moved = await tx.saleItem.updateMany({
        where: { productId: { in: extraIds } },
        data: { productId: keeper.id },
      });

      await tx.product.update({ where: { id: keeper.id }, data: merged });
      await tx.product.deleteMany({ where: { id: { in: extraIds } } });

      console.log(`"${name}"`);
      console.log(`   mantido id=${keeper.id} | apagados id=${extraIds.join(', ')}`);
      console.log(`   quantidade ${rows.map(r => r.quantity).join(' + ')} = ${merged.quantity}`);
      console.log(`   custo ${rows.map(r => r.averageCost.toFixed(2)).join(' / ')} -> ${merged.averageCost.toFixed(2)}`);
      console.log(`   validade -> ${merged.expiryDate?.toISOString().slice(0, 10) ?? 'nenhuma'}`);
      console.log(`   itens de venda reapontados: ${moved.count}\n`);
    });
  }

  const remaining = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM "Product" GROUP BY name HAVING COUNT(*) > 1`
  );
  console.log(`Duplicados restantes: ${remaining.length}`);
  console.log(`Total de produtos: ${await prisma.product.count()}`);
}

main()
  .catch((error) => {
    console.error('Falha ao consolidar duplicados:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
