// Regras puras (sem rede, sem navegador): transformam mensagens da Liv em colunas da Zap Track.
// Tudo aqui é determinístico e testável. Itens duvidosos saem marcados com `revisar`.

import { readFileSync } from 'node:fs';

const NOMES = JSON.parse(readFileSync(new URL('./data/nomes.json', import.meta.url), 'utf8'));

export const norm = (s) =>
  String(s ?? '')
    .normalize('NFKC') // letras estilizadas (𝑹𝒆𝒗𝒊𝒂𝒏𝒆) viram letras comuns
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
const TURNO = /\b(manh[ãa]|tarde|noite|turno|turma)\b/i;

export function extractSchedule(msgs) {
  const lead = leadMsgs(msgs);
  const email = lead.map((m) => m.text.match(EMAIL)?.[0]).find(Boolean) ?? null;
  // Muitas vezes o lead só escreve "Terça" e o horário aparece na confirmação do bot ("terça, das 19h às 22h").
  // Só valem mensagens de confirmação, nunca as listas de opções oferecidas.
  const confirmacoes = msgs.filter((m) => m.role !== 'lead' && /\b(revisando|atualizando):|agendad[ao] para|voc[eê] escolheu/i.test(m.text) && !/\bop[cç][oõ]es\b/i.test(m.text));
  const dia = lead.map((m) => m.text.match(DIA)?.[0]).find(Boolean) ?? confirmacoes.map((m) => m.text.match(DIA)?.[0]).find(Boolean) ?? null;
  const horario = lead.map((m) => m.text.match(HORA)?.[0]?.trim()).find(Boolean) ?? confirmacoes.map((m) => m.text.match(HORA)?.[0]?.trim()).find(Boolean) ?? null;
  // Turno/turma: "manhã", "tarde", "noite", "turma"… dito pelo lead ou confirmado pelo bot.
  const turno = lead.map((m) => m.text.match(TURNO)?.[0]).find(Boolean) ?? confirmacoes.map((m) => m.text.match(TURNO)?.[0]).find(Boolean) ?? null;

  // nome completo: resposta do lead logo depois de o bot pedir "nome completo"
  let nome = null;
  for (let i = 0; i < msgs.length - 1; i++) {
    if (msgs[i].role !== 'lead' && /nome completo/i.test(msgs[i].text)) {
      const prox = msgs.slice(i + 1).find((m) => m.role === 'lead');
      const txt = limpoNome(prox?.text.replace(EMAIL, '').replace(/\s+/g, ' ').trim());
      if (txt && txt.length >= 3) {
        nome = txt;
        break;
      }
    }
  }
  // O nome também pode vir na recapitulação do bot ("Responsável: …" / "Revisando: Nome, e-mail …").
  if (!nome) {
    const r = recapitulacao(msgs) ?? '';
    nome = limpoNome(r.match(/respons[aá]vel:\s*(.+?)(?=\s*(?:\n|;|,|\s-\s|e-?mail\b|$))/i)?.[1] ?? r.match(/(?:revisando|atualizando):\s*([^,\n]+),\s*e-?mail/i)?.[1]);
  }
  // Agendado (regra da equipe): o lead passou nome, e-mail e turno/turma. O horário exato não é exigido.
  return { email, dia, horario, turno, nome, completo: Boolean(email && nome && (dia || turno)) };
}

// ---------- status ----------

