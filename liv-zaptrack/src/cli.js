#!/usr/bin/env node
// Uso: node src/cli.js --de 2026-10-09 --ate 2026-10-13 [--planilha-csv adulto.csv --planilha-csv kids.csv] [--ia]
// Somente leitura na Liv. Gera out/rascunho-<de>_<ate>.csv para conferência humana.

import { readFileSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { connect, listarProtocolosDoDia, mapearProtocolos, lerConversa } from './liv.js';
import { buildRow } from './rules.js';
import { classificarComIA } from './ai.js';
import { diasEntre, hojeISO, somaDias } from './dates.js';
import { phoneKey } from './rules.js';
import { chaveDoLead, chavesExistentes, lerCSVs, ultimaData, tokenGoogle, lerAbaGoogle, registrosDaPlanilha, anexarRascunho } from './sheet.js';
import { gravar, paraCSV, paraPlanilha, porAba, matrizParaCSV } from './output.js';

const { values: a } = parseArgs({
  options: {
    de: { type: 'string' },
    ate: { type: 'string' },
    config: { type: 'string', default: 'config.json' },
    'planilha-csv': { type: 'string', multiple: true },
    'planilha-google': { type: 'boolean', default: false },
    'escrever-rascunho': { type: 'boolean', default: false },
    ia: { type: 'boolean', default: false },
    'sem-dedupe': { type: 'boolean', default: false },
    'por-aba': { type: 'boolean', default: false },
    saida: { type: 'string' },
    ajuda: { type: 'boolean', short: 'h', default: false },
  },
});

if (a.ajuda) {
  console.log(`Opções:
  --de AAAA-MM-DD / --ate AAAA-MM-DD   período (padrão: última data da planilha, ou ontem, até hoje)
  --planilha-csv arquivo.csv           CSV exportado de uma aba (repita para Adulto e Kids)
  --planilha-google                    lê as abas pelo Google Sheets (GOOGLE_SERVICE_ACCOUNT_JSON + planilha.sheetId)
  --escrever-rascunho                  anexa o resultado na aba de rascunho (nunca em Adulto/Kids)
  --ia                                 usa a API da Anthropic (ANTHROPIC_API_KEY) nos casos difíceis
  --sem-dedupe                         não descarta leads que já estão na planilha
  --por-aba                            também grava CSVs no layout das abas Adulto e Kids (colunas A..H / A..N)
  --saida caminho.csv                  arquivo de saída (padrão: out/rascunho-<de>_<ate>.csv)`);
  process.exit(0);
}

const log = (...x) => console.error('[zaptrack]', ...x);
const cfg = existsSync(a.config) ? JSON.parse(readFileSync(a.config, 'utf8')) : JSON.parse(readFileSync('config.example.json', 'utf8'));
if (!existsSync(a.config)) log(`${a.config} não existe; usando config.example.json`);
const baseUrl = process.env.LIV_BASE_URL || cfg.liv?.baseUrl || 'https://chat.livtecnologia.com';

// 1) O que já está na planilha?
let existentes = [];
if (a['planilha-csv']?.length) existentes = lerCSVs(a['planilha-csv'], cfg.planilha?.colunas);
if (a['planilha-google']) {
  const cred = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!cred || !cfg.planilha?.sheetId) throw new Error('--planilha-google exige GOOGLE_SERVICE_ACCOUNT_JSON e planilha.sheetId na config.');
  const token = await tokenGoogle(cred, false);
  for (const aba of [cfg.planilha.abaAdulto, cfg.planilha.abaKids]) {
    existentes.push(...registrosDaPlanilha(await lerAbaGoogle({ sheetId: cfg.planilha.sheetId, aba, token }), cfg.planilha.colunas));
  }
}
const jaTem = chavesExistentes(existentes);
log(`${existentes.length} lançamentos existentes na planilha.`);

// 2) Período
const ate = a.ate ?? hojeISO();
const de = a.de ?? ultimaData(existentes) ?? somaDias(ate, -1);
log(`Período: ${de} a ${ate}`);

// 3) Liv
const liv = await connect({
  baseUrl,
  login: process.env.LIV_LOGIN,
  password: process.env.LIV_SENHA,
  allowTakeover: process.env.LIV_ALLOW_SESSION_TAKEOVER === '1',
  chromiumPath: process.env.CHROMIUM_PATH,
  log,
});

