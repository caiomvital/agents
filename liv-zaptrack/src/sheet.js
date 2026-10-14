// Leitura da planilha Zap Track (para saber o que já foi lançado) e escrita opcional de rascunho.
//  - Hoje: lê um CSV exportado de cada aba (Arquivo > Fazer download > CSV). Funciona sem credenciais.
//  - Pronto, mas AINDA NÃO TESTADO (faltam credenciais e a planilha): Google Sheets API via conta de serviço.

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { phoneKey } from './rules.js';

// ---------- CSV ----------

export function parseCSV(texto) {
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  const t = texto.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') (row.push(cur), (cur = ''));
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += c;
  }
  if (cur !== '' || row.length) (row.push(cur), rows.push(row));
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

const colIdx = (letra) => letra.toUpperCase().charCodeAt(0) - 65;

/** Converte linhas (matriz) em registros {data, fone, nome}. Usa os cabeçalhos; se não achar, usa as letras da config. */
export function registrosDaPlanilha(matriz, colunas = {}) {
  if (!matriz.length) return [];
  const cab = matriz[0].map((x) => x.trim().toLowerCase());
  const achar = (...nomes) => cab.findIndex((c) => nomes.some((n) => c === n));
  const iData = achar('data') >= 0 ? achar('data') : colIdx(colunas.data ?? 'A');
  const iFone = achar('fone', 'telefone', 'phone') >= 0 ? achar('fone', 'telefone', 'phone') : colIdx(colunas.fone ?? 'E');
  const iNome = achar('nome') >= 0 ? achar('nome') : colIdx(colunas.nome ?? 'D');
  return matriz.slice(1).map((r) => ({ data: (r[iData] ?? '').trim(), fone: (r[iFone] ?? '').trim(), nome: (r[iNome] ?? '').trim() })).filter((r) => r.fone);
}

export function lerCSVs(caminhos, colunas) {
  return caminhos.flatMap((p) => registrosDaPlanilha(parseCSV(readFileSync(p, 'utf8')), colunas));
}

// ---------- deduplicação ----------

/** Conjunto de chaves "DDD+8dígitos|dd/mm" (o ano é ignorado: a planilha às vezes grava só dd/mm). */
export function chavesExistentes(registros) {
  return new Set(registros.map((r) => `${phoneKey(r.fone)}|${r.data.slice(0, 5)}`));
}

export const chaveDoLead = (fone, dataBR) => `${phoneKey(fone)}|${dataBR.slice(0, 5)}`;

/** Última data (dd/mm/aaaa) que aparece na planilha, para sugerir de onde continuar. */
export function ultimaData(registros) {
  const datas = registros.map((r) => r.data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)).filter(Boolean).map((m) => `${m[3]}-${m[2]}-${m[1]}`);
  return datas.sort().at(-1) ?? null;
}

// ---------- Google Sheets (conta de serviço) ----------

const b64u = (b) => Buffer.from(b).toString('base64url');

export async function tokenGoogle(credJSON, escrita = false, fetchImpl = fetch) {
  const cred = typeof credJSON === 'string' ? JSON.parse(credJSON) : credJSON;
  const agora = Math.floor(Date.now() / 1000);
  const escopo = escrita ? 'https://www.googleapis.com/auth/spreadsheets' : 'https://www.googleapis.com/auth/spreadsheets.readonly';
  const corpo = `${b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64u(JSON.stringify({ iss: cred.client_email, scope: escopo, aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600 }))}`;
  const assinatura = createSign('RSA-SHA256').update(corpo).sign(cred.private_key).toString('base64url');
  const r = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${corpo}.${assinatura}` }),
  });
  if (!r.ok) throw new Error(`Google OAuth ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).access_token;
}

export async function lerAbaGoogle({ sheetId, aba, token, fetchImpl = fetch }) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(aba)}!A:H?valueRenderOption=FORMATTED_VALUE`;
  const r = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Sheets leitura ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).values ?? [];
}

/** Acrescenta linhas SOMENTE na aba de rascunho. Nunca toca nas abas Adulto/Kids. */
export async function anexarRascunho({ sheetId, aba, linhas, token, fetchImpl = fetch }) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(aba)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const r = await fetchImpl(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ values: linhas }),
  });
  if (!r.ok) throw new Error(`Sheets escrita ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
