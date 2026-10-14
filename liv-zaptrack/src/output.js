import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Colunas na ordem da planilha (A..H), seguidas de colunas auxiliares para conferência humana.
export const COLUNAS_PLANILHA = ['data', 'qualificacao', 'status', 'nome', 'fone', 'frase', 'email', 'resumo'];
export const COLUNAS_AUX = ['conferir', 'errosBot', 'filho', 'nomeSugerido', 'planilha', 'tipoOrigem', 'genero', 'generoFonte', 'generoConfianca', 'protocolo', 'chegada', 'canal', 'statusLiv'];
export const CABECALHO = ['Data', 'Qualificação', 'Status', 'Nome', 'Fone', 'Frase', 'E-mail', 'Resumo', 'Conferir', 'Erros do Bot', 'Filho', 'Nome sugerido', 'Planilha', 'Origem', 'Gênero', 'Fonte gênero', 'Confiança gênero', 'Protocolo', 'Chegada', 'Canal', 'Status Liv'];

const esc = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function paraCSV(linhas) {
  const cols = [...COLUNAS_PLANILHA, ...COLUNAS_AUX];
  const cab = CABECALHO;
  return [cab, ...linhas.map((l) => cols.map((c) => l[c]))].map((r) => r.map(esc).join(',')).join('\n') + '\n';
}

export function gravar(caminho, texto) {
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, texto, 'utf8');
}

/** Linhas para colar/anexar na planilha: só as colunas A..H. */
export const paraPlanilha = (linhas) => linhas.map((l) => COLUNAS_PLANILHA.map((c) => l[c] ?? ''));

/**
 * Linhas no layout de cada aba da Zap Track.
 * Adulto: A Data, B Qualificação, C Status, D Nome, E Telefone, F Frase, G E-mail, H Resumo.
 * Kids:   A Data, B Qualificação, C Status, D Nome, E Telefone, F Filho, G Frases, H e-mail, I Observação,
 *         J cep, K data interação, L Classificação, M Mensagem, N resumo.
 */
export function porAba(linhas) {
  const adulto = [];
  const kids = [];
  const indefinidas = [];
  for (const l of linhas) {
    if (l.planilha === 'Kids') kids.push([l.data, l.qualificacao, l.status, l.nome, l.fone, l.filho ?? '', l.frase, l.email, '', '', '', '', '', l.resumo]);
    else if (l.planilha === 'Adulto') adulto.push([l.data, l.qualificacao, l.status, l.nome, l.fone, l.frase, l.email, l.resumo]);
    else indefinidas.push(l);
  }
  return { adulto, kids, indefinidas };
}

export const matrizParaCSV = (m) => m.map((r) => r.map(esc).join(',')).join('\n') + '\n';
