/**
 * Aviso de pedido novo — para **você**, não para o cliente.
 *
 * Telegram é um bot no @BotFather, um token e uma chamada HTTPS: funciona hoje,
 * sem custo nem aprovação. A API oficial do WhatsApp exigiria verificação de
 * empresa, número dedicado e template aprovado, com custo por conversa; as
 * bibliotecas não-oficiais dependem de uma sessão do WhatsApp pessoal viva num
 * servidor e arriscam banimento. Daí Telegram e e-mail.
 *
 * Regra que vale mais que os dois canais juntos: **falha de aviso nunca derruba
 * o pedido**. Cada envio vive no seu try/catch, e um canal fora do ar não
 * impede o outro de sair.
 */

const TELEGRAM_TIMEOUT_MS = 8000;

export type OrderNotification = {
  orderId: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  total: number;
  items: Array<{ name: string; quantity: number; unitPrice: number }>;
};

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function buildPlainText(order: OrderNotification) {
  const lines = order.items.map(item =>
    `• ${item.quantity}x ${item.name} — ${formatBRL(item.unitPrice * item.quantity)}`
  );

  return [
    `Pedido #${order.orderId} aguardando confirmação`,
    '',
    `Cliente: ${order.customerName}`,
    `Telefone: ${order.customerPhone}`,
    `E-mail: ${order.customerEmail ?? 'não informado'}`,
    '',
    ...lines,
    '',
    `Total: ${formatBRL(order.total)}`,
    '',
    'O estoque só baixa quando você confirmar em Vendas.',
  ].join('\n');
}

async function sendTelegram(order: OrderNotification) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!token || !chatId) return { channel: 'telegram', sent: false, reason: 'não configurado' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: buildPlainText(order) }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // O corpo do erro do Telegram repete o token na URL, nunca no texto —
      // logamos só o status para não vazar credencial no stdout.
      throw new Error(`Telegram respondeu ${response.status}`);
    }

    return { channel: 'telegram', sent: true };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendEmail(order: OrderNotification) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.ORDER_NOTIFICATION_EMAIL?.trim();
  const from = process.env.ORDER_NOTIFICATION_FROM?.trim();

  if (!apiKey || !to || !from) return { channel: 'email', sent: false, reason: 'não configurado' };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Pedido #${order.orderId} — ${order.customerName}`,
      text: buildPlainText(order),
    }),
  });

  if (!response.ok) {
    throw new Error(`Serviço de e-mail respondeu ${response.status}`);
  }

  return { channel: 'email', sent: true };
}

/**
 * Dispara os dois canais. Nunca lança: o retorno é só para o log — o pedido já
 * está gravado quando esta função é chamada, e nada aqui pode desfazê-lo.
 */
export async function notifyNewOrder(order: OrderNotification) {
  const results = await Promise.allSettled([sendTelegram(order), sendEmail(order)]);

  for (const [index, result] of results.entries()) {
    const channel = index === 0 ? 'telegram' : 'email';

    if (result.status === 'rejected') {
      console.error(`[aviso] pedido #${order.orderId}: falha no ${channel} —`, result.reason?.message ?? result.reason);
    } else if (!result.value.sent) {
      console.warn(`[aviso] pedido #${order.orderId}: ${channel} ${result.value.reason}.`);
    }
  }

  return results;
}
