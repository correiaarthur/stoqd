# Capturas de tela

A única rede do projeto que vê **layout**. Os testes de comportamento não
percebem alinhamento quebrado, contraste perdido, componente sumido em tela
estreita ou sobreposição — e é isso que uma troca de identidade visual arrisca.

## Durante a refatoração visual

```
npm run e2e            o que mudou desde a última referência
npm run e2e:report     abre o relatório com antes / depois / diferença
npm run e2e:update     aceita o visual novo como referência
```

O segundo comando é o que importa: é como você descobre que a tela de Ajustes
quebrou enquanto mexia no Checkout. Ele não julga se a mudança ficou boa —
responde se foi **intencional**.

## Por que isso é estável

Captura de tela só serve se a mesma tela produzir a mesma imagem. Três coisas
garantem isso:

- **banco descartável e semeado** (`backend/tests/helpers/seedE2e.ts`) — seis
  produtos escolhidos para cobrir os estados visuais: esgotado, promoção,
  vencido, vencendo em breve, sem validade;
- **relógio congelado** em 15/06/2026, a mesma âncora do seed. Sem isso o texto
  das datas anda com o calendário e as referências quebram sozinhas de um dia
  para o outro;
- **portas próprias** (3101 e 5273) para não competir com o `npm run dev`.

## O que é mascarado, e o preço disso

Máscara pinta a região de rosa antes de comparar. Cada uma tem motivo:

| Região | Motivo |
| --- | --- |
| `img` | fotos vêm do Supabase Storage: dependem de rede |
| `.recharts-wrapper` | o eixo do gráfico tem o dia, e o dia anda |
| `.inventory-panel` | calculado no **servidor**, cujo relógio o teste não congela |

Mascarar é abrir mão de cobertura naquele pedaço — numa mutação de teste, uma
regressão de espaçamento que derrubou 6 das 12 páginas **passou** no Dashboard,
justamente por causa das máscaras. A tentação é mascarar até parar de falhar; o
resultado disso é uma suíte verde que não olha nada.

## As imagens são específicas da máquina

Os arquivos terminam em `-darwin.png`. Renderização de fonte muda entre sistemas,
então as referências geradas no macOS não valem no Linux do CI. Para rodar em CI,
gere as referências lá dentro (container) e versione aquelas.
