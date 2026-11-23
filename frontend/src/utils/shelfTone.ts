/**
 * Tom de prateleira de um produto: a cor atrás do frasco quando não há foto,
 * e a do rastro do card no hover. Sai do id, então o mesmo produto tem a mesma
 * cor na vitrine, na prévia da sacola e onde mais aparecer.
 */
export const SHELF_TONES = ['#6E8B3D', '#D9775A', '#D9A23A', '#C8643B', '#4E7F6E', '#9C6B2F'];

export const toneFor = (id: number) => SHELF_TONES[id % SHELF_TONES.length];
