// Datas em UTC puro para não sofrer com fuso/horário de verão.

export const hojeISO = (agora = new Date()) => {
  // Liv e planilha usam horário de Brasília (UTC-3, sem horário de verão desde 2019)
  const br = new Date(agora.getTime() - 3 * 3600 * 1000);
  return br.toISOString().slice(0, 10);
};

export function diasEntre(deISO, ateISO) {
  const out = [];
  const t = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  for (let x = t(deISO); x <= t(ateISO); x += 86400000) out.push(new Date(x).toISOString().slice(0, 10));
  return out;
}

export const brParaISO = (br) => `${br.slice(6, 10)}-${br.slice(3, 5)}-${br.slice(0, 2)}`;
export const isoParaBR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function somaDias(iso, n) {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * 86400000);
  return d.toISOString().slice(0, 10);
}
