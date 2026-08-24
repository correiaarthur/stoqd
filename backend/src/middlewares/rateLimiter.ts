import rateLimit from 'express-rate-limit';

// Um dia de PDV movimentado passa fácil de 100 requisições: cada venda recarrega
// os produtos. O teto geral é generoso e serve só contra abuso.
export const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: "Muitas requisições vindo deste IP, por favor tente novamente mais tarde."
  }
});

// O login é a única barreira de um admin com senha fixa, então tem limite
// próprio e agressivo. Tentativa bem-sucedida não conta.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: "Muitas tentativas de login. Aguarde 15 minutos e tente novamente."
  }
});

// Cadastro é a primeira rota pública que escreve. Sem teto próprio, um script
// cria mil contas antes de alguém perceber.
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: "Muitas contas criadas a partir deste endereço. Tente novamente daqui a uma hora."
  }
});

// Reserva e disponibilidade são chamadas a cada mexida no carrinho, então o
// teto é alto — o que ele barra é o script que reserva o catálogo inteiro.
export const cartLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: "Muitas alterações no carrinho em pouco tempo. Aguarde alguns minutos."
  }
});

// Um pedido é um ato deliberado: quem envia dez em quinze minutos não está
// comprando.
export const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: "Muitos pedidos enviados. Aguarde alguns minutos antes de enviar outro."
  }
});

// Validar cupom é a única rota pública que responde se um código existe. Sem
// teto, um script varre o espaço de códigos até achar um que valha.
export const couponLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: "Muitas tentativas de cupom. Aguarde alguns minutos."
  }
});
