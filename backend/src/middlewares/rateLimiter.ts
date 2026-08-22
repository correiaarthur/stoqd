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
