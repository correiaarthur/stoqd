/**
 * Marca no próprio elemento se ainda há conteúdo para rolar abaixo dele
 * (`data-more="true"`). O CSS usa isso para desfocar a base de uma lista
 * cortada — avisando que ela continua — e para tirar o desfoque ao chegar no
 * fim, quando ele borraria o último item à toa.
 *
 * É um atributo no DOM, e não estado do React: muda a cada pixel rolado e só o
 * CSS precisa saber.
 */
export function markMoreBelow(el: HTMLElement | null) {
  if (!el) return;
  const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
  el.dataset.more = remaining > 4 ? 'true' : 'false';
  // E o inverso: já rolou? Então há conteúdo escondido por cima, e o topo
  // também esmaece (`data-less`) — senão o pedaço da opção anterior ficaria
  // espiando como uma faixa cortada rente à pílula.
  el.dataset.less = el.scrollTop > 4 ? 'true' : 'false';
}