export function classifyStatus(msgs, cfg = {}) {
  const lead = leadMsgs(msgs);
  const ag = extractSchedule(msgs);

  if (lead.length <= 1) {
    return { status: 'Não interagiu', motivo: 'lead só enviou a mensagem de origem', revisar: false, ag };
  }
  if (ag.completo) {
    return { status: 'Agendado', motivo: 'nome, e-mail e turno/turma informados', revisar: false, ag };
  }

  const padroes = (cfg.naoQuero?.padroes ?? []).map((p) => new RegExp(p, 'i'));
  const hit = lead.slice(1).find((m) => padroes.some((re) => re.test(m.text)));
  if (hit) {
    return { status: 'Não quero', motivo: `Status "Não quero" sugerido pelo texto "${hit.text.replace(/\s+/g, ' ').slice(0, 60)}"; confirmar`, revisar: true, ag };
  }

  const parcial = ag.email || ag.dia || ag.turno;
  const faltam = [!ag.nome && 'nome', !ag.email && 'e-mail', !(ag.dia || ag.turno) && 'turno/turma'].filter(Boolean);
  // A planilha real mistura "Conversa Iniciada" e "1o/2o/3o interação". O padrão segue o passo a passo
  // (Conversa Iniciada); com status.interacao = "contagem" usa o número de respostas do lead.
  const contagem = cfg.status?.interacao === 'contagem';
  const respostas = lead.length - 1;
  return {
    status: contagem ? `${respostas}o interação` : 'Conversa Iniciada',
    motivo: parcial ? `Agendamento incompleto: falta ${faltam.join(', ')}` : 'lead interagiu com o bot',
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

const SET_M = new Set(NOMES.M);
const SET_F = new Set(NOMES.F);
const SET_A = new Set(NOMES.ambiguos);

// Grafias variantes do mesmo nome (Priscyla/Priscila, Renatha/Renata, Ellen/Elen).
const variantes = (p) => [...new Set([p, p.replace(/y/g, 'i'), p.replace(/th/g, 't'), p.replace(/ph/g, 'f'), p.replace(/y/g, 'i').replace(/th/g, 't'), p.replace(/(.)\1+/g, '$1')])];

export function guessGender(nome) {
  const p = norm(primeiroNome(nome));
  if (p.length < 2) return { genero: null, fonte: null, confianca: 'nenhuma' };
  for (const v of variantes(p)) {
    if (SET_A.has(v)) return { genero: null, fonte: 'dicionário', confianca: 'ambíguo' };
    if (SET_M.has(v)) return { genero: 'M', fonte: 'dicionário', confianca: 'alta' };
    if (SET_F.has(v)) return { genero: 'F', fonte: 'dicionário', confianca: 'alta' };
  }
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
  if (!planilha) return { qualificacao: '', motivo: 'Não deu para definir Adulto ou Kids; qualificação não preenchida', revisar: true };
  if (!genero) return { qualificacao: '', motivo: 'Gênero não identificado pelo nome; qualificação não preenchida', revisar: true };
  const nao = status === 'Não interagiu';
  const agendou = status === 'Agendado';
  const Q = 'Qualificado';
  const D = 'Desqualificado';
  let q;
  if (planilha === 'Adulto') q = genero === 'M' ? (nao ? D : Q) : agendou ? Q : D;
  else q = genero === 'M' ? (agendou ? Q : D) : nao ? D : Q;
  return { qualificacao: q, motivo: `${planilha}/${genero}/${status}`, revisar: false };
}


// ---------- resumo do agendamento, aluno e nome real (a partir da recapitulação do bot) ----------

const RECAP = /\b(revisando|atualizando):/i;
const temPlaceholder = (t) => /\[[^\]\n]{2,40}\]/.test(t);

function recapitulacao(msgs) {
  const cand = msgs.filter((m) => RECAP.test(m.text));
  const boas = cand.filter((m) => !temPlaceholder(m.text));
  return (boas.at(-1) ?? cand.at(-1))?.text ?? null;
}

export function extractResumo(msgs) {
  const r = recapitulacao(msgs);
  if (!r) return '';
  return r
    .replace(/\s*\n\s*/g, ' ')
    .replace(/^.*?\b(?:revisando|atualizando):/i, '')
    .replace(/^[:\s-]+/, '')
    .replace(/(?:-\s*)?e-?mail:?\s*[\w.+-]+@[\w.-]+\.\w+,?/gi, '')
    .replace(new RegExp(EMAIL.source, 'g'), '')
    .replace(/\s+-\s+/g, '; ')
    .replace(/,\s*(?=[.,;])/g, '')
    .replace(/\s*est[aá] tudo certo\??.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Só aceita algo com cara de nome de pessoa: sem perguntas, números, nem respostas soltas ("sim", "que horas tem").
const NAO_NOME = /\?|[\[\d]|n[aã]o informado|\b(que|qual|quanto|quando|como|onde|horas?|hor[aá]rio|valor|valores|pre[cç]o|obrigad[oa]|sim|n[aã]o|ok|certo|bom dia|boa tarde|boa noite)\b/i;
const limpoNome = (n) => {
  const t = n?.trim().replace(/[.,;]+$/, '');
  if (!t || NAO_NOME.test(t) || t.split(/\s+/).length > 7) return null;
  return t;
};

export function extractFilho(msgs) {
  const r = recapitulacao(msgs) ?? '';
  const a = r.match(/nome do aluno:\s*(.+?)(?=\s*(?:\n|;|\s-\s|idade\b|$))/i)?.[1];
  const b = r.match(/(?:revisando|atualizando):\s*([^,\n]+),\s*\d+\s*anos/i)?.[1];
  return limpoNome(a) ?? limpoNome(b) ?? '';
}

/** Nome real informado na conversa (o contato da Liv costuma ser o apelido do WhatsApp). */
export function extractNomeReal(msgs, contato = '') {
  const r = recapitulacao(msgs) ?? '';
  const cand =
    r.match(/respons[aá]vel:\s*(.+?)(?=\s*(?:\n|;|,|\s-\s|e-?mail\b|$))/i)?.[1] ??
    r.match(/(?:revisando|atualizando):\s*([^,\n]+),\s*e-?mail/i)?.[1] ??
    extractSchedule(msgs).nome;
  const nome = limpoNome(cand);
  if (!nome || norm(nome) === norm(contato)) return '';
  return nome;
}

// ---------- planilha inferida pela conversa ----------

export function inferPlanilha(msgs, status) {
  const t = norm(msgs.map((m) => m.text).join(' '));
  if (/(crianca|kids|filho|filha|nome do aluno|responsavel|\b\d{1,2} anos)/.test(t)) return { planilha: 'Kids', fonte: 'a conversa usa palavras de Kids (criança, filho, aluno…)' };
  // A equipe lança na aba Adulto o que não tem pista de Kids, inclusive saudações sem interação.
  return { planilha: 'Adulto', fonte: 'sem pista de Kids na conversa' };
}

// ---------- erros do bot (a conferir) ----------

const palavras = (t) => new Set(norm(t).split(/\W+/).filter((w) => w.length > 3));
const parecidas = (a, b) => {
  const A = palavras(a);
  const B = palavras(b);
  if (A.size < 6 || B.size < 6) return false;
  let i = 0;
  for (const w of A) if (B.has(w)) i++;
  return i / (A.size + B.size - i) >= 0.7;
};
const ENCERRAMENTO = /atendimento finalizado|1 min,? ja volto|at[eé] mais|at[eé] a aula/i;
const PERGUNTA = /\?|quero saber|\bqual\b|\bquanto|valor|pre[cç]o|hor[aá]rio/i;
const corta = (t, n = 50) => t.replace(/\s+/g, ' ').slice(0, n);

/**
 * Procura desvios no comportamento do bot. Regras embutidas (a partir das conversas observadas) mais regras
 * da equipe em cfg.botRegras. Retorna uma lista de textos curtos; vazio = nada a conferir.
 */
export function detectBotErrors(msgs, cfg = {}) {
  const regras = cfg.botRegras ?? {};
  const erros = [];
  const bot = (m) => m.role !== 'lead';

  // 1) texto-modelo que vazou para o lead, como "[seu filho]"
  const ph = msgs.find((m) => bot(m) && temPlaceholder(m.text));
  if (ph) erros.push(`texto-modelo vazou: "${ph.text.match(/\[[^\]\n]{2,40}\]/)[0]}"`);

  // 2) mesma pergunta repetida em sequência (recapitulações repetem por desenho e ficam de fora)
  const bots = msgs.filter((m) => bot(m) && !RECAP.test(m.text) && !ENCERRAMENTO.test(m.text));
  for (let i = 1; i < bots.length; i++) {
    if (parecidas(bots[i - 1].text, bots[i].text)) {
      erros.push(`repetiu a mesma mensagem: "${corta(bots[i].text)}"`);
      break;
    }
  }

  // 3) lead perguntou algo e o bot só se despediu (ou nada)
  const iUltimoLead = msgs.map((m) => m.role).lastIndexOf('lead');
  if (iUltimoLead >= 0 && PERGUNTA.test(msgs[iUltimoLead].text)) {
    const depois = msgs.slice(iUltimoLead + 1).filter(bot);
    if (!depois.some((m) => !ENCERRAMENTO.test(m.text))) erros.push(`pergunta do lead sem resposta: "${corta(msgs[iUltimoLead].text)}"`);
  }

  // 4) lead perguntou valor e a resposta seguinte não trata de valor
  const pergValor = /\b(valor|valores|quanto custa|pre[cç]o|mensalidade)\b/i;
  const respValor = /R\$|valor|pre[cç]o|mensalidade|equipe|ligar|contato|promo/i;
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].role === 'lead' && pergValor.test(msgs[i].text)) {
      const prox = msgs.slice(i + 1).find(bot);
      if (prox && !ENCERRAMENTO.test(prox.text) && !respValor.test(prox.text)) {
        erros.push(`pergunta de valor sem resposta sobre valor: "${corta(msgs[i].text)}"`);
        break;
      }
    }
  }

  // 5) bot pediu o e-mail de novo depois de o lead já ter informado
  const iEmail = msgs.findIndex((m) => m.role === 'lead' && EMAIL.test(m.text));
  if (iEmail >= 0) {
    const de_novo = msgs.slice(iEmail + 1).find((m) => bot(m) && /e-?mail/i.test(m.text) && /(qual|inform[ae]r?|pass[ae]r?|me passe|preciso|poderia|pode me)/i.test(m.text) && !RECAP.test(m.text));
    if (de_novo) erros.push(`pediu o e-mail de novo: "${corta(de_novo.text)}"`);
  }

  // 6) regras da equipe
  if (regras.precoProibido) {
    const m = msgs.find((x) => bot(x) && /R\$\s*\d/.test(x.text));
    if (m) erros.push(`citou preço: "${corta(m.text)}"`);
  }
  for (const r of regras.proibidoNoBot ?? []) {
    const m = msgs.find((x) => bot(x) && new RegExp(r.padrao, 'i').test(x.text));
    if (m) erros.push(`${r.nome}: "${corta(m.text)}"`);
  }
  for (const r of regras.obrigatorioAposLead ?? []) {
    const quando = new RegExp(r.quando, 'i');
    const entao = new RegExp(r.entao, 'i');
    for (let i = 0; i < msgs.length; i++) {
      if (msgs[i].role === 'lead' && quando.test(msgs[i].text)) {
        const prox = msgs.slice(i + 1).find(bot);
        if (prox && !entao.test(prox.text)) {
          erros.push(`${r.nome}: lead "${corta(msgs[i].text, 40)}"`);
          break;
        }
      }
    }
  }
  return erros;
}

// ---------- contatos internos ----------

const tokensNome = (n) => norm(n).split(/[^a-z0-9]+/).filter((t) => t.length >= 3);

/**
 * O contato é alguém da equipe? Compara com os atendentes cadastrados na Liv. Só vale atendente de nome composto
 * (todas as palavras presentes no contato), para não descartar um lead que se chame apenas "Joana" ou "Caio".
 */
export function combinaComAtendente(nomeContato, atendentes = []) {
  const c = new Set(tokensNome(nomeContato));
  return atendentes.find((a) => {
    const t = tokensNome(a.nome);
    return t.length >= 2 && t.every((x) => c.has(x));
  }) ?? null;
}

/** Nome que só PARECE interno (não descarta; avisa). */
export function dicaDeContatoInterno(nome, cfg = {}) {
  const padroes = cfg.ignorar?.dicasNome ?? ['fuctura', '\\bteste\\b'];
  return padroes.some((p) => new RegExp(p, 'i').test(nome));
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
  if (status === 'Não interagiu' && norm(origem.prefixo ?? '') === 'form' && cfg.origens?.formularioComoInteracao !== false) {
    // "Form- Confirmei uma aula gratuita": o lead já confirmou a aula pelo formulário. Em 12 e 13/10 a equipe lançou
    // 6 de 8 desses leads como Agendado e 2 como Conversa Iniciada.
    status = cfg.origens?.formularioStatus ?? 'Agendado';
    motivos.push(`Lead de formulário (confirmou aula gratuita): lançado como ${status}; a equipe usa Agendado na maioria e Conversa Iniciada em alguns`);
    revisar = true;
  }
  if (status === 'Agendado' && st.status === 'Agendado' && cfg.avisoAgendadoPeloBot === true) {
    motivos.push('Agendado pelo bot (nome, e-mail e turno/turma informados)');
    revisar = true;
  }
  if (ai?.status && ai.status !== status && ['Não quero', 'Agendado', 'Conversa Iniciada', 'Não interagiu'].includes(ai.status) && !/interação$/.test(status)) {
    // IA só pode contrariar a regra nos casos subjetivos; regras objetivas (Não interagiu) prevalecem.
    if (st.status !== 'Não interagiu') {
      motivos.push(`IA sugeriu mudar o status de "${status}" para "${ai.status}"`);
      status = ai.status;
      revisar = true;
    }
  }

  const nomeReal = extractNomeReal(msgs, lead.nome);
  let g = guessGender(lead.nome);
  if (!g.genero && nomeReal) {
    const g2 = guessGender(nomeReal);
    if (g2.genero) g = { ...g2, fonte: 'dicionário (nome na conversa)' };
  }
  if (!g.genero && ai?.genero && ['M', 'F'].includes(ai.genero)) {
    g = { genero: ai.genero, fonte: 'IA', confianca: ai.confianca_genero ?? 'media' };
    if (g.confianca !== 'alta') {
      revisar = true;
      motivos.push(`Gênero sugerido pela IA com confiança ${g.confianca}`);
    }
  }

  if (lead.homonimoDe) {
    motivos.push(`Nome igual ao de ${lead.homonimoDe}; pode ser homônimo. Se for da equipe, acrescente o telefone em ignorar.telefones`);
    revisar = true;
  }
  if (dicaDeContatoInterno(lead.nome, cfg)) {
    motivos.push('Nome parece de contato interno (contém "Fuctura" ou "teste"); confirmar se conta como lead');
    revisar = true;
  }
  let planilha = origem.planilha ?? ai?.planilha ?? null;
  if (planilha && origem.fonte === 'padrão genérico' && norm(origem.prefixo ?? '') === 'form') {
    motivos.push(`Planilha ${planilha} assumida: lead de formulário sem pista de Adulto ou Kids`);
    revisar = true;
  }
  if (!planilha) {
    const inf = inferPlanilha(msgs, status);
    if (inf) {
      planilha = inf.planilha;
      motivos.push(`Planilha ${planilha} inferida: ${inf.fonte}`);
      revisar = true;
    }
  }
  const errosBot = detectBotErrors(msgs, cfg);
  if (errosBot.length) revisar = true;
  const q = qualify({ planilha, genero: g.genero, status });
  if (q.revisar) {
    revisar = true;
    motivos.push(q.motivo);
  }
  if (st.revisar) motivos.push(st.motivo);

  return {
    protocolo: lead.protocolo,
    chegada: `${lead.data} ${lead.hora}`,
    data: lead.data,
    qualificacao: q.qualificacao,
    status,
    nome: lead.nome,
    fone: phoneForSheet(lead.whatsapp),
    frase: origem.tipo === 'saudacao' ? `Saudação - ${frase}` : origem.tipo === 'duvida' ? `Dúvida - ${frase}` : frase,
    email: st.ag.email ?? ai?.agendamento?.email ?? '',
    resumo: ai?.resumo_agendamento || extractResumo(msgs),
    filho: extractFilho(msgs),
    nomeSugerido: nomeReal,
    errosBot: errosBot.map((e) => `• ${e}`).join('\n'),
    planilha: planilha ?? '',
    tipoOrigem: origem.tipo,
    genero: g.genero ?? '',
    generoFonte: g.fonte ?? '',
    generoConfianca: g.confianca,
    revisar,
    conferir: [...new Set(motivos)].map((m) => `• ${m}`).join('\n'),
    canal: lead.canal,
    statusLiv: lead.status,
  };
}
