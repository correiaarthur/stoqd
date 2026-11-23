import bcrypt from 'bcryptjs';

import { criarProduto } from './factories.js';
import { aplicarMigrations, fecharBanco, limparBanco, testPrisma } from './testDb.js';

/**
 * Dado fixo para as capturas de tela.
 *
 * Captura de tela só serve se a mesma tela produzir a mesma imagem. O inimigo é
 * **o tempo**: a loja decide o selo de validade comparando com hoje, então uma
 * data absoluta como `2026-12-31` muda de categoria sozinha com o calendário, e
 * a imagem de referência quebra sem ninguém ter tocado no código.
 *
 * Por isso toda data aqui é **relativa a hoje**, não absoluta. Um produto
 * semeado com `hoje + 10` cai em "vence em breve" nesta semana e no ano que vem.
 * O que a imagem registra é o selo, não o dia.
 *
 * O que ainda escapa: textos que mostram a data em si — o eixo do gráfico do
 * Dashboard, "Venda #7 - 04/10/2026" no extrato. Esses mudam todo dia por
 * natureza, e são escondidos com máscara no próprio teste em vez de fingidos
 * aqui.
 */

/** Credenciais fixas do cliente de teste. Só valem no banco descartável. */
export const TELEFONE_DO_CLIENTE = '11988887777';
export const SENHA_DO_CLIENTE = 'senha-de-teste-e2e';

/**
 * A data que o navegador vai fingir que é hoje.
 *
 * Fixa, e não `new Date()`. Com datas relativas ao dia real, o **selo** fica
 * estável ("vence em breve" continua sendo isso amanhã) mas o **texto da data**
 * anda junto com o calendário: 08/11/2027 vira 09/11/2027 e a imagem de
 * referência quebra sozinha, sem ninguém ter tocado no código.
 *
 * Ancorando aqui e congelando o relógio do navegador no mesmo instante, os dois
 * ficam estáveis — o selo e o texto.
 *
 * O que escapa: o Dashboard calcula vencidos e vencendo no **servidor**, cujo
 * relógio o teste não congela. Esses três números são mascarados na captura, com
 * o motivo escrito lá.
 */
export const ANCORA = new Date('2026-06-15T12:00:00.000Z');

/** Dias a partir da âncora, em UTC, como `expiryDate` é guardado. */
function emDias(dias: number): Date {
  const data = new Date(Date.UTC(
    ANCORA.getUTCFullYear(), ANCORA.getUTCMonth(), ANCORA.getUTCDate()
  ));
  data.setUTCDate(data.getUTCDate() + dias);
  return data;
}

