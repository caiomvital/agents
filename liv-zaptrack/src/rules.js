// Regras puras (sem rede, sem navegador): transformam mensagens da Liv em colunas da Zap Track.
// Tudo aqui é determinístico e testável. Itens duvidosos saem marcados com `revisar`.

import { readFileSync } from 'node:fs';

const NOMES = JSON.parse(readFileSync(new URL('./data/nomes.json', import.meta.url), 'utf8'));

export const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

// ---------- telefone ----------

/** Chave de comparação: DDD + 8 últimos dígitos (ignora 55 e o nono dígito, que a Liv e a planilha tratam diferente). */
export function phoneKey(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length < 10) return d;
  return d.slice(0, 2) + d.slice(-8);
}

/** Formato da planilha: DDD + número com nono dígito, sem 55 (ex.: 81987770002). A Liv entrega celulares sem o 9. */
export function phoneForSheet(raw) {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length === 10 && /[6-9]/.test(d[2])) d = d.slice(0, 2) + '9' + d.slice(2);
  return d;
}

// ---------- mensagens ----------

/** Remove duplicatas: a Liv grava a primeira mensagem do lead duas vezes (mesmo autor, hora e texto). */
export function dedupeMessages(msgs) {
  const seen = new Set();
  return msgs.filter((m) => {
    const k = `${m.role}|${m.at}|${m.text}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const leadMsgs = (msgs) => msgs.filter((m) => m.role === 'lead');
const botMsgs = (msgs) => msgs.filter((m) => m.role !== 'lead');

export function extractFrase(msgs) {
  return leadMsgs(msgs)[0]?.text?.trim() ?? '';
}

// ---------- origem: campanha / dúvida / saudação e planilha ----------

const SAUDACAO = /^(oi+|ol[aá]+|bom dia|boa tarde|boa noite|e a[ií]|diz a[ií]|opa|hey|hello|tudo bem)\b/i;

export function classifyOrigin(frase, cfg = {}) {
  const origens = cfg.origens ?? {};
  const m = frase.match(/^([A-Za-zÀ-ú0-9]{1,6})\s*[.\-–:]\s*(\S.*)$/s);
  const prefixo = m?.[1] ?? null;
  const resto = m?.[2] ?? frase;

  let planilha = null;
  let fonte = null;

  const mapa = origens.prefixos ?? {};
  const pn = norm(prefixo ?? '');
  const casa = (k) => (k.endsWith('*') ? pn.startsWith(norm(k.slice(0, -1))) : norm(k) === pn);
  const chave = pn ? Object.keys(mapa).find((k) => mapa[k] && casa(k)) : null;
  if (chave) {
    planilha = mapa[chave];
    fonte = `prefixo ${chave}`;
  }

  if (!planilha) {
    const t = norm(resto);
    const kids = (origens.palavrasKids ?? []).some((w) => t.includes(norm(w)));
    const adulto = (origens.palavrasAdulto ?? []).some((w) => t.includes(norm(w)));
    if (kids && !adulto) (planilha = 'Kids'), (fonte = 'palavra-chave');
    else if (adulto && !kids) (planilha = 'Adulto'), (fonte = 'palavra-chave');
  }

  // Prefixos de anúncio genéricos (Fb., Sb., Pr.…) sem pista de Kids caem na planilha padrão.
  if (!planilha && prefixo && (origens.genericos ?? []).some((g) => norm(g) === pn)) {
    planilha = origens.padraoGenerico ?? null;
    if (planilha) fonte = 'padrão genérico';
  }

  let tipo;
  if (prefixo && /^[A-Za-zÀ-ú]/.test(prefixo) && frase.length > prefixo.length + 3) tipo = 'campanha';
  else if (SAUDACAO.test(frase.trim())) tipo = 'saudacao';
  else tipo = 'duvida';

  return { tipo, prefixo, planilha, fonte };
}

// ---------- agendamento ----------

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const DIA = /\b(segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)\b|\b\d{1,2}\s*(de|\/)\s*(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|\d{1,2})/i;
const HORA = /\b\d{1,2}\s*(h|:)\s*\d{0,2}|\b\d{1,2}\s*horas?\b/i;

export function extractSchedule(msgs) {
  const lead = leadMsgs(msgs);
  const email = lead.map((m) => m.text.match(EMAIL)?.[0]).find(Boolean) ?? null;
  const dia = lead.map((m) => m.text.match(DIA)?.[0]).find(Boolean) ?? null;
  const horario = lead.map((m) => m.text.match(HORA)?.[0]?.trim()).find(Boolean) ?? null;

  // nome completo: resposta do lead logo depois de o bot pedir "nome completo"
  let nome = null;
  for (let i = 0; i < msgs.length - 1; i++) {
    if (msgs[i].role !== 'lead' && /nome completo/i.test(msgs[i].text)) {
      const prox = msgs.slice(i + 1).find((m) => m.role === 'lead');
      if (prox && !EMAIL.test(prox.text)) {
        nome = prox.text.trim();
        break;
      }
    }
  }
  return { email, dia, horario, nome, completo: Boolean(email && dia && horario) };
}

// ---------- status ----------

export function classifyStatus(msgs, cfg = {}) {
  const lead = leadMsgs(msgs);
  const ag = extractSchedule(msgs);

  if (lead.length <= 1) {
    return { status: 'Não interagiu', motivo: 'lead só enviou a mensagem de origem', revisar: false, ag };
  }
  if (ag.completo) {
    return { status: 'Agendado', motivo: 'e-mail, dia e horário presentes', revisar: false, ag };
  }

  const padroes = (cfg.naoQuero?.padroes ?? []).map((p) => new RegExp(p, 'i'));
  const hit = lead.slice(1).find((m) => padroes.some((re) => re.test(m.text)));
  if (hit) {
    return { status: 'Não quero', motivo: `trecho: "${hit.text.slice(0, 60)}"`, revisar: true, ag };
  }

  const parcial = ag.email || ag.dia || ag.horario;
  // A planilha real mistura "Conversa Iniciada" e "1o/2o/3o interação". O padrão segue o passo a passo
  // (Conversa Iniciada); com status.interacao = "contagem" usa o número de respostas do lead.
  const contagem = cfg.status?.interacao === 'contagem';
  const respostas = lead.length - 1;
  return {
    status: contagem ? `${respostas}o interação` : 'Conversa Iniciada',
    motivo: parcial ? 'agendamento parcial (faltam dados)' : 'lead interagiu com o bot',
    revisar: Boolean(parcial),
    ag,
  };
}

// ---------- gênero ----------

const TITULOS = new Set(['pr', 'pra', 'dr', 'dra', 'sr', 'sra', 'prof', 'profa', 'eng', 'pastor', 'pastora']);

export function primeiroNome(nome) {
  const toks = String(nome ?? '')
    .replace(/[^\p{L}\s.'-]/gu, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/\./g, ''))
    .filter(Boolean);
  return toks.find((t) => !TITULOS.has(norm(t))) ?? '';
}

export function guessGender(nome) {
  const p = norm(primeiroNome(nome));
  if (p.length < 2) return { genero: null, fonte: null, confianca: 'nenhuma' };
  if (NOMES.M.includes(p)) return { genero: 'M', fonte: 'dicionário', confianca: 'alta' };
  if (NOMES.F.includes(p)) return { genero: 'F', fonte: 'dicionário', confianca: 'alta' };
  if (NOMES.ambiguos.includes(p)) return { genero: null, fonte: 'dicionário', confianca: 'ambíguo' };
  return { genero: null, fonte: null, confianca: 'nenhuma' };
}

// ---------- qualificação (regras do passo a passo da Fuctura) ----------

/**
 * Adulto:  M qualificado, exceto se só clicou no anúncio ("Não interagiu") -> desqualificado
 *          F desqualificada, exceto se fez agendamento completo -> qualificada
 * Kids:    M desqualificado, exceto agendamento completo -> qualificado
 *          F qualificada, exceto se só clicou no anúncio -> desqualificada
 */
export function qualify({ planilha, genero, status }) {
  if (!planilha) return { qualificacao: '', motivo: 'planilha (Adulto/Kids) indefinida', revisar: true };
  if (!genero) return { qualificacao: '', motivo: 'gênero indefinido', revisar: true };
  const nao = status === 'Não interagiu';
  const agendou = status === 'Agendado';
  const Q = 'Qualificado';
  const D = 'Desqualificado';
  let q;
  if (planilha === 'Adulto') q = genero === 'M' ? (nao ? D : Q) : agendou ? Q : D;
  else q = genero === 'M' ? (agendou ? Q : D) : nao ? D : Q;
  return { qualificacao: q, motivo: `${planilha}/${genero}/${status}`, revisar: false };
}

// ---------- linha final ----------

/**
 * @param lead  { protocolo, data:'dd/mm/aaaa', hora:'hh:mm:ss', nome, whatsapp, status, canal }
 * @param msgs  mensagens já sem duplicatas
 * @param ai    resultado opcional da IA (ver ai.js)
 */
export function buildRow(lead, msgs, cfg = {}, ai = null) {
  const frase = extractFrase(msgs);
  const origem = classifyOrigin(frase, cfg);
  const st = classifyStatus(msgs, cfg);
  const motivos = [];
  let revisar = st.revisar;

  let status = st.status;
  if (ai?.status && ai.status !== status && ['Não quero', 'Agendado', 'Conversa Iniciada', 'Não interagiu'].includes(ai.status) && !/interação$/.test(status)) {
    // IA só pode contrariar a regra nos casos subjetivos; regras objetivas (Não interagiu) prevalecem.
    if (st.status !== 'Não interagiu') {
      motivos.push(`IA mudou status ${status}→${ai.status}`);
      status = ai.status;
      revisar = true;
    }
  }

  let g = guessGender(lead.nome);
  if (!g.genero && ai?.genero && ['M', 'F'].includes(ai.genero)) {
    g = { genero: ai.genero, fonte: 'IA', confianca: ai.confianca_genero ?? 'media' };
    if (g.confianca !== 'alta') revisar = true;
  }

  const planilha = origem.planilha ?? ai?.planilha ?? null;
  const q = qualify({ planilha, genero: g.genero, status });
  if (q.revisar) {
    revisar = true;
    motivos.push(q.motivo);
  }
  if (st.revisar) motivos.push(st.motivo);
  if (origem.tipo !== 'campanha') motivos.push(`origem: ${origem.tipo}`);

  return {
    protocolo: lead.protocolo,
    chegada: `${lead.data} ${lead.hora}`,
    data: lead.data,
    qualificacao: q.qualificacao,
    status,
    nome: lead.nome,
    fone: phoneForSheet(lead.whatsapp),
    frase,
    email: st.ag.email ?? ai?.agendamento?.email ?? '',
    resumo: ai?.resumo_agendamento ?? '',
    planilha: planilha ?? '',
    tipoOrigem: origem.tipo,
    genero: g.genero ?? '',
    generoFonte: g.fonte ?? '',
    generoConfianca: g.confianca,
    revisar,
    motivos: [...new Set(motivos)].join('; '),
    canal: lead.canal,
    statusLiv: lead.status,
  };
}
