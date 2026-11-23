import { testPrisma } from './testDb.js';

/**
 * Criadores de dado de teste.
 *
 * Cada um aceita só o que o teste precisa dizer e preenche o resto com algo
 * válido. A intenção é que o teste leia como a regra que exercita — "um produto
 * com 1 unidade" — e não como um formulário de cadastro.
 */

let sequencia = 0;
/** Nome único: `Product.name` é `@unique` no schema. */
function nomeUnico(prefixo: string) {
  sequencia += 1;
  return `${prefixo} ${sequencia}`;
}

export async function criarMarca(nome = nomeUnico('Marca')) {
  return testPrisma.brand.create({ data: { name: nome } });
}

export async function criarProduto(opcoes: {
  quantidade: number;
  preco?: number;
  promocional?: number | null;
  nome?: string;
  brandId?: number;
} ) {
  const brandId = opcoes.brandId ?? (await criarMarca()).id;

  return testPrisma.product.create({
    data: {
      name: opcoes.nome ?? nomeUnico('Produto'),
      quantity: opcoes.quantidade,
      averageCost: 10,
      sellingPrice: opcoes.preco ?? 100,
      promotionalPrice: opcoes.promocional ?? null,
      brandId,
    },
  });
}

export async function criarCliente(nome = nomeUnico('Cliente')) {
  return testPrisma.customer.create({
    data: { name: nome, phone: '11999990000', email: null },
  });
}

export async function criarConta(opcoes: { customerId?: number; role?: string } = {}) {
  sequencia += 1;
  return testPrisma.user.create({
    data: {
      name: `Conta ${sequencia}`,
      phone: `1198888${String(sequencia).padStart(4, '0')}`,
      passwordHash: 'hash-de-teste',
      role: opcoes.role ?? 'customer',
      ...(opcoes.customerId === undefined ? {} : { customerId: opcoes.customerId }),
    },
  });
}

export async function criarCupom(opcoes: {
  codigo?: string;
  tipo?: 'PERCENT' | 'FIXED';
  valor?: number;
  maxUsos?: number | null;
} = {}) {
  sequencia += 1;
  return testPrisma.coupon.create({
    data: {
      code: opcoes.codigo ?? `CUPOM${sequencia}`,
      type: opcoes.tipo ?? 'PERCENT',
      value: opcoes.valor ?? 10,
      maxUses: opcoes.maxUsos ?? null,
      active: true,
    },
  });
}

/** Um pedido pendente da vitrine, pronto para ser confirmado. */
export async function criarPedidoPendente(opcoes: {
  userId: number;
  productId: number;
  quantidade: number;
  unitPrice: number;
}) {
  return testPrisma.order.create({
    data: {
      userId: opcoes.userId,
      paymentType: 'VISTA',
      installmentsCount: 1,
      items: {
        create: {
          productId: opcoes.productId,
          quantity: opcoes.quantidade,
          unitPrice: opcoes.unitPrice,
        },
      },
    },
    include: { items: true },
  });
}