export async function semearE2e() {
  aplicarMigrations();
  await limparBanco();

  // Criadas uma a uma, e não por `Promise.all` com desestruturação: o `map`
  // devolve um array de tamanho desconhecido para o compilador, e arrancar três
  // posições dele exige uma asserção de tipo que não prova nada.
  const eudora = await testPrisma.brand.create({ data: { name: 'Eudora' } });
  const natura = await testPrisma.brand.create({ data: { name: 'Natura' } });
  const avon = await testPrisma.brand.create({ data: { name: 'Avon' } });

  const cabelos = await testPrisma.category.create({ data: { name: 'Cabelos' } });
  const perfumaria = await testPrisma.category.create({ data: { name: 'Perfumaria' } });
  const corpo = await testPrisma.category.create({ data: { name: 'Corpo' } });

  /**
   * Cada linha existe para cobrir um estado visual diferente da tela de estoque
   * e da vitrine: esgotado, promoção, vencido, vencendo, sem validade, sem foto.
   */
  const produtos = [
    { nome: 'Condicionador Nutri Rosé 400ml', brandId: eudora.id, categoryId: cabelos.id, quantity: 12, averageCost: 18.5, sellingPrice: 39.9, promotionalPrice: null, expiryDate: emDias(400) },
    { nome: 'Shampoo Siàge Cachos 250ml', brandId: eudora.id, categoryId: cabelos.id, quantity: 4, averageCost: 14, sellingPrice: 32.9, promotionalPrice: 26.9, expiryDate: emDias(180) },
    { nome: 'Perfume Egeo Dolce 90ml', brandId: natura.id, categoryId: perfumaria.id, quantity: 2, averageCost: 62, sellingPrice: 139.9, promotionalPrice: null, expiryDate: null },
    { nome: 'Hidratante Corporal Tododia 400ml', brandId: natura.id, categoryId: corpo.id, quantity: 0, averageCost: 21, sellingPrice: 44.9, promotionalPrice: null, expiryDate: emDias(300) },
    { nome: 'Desodorante Natural Avon 150ml', brandId: avon.id, categoryId: corpo.id, quantity: 7, averageCost: 9.9, sellingPrice: 21.9, promotionalPrice: null, expiryDate: emDias(10) },
    { nome: 'Sabonete em Barra Cuide-se Bem', brandId: avon.id, categoryId: corpo.id, quantity: 25, averageCost: 3.2, sellingPrice: 7.9, promotionalPrice: 5.9, expiryDate: emDias(-5) },
  ];

  for (const p of produtos) {
    await testPrisma.product.create({
      data: {
        name: p.nome, brandId: p.brandId, categoryId: p.categoryId,
        quantity: p.quantity, averageCost: p.averageCost,
        sellingPrice: p.sellingPrice, promotionalPrice: p.promotionalPrice,
        expiryDate: p.expiryDate,
      },
    });
  }

  /** Clientes nos três estados que a listagem distingue: em dia, devendo, em atraso. */
  const emDia = await testPrisma.customer.create({
    data: { name: 'Ana Ribeiro', phone: '11988887777', email: 'ana@exemplo.com' },
  });
  const devendo = await testPrisma.customer.create({
    data: { name: 'Bruno Carvalho', phone: '11977776666', email: null },
  });
  const atrasado = await testPrisma.customer.create({
    data: { name: 'Carla Monteiro', phone: '11966665555', email: 'carla@exemplo.com' },
  });

  const produto = await testPrisma.product.findFirstOrThrow();

  /** Venda à vista, quitada. */
  await testPrisma.sale.create({
    data: {
      total: 39.9, discount: 0, interest: 0, customerId: emDia.id, date: emDias(-20),
      items: { create: { productId: produto.id, quantity: 1, unitPrice: 39.9 } },
      installments: { create: { number: 1, value: 39.9, dueDate: emDias(-20), paidAt: emDias(-20) } },
    },
  });

  /** A prazo, em dia: uma paga, duas a vencer. */
  await testPrisma.sale.create({
    data: {
      total: 119.7, discount: 0, interest: 0, customerId: devendo.id, date: emDias(-10),
      items: { create: { productId: produto.id, quantity: 3, unitPrice: 39.9 } },
      installments: {
        create: [
          { number: 1, value: 39.9, dueDate: emDias(-10), paidAt: emDias(-10) },
          { number: 2, value: 39.9, dueDate: emDias(20), paidAt: null },
          { number: 3, value: 39.9, dueDate: emDias(50), paidAt: null },
        ],
      },
    },
  });

  /** Em atraso: o estado que a listagem precisa destacar. */
  await testPrisma.sale.create({
    data: {
      total: 85, discount: 10, interest: 5, customerId: atrasado.id, date: emDias(-60),
      items: { create: { productId: produto.id, quantity: 2, unitPrice: 45 } },
      installments: {
        create: [
          { number: 1, value: 42.5, dueDate: emDias(-30), paidAt: null },
          { number: 2, value: 42.5, dueDate: emDias(-5), paidAt: null },
        ],
      },
    },
  });

  /**
   * Conta de cliente para as telas da vitrine logada.
   *
   * O hash é gerado aqui, e não copiado pronto, porque o custo do bcrypt é
   * irrelevante uma vez por execução e um hash literal no código viraria um
   * segredo falso que alguém acaba reaproveitando fora do teste.
   */
  await testPrisma.user.create({
    data: {
      name: 'Ana Ribeiro',
      phone: '11988887777',
      email: 'ana@exemplo.com',
      passwordHash: await bcrypt.hash(SENHA_DO_CLIENTE, 10),
      role: 'customer',
      customerId: emDia.id,
    },
  });

  await testPrisma.coupon.createMany({
    data: [
      { code: 'CICLO10', type: 'PERCENT', value: 10, active: true },
      { code: 'FRETE15', type: 'FIXED', value: 15, minimumTotal: 100, active: true },
    ],
  });

  return { produtos: produtos.length, clientes: 3, vendas: 3, contas: 1 };
}

// Rodar direto: `npx tsx tests/helpers/seedE2e.ts`
if (process.argv[1]?.includes('seedE2e')) {
  semearE2e()
    .then(r => { console.log('semeado:', JSON.stringify(r)); return fecharBanco(); })
    .catch(e => { console.error(e); process.exit(1); });
}