try {
  const ids = { idCliente: cfg.liv?.idCliente ?? liv.ids?.idCliente, idInstancias: cfg.liv?.idInstancias ?? liv.ids?.idInstancias };
  if (!ids.idCliente || !ids.idInstancias) throw new Error('Não consegui descobrir idCliente/idInstancias; informe em config.json (liv).');
  log(`Cliente ${ids.idCliente}, canais ${ids.idInstancias}`);

  let leads = [];
  for (const dia of diasEntre(de, ate)) {
    const doDia = await listarProtocolosDoDia(liv.page, { baseUrl, ...ids }, dia);
    log(`${dia}: ${doDia.length} atendimentos`);
    leads.push(...doDia);
  }
  // Mais antigo primeiro: é a ordem em que entram na planilha.
  leads.sort((x, y) => `${x.data.split('/').reverse().join('')}${x.hora}`.localeCompare(`${y.data.split('/').reverse().join('')}${y.hora}`));

  // Contatos internos (equipe testando o bot) não entram na contagem.
  const ign = cfg.ignorar ?? {};
  const ignTel = new Set((ign.telefones ?? []).map(phoneKey));
  const ignNomes = (ign.nomes ?? []).map((n) => new RegExp(n, 'i'));
  const antesIgn = leads.length;
  leads = leads.filter((l) => !ignTel.has(phoneKey(l.whatsapp)) && !ignNomes.some((re) => re.test(l.nome)));
  if (antesIgn !== leads.length) log(`${antesIgn - leads.length} contato(s) interno(s) ignorado(s).`);

  if (!a['sem-dedupe']) {
    const antes = leads.length;
    leads = leads.filter((l) => !jaTem.has(chaveDoLead(l.whatsapp, l.data)));
    log(`${antes - leads.length} já estavam na planilha; ${leads.length} novos.`);
  }

  const mapa = await mapearProtocolos(liv.page, baseUrl, leads.map((l) => l.protocolo), { log });

  const linhas = [];
  for (const lead of leads) {
    const id = mapa.get(lead.protocolo);
    if (!id) {
      log(`protocolo ${lead.protocolo}: histórico não localizado (muito antigo?)`);
      linhas.push({ protocolo: lead.protocolo, chegada: `${lead.data} ${lead.hora}`, data: lead.data, nome: lead.nome, fone: lead.whatsapp, revisar: true, conferir: '• Histórico da conversa não localizado (muito antigo?)', canal: lead.canal, statusLiv: lead.status });
      continue;
    }
    const msgs = await lerConversa(liv.page, baseUrl, id);
    let ai = null;
    if (a.ia || cfg.ia?.ativa) {
      try {
        ai = await classificarComIA(lead, msgs, { apiKey: process.env.ANTHROPIC_API_KEY, modelo: process.env.ANTHROPIC_MODEL || cfg.ia?.modelo, maxTokens: cfg.ia?.maxTokens, enviarTelefone: cfg.ia?.enviarTelefone });
      } catch (e) {
        log(`IA falhou em ${lead.protocolo}: ${e.message}`);
      }
    }
    linhas.push(buildRow(lead, msgs, cfg, ai));
  }

  const saida = a.saida ?? `out/rascunho-${de}_${ate}.csv`;
  gravar(saida, paraCSV(linhas));
  const rev = linhas.filter((l) => l.revisar).length;
  log(`Gravado ${saida}: ${linhas.length} linhas, ${rev} com algo a conferir (coluna Conferir / Erros do Bot).`);

  if (a['por-aba']) {
    const { adulto, kids, indefinidas } = porAba(linhas);
    const base = saida.replace(/\.csv$/, '');
    gravar(`${base}-adulto.csv`, matrizParaCSV(adulto));
    gravar(`${base}-kids.csv`, matrizParaCSV(kids));
    log(`Por aba: ${adulto.length} Adulto, ${kids.length} Kids, ${indefinidas.length} sem planilha definida (só no CSV principal).`);
  }

  if (a['escrever-rascunho']) {
    const cred = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!cred || !cfg.planilha?.sheetId) throw new Error('--escrever-rascunho exige GOOGLE_SERVICE_ACCOUNT_JSON e planilha.sheetId.');
    const token = await tokenGoogle(cred, true);
    await anexarRascunho({ sheetId: cfg.planilha.sheetId, aba: cfg.planilha.abaRascunho, linhas: paraPlanilha(linhas), token });
    log(`Anexado na aba "${cfg.planilha.abaRascunho}".`);
  }
} finally {
  await liv.close();
}
