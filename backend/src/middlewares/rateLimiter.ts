import rateLimit from 'express-rate-limit';

const MINUTE = 60 * 1000;

type LimiterOptions = {
  windowMs: number;
  max: number;
  message: string;
  /** Tentativa bem-sucedida não conta contra o limite. */
  skipSuccessfulRequests?: boolean;
};

function makeLimiter({ windowMs, max, message, skipSuccessfulRequests }: LimiterOptions) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    ...(skipSuccessfulRequests ? { skipSuccessfulRequests } : {}),
    message: { status: 429, error: message },
  });
}

// Um dia de PDV movimentado passa fácil de 100 requisições: cada venda recarrega
// os produtos. O teto geral é generoso e serve só contra abuso.
export const limiter = makeLimiter({
  windowMs: 15 * MINUTE,
  max: 600,
  message: "Muitas requisições vindo deste IP, por favor tente novamente mais tarde.",
});

// O login é a única barreira de um admin com senha fixa, então tem limite
// próprio e agressivo. Tentativa bem-sucedida não conta.
export const loginLimiter = makeLimiter({
  windowMs: 15 * MINUTE,
  max: 10,
  skipSuccessfulRequests: true,
  message: "Muitas tentativas de login. Aguarde 15 minutos e tente novamente.",
});

// Cadastro é a primeira rota pública que escreve. Sem teto próprio, um script
// cria mil contas antes de alguém perceber.
export const registerLimiter = makeLimiter({
  windowMs: 60 * MINUTE,
  max: 5,
  message: "Muitas contas criadas a partir deste endereço. Tente novamente daqui a uma hora.",
});

// Reserva e disponibilidade são chamadas a cada mexida no carrinho, então o
// teto é alto — o que ele barra é o script que reserva o catálogo inteiro.
export const cartLimiter = makeLimiter({
  windowMs: 15 * MINUTE,
  max: 120,
  message: "Muitas alterações no carrinho em pouco tempo. Aguarde alguns minutos.",
});

// Um pedido é um ato deliberado: quem envia dez em quinze minutos não está
// comprando.
export const orderLimiter = makeLimiter({
  windowMs: 15 * MINUTE,
  max: 10,
  message: "Muitos pedidos enviados. Aguarde alguns minutos antes de enviar outro.",
});

// Validar cupom é a única rota pública que responde se um código existe. Sem
// teto, um script varre o espaço de códigos até achar um que valha.
export const couponLimiter = makeLimiter({
  windowMs: 15 * MINUTE,
  max: 20,
  message: "Muitas tentativas de cupom. Aguarde alguns minutos.",
});
