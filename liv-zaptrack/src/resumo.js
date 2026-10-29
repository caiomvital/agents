// Resumo da conversa para o vendedor (até 500 caracteres), gerado pela API da Anthropic.
// Desligado por padrão: só roda com --resumo (ou resumo.ativo no config) e ANTHROPIC_API_KEY.
// O que NÃO vai para a API: telefone, e-mail (mascarados), nome do contato e a coluna de telefone da linha.
// Nomes que o lead digitou dentro da conversa seguem no texto (a API precisa dele para entender o contexto).

import { brParaISO, hojeISO } from './dates.js';

const URL_API = 'https://api.anthropic.com/v1/messages';
const MODELO_PADRAO = 'claude-sonnet-5-5';
const DIA_MS = 86400000;
const RETENTAR = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

const isoParaMs = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- último contato (calculado aqui, não pelo modelo) ----------

/** Último contato do LEAD (ou da conversa, se o lead não escreveu). `at` vem como "dd/mm/aaaa hh:mm:ss". */
export function ultimoContato(msgs, agora = new Date()) {
  const doLead = msgs.filter((m) => m.role === 'lead' && m.at);
  const ult = (doLead.length ? doLead : msgs.filter((m) => m.at)).at(-1);
  const m = ult?.at.match(/(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{2}:\d{2}))?/);
  if (!m) return null;
  const dias = Math.max(0, Math.round((isoParaMs(hojeISO(agora)) - isoParaMs(brParaISO(m[1]))) / DIA_MS));
  const frase = dias === 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`;
  return { quando: m[2] ? `${m[1]} ${m[2]}` : m[1], dias, frase };
}

// ---------- privacidade ----------

/** Mascara e-mails e telefones. Datas (13/10/2026), horários (8h30, 19:00) e valores curtos ficam intactos. */
export function redigir(texto) {
  return String(texto ?? '')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[e-mail]')
    .replace(/\+?\d[\d\s().-]{8,}\d/g, '[telefone]');
}

/** Conversa em texto enxuto: "[dd/mm hh:mm] LEAD|BOT: ...". Corta mensagens longas e, se passar do limite, mantém começo e fim. */
export function montarTranscricao(msgs, { maxChars = 7000, maxLead = 400, maxBot = 280 } = {}) {
  const linhas = msgs.map((m) => {
    const t = redigir(m.text).replace(/\s+/g, ' ').trim();
    const lim = m.role === 'lead' ? maxLead : maxBot;
    const hora = m.at?.match(/(\d{2}\/\d{2})\/\d{4}\s+(\d{2}:\d{2})/);
    return `[${hora ? `${hora[1]} ${hora[2]}` : '--'}] ${m.role === 'lead' ? 'LEAD' : 'BOT'}: ${t.length > lim ? `${t.slice(0, lim)}…` : t}`;
  });
  const total = linhas.join('\n');
  if (total.length <= maxChars) return total;
  const inicio = linhas.slice(0, 10);
  const fim = [];
  let usado = inicio.join('\n').length;
  for (let i = linhas.length - 1; i >= 10 && usado + linhas[i].length + 1 < maxChars; i--) {
    fim.unshift(linhas[i]);
    usado += linhas[i].length + 1;
  }
  return [...inicio, '[… trecho do meio omitido …]', ...fim].join('\n');
}

// ---------- limite de caracteres ----------

/** Tira marcação de markdown e garante o limite, preferindo cortar no fim de uma frase. */
export function limitar(texto, max = 500) {
  const t = String(texto ?? '')
    .replace(/[*`#]+/g, '')
    .replace(/^\s*[-•>]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  const i = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('! '), corte.lastIndexOf('? '));
  if (i >= max * 0.5) return corte.slice(0, i + 1).trim();
  return `${corte.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

// ---------- resumo sem IA (lead que só clicou no anúncio) ----------

export function resumoDeterministico({ msgs, linha = {}, agora = new Date(), maxCaracteres = 500 }) {
  const primeira = (msgs.find((m) => m.role === 'lead')?.text ?? '').replace(/\s+/g, ' ').trim();
  const origem = primeira ? ` ("${redigir(primeira).slice(0, 70)}")` : '';
  const uc = ultimoContato(msgs, agora);
  const publico = linha.planilha === 'Kids' ? 'o curso Kids' : linha.planilha === 'Adulto' ? 'o curso para adultos' : 'os cursos';
  return limitar(
    `Clicou no anúncio${origem} sobre ${publico} e não respondeu ao bot. ` +
      `${uc ? `Último contato ${uc.frase}. ` : ''}Próxima ação: fazer contato ativo (mensagem ou ligação) para entender o interesse.`,
    maxCaracteres,
  );
}

// ---------- chamada à API ----------

function sistema(maxCaracteres) {
  return `Você prepara um resumo para o VENDEDOR de uma escola de tecnologia (Fuctura, Recife) que vai continuar o atendimento de um lead iniciado por um chatbot no WhatsApp.

Escreva em português do Brasil, em texto corrido, com NO MÁXIMO ${maxCaracteres - 50} caracteres. Sem markdown, sem emojis, sem listas, sem títulos. Não escreva nomes de pessoas, e-mails nem telefones.

Use apenas fatos da conversa. Não invente valores, horários, descontos nem promessas. O que não aparece na conversa, não existe.

Cubra, nesta ordem e de forma bem curta:
1. Interesse: curso ou área, para quem (adulto, criança) e o objetivo do lead, se ele disse.
2. O que o lead perguntou ou pediu (valores, horários, endereço, conteúdo...).
3. O que o bot respondeu ou ofereceu e a decisão do lead: agendou aula experimental (diga o dia ou turno), recusou, ficou de pensar ou parou de responder.
4. "Último contato" seguido EXATAMENTE da expressão de tempo fornecida (por exemplo "Último contato há 3 dias.").
5. "Próxima ação:" uma ação concreta para o vendedor (por exemplo confirmar a aula experimental, responder a dúvida sobre valores, retomar o contato).

Se o lead fez uma pergunta que o bot não respondeu direito, ou se o bot repetiu mensagens ou se perdeu, diga isso na próxima ação para o vendedor retomar o ponto. Se o lead agendou, diga que falta confirmar com ele.`;
}

async function chamar(corpo, { apiKey, fetchImpl, tentativas = 3, esperaMs = 1000, timeoutMs = 60000 }) {
  for (let i = 1; i <= tentativas; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetchImpl(URL_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(corpo),
        signal: ctrl.signal,
      });
      if (r.ok) return await r.json();
      const erro = new Error(`API ${r.status}: ${(await r.text()).slice(0, 200)}`);
      erro.retentar = RETENTAR.has(r.status);
      throw erro;
    } catch (e) {
      if (e.retentar === false || i === tentativas) throw e; // erro de requisição (400/401/403/404...): não adianta repetir
      await dormir(esperaMs * 2 ** (i - 1));
    } finally {
      clearTimeout(timer);
    }
  }
}

const textoDe = (data) => (data.content ?? []).map((c) => c.text ?? '').join('').trim();

/**
 * Resume a conversa para o vendedor.
 * @returns {{ texto: string, fonte: 'regra'|'ia', entrada?: number, saida?: number }}
 */
export async function resumirConversa({
  lead,
  msgs,
  linha = {},
  apiKey,
  modelo = MODELO_PADRAO,
  maxCaracteres = 500,
  maxTokens = 300,
  apenasComInteracao = true,
  agora = new Date(),
  fetchImpl = fetch,
  esperaMs = 1000,
}) {
  const respostasDoLead = msgs.filter((m) => m.role === 'lead').length;
  if (apenasComInteracao && respostasDoLead <= 1) {
    return { texto: resumoDeterministico({ msgs, linha, agora, maxCaracteres }), fonte: 'regra' };
  }
  if (!apiKey) throw new Error('Defina ANTHROPIC_API_KEY para gerar o resumo com IA.');

  const uc = ultimoContato(msgs, agora);
  const hoje = hojeISO(agora).split('-').reverse().join('/');
  const usuario = [
    `Hoje: ${hoje}.`,
    `Mensagem de origem (campanha): ${redigir(msgs.find((m) => m.role === 'lead')?.text ?? '').replace(/\s+/g, ' ').slice(0, 160)}`,
    linha.planilha ? `Público provável: ${linha.planilha === 'Kids' ? 'crianças (curso Kids)' : 'adultos'}.` : '',
    linha.status ? `Status calculado pelo sistema: ${linha.status}.` : '',
    uc ? `Último contato do lead: ${uc.quando}. Escreva exatamente "Último contato ${uc.frase}".` : '',
    '',
    'Conversa:',
    montarTranscricao(msgs),
  ]
    .filter((l, i, arr) => l !== '' || arr[i - 1] !== '')
    .join('\n');

  const dados = { apiKey, fetchImpl, esperaMs };
  let uso = { entrada: 0, saida: 0 };
  const somar = (d) => {
    uso = { entrada: uso.entrada + (d.usage?.input_tokens ?? 0), saida: uso.saida + (d.usage?.output_tokens ?? 0) };
  };

  const r1 = await chamar({ model: modelo, max_tokens: maxTokens, system: sistema(maxCaracteres), messages: [{ role: 'user', content: usuario }] }, dados);
  somar(r1);
  let texto = textoDe(r1);
  if (!texto) throw new Error('A IA respondeu sem texto.');

  // Passou do limite: pede uma versão mais curta (uma vez) e, em último caso, corta no fim de uma frase.
  if (limitar(texto, 100000).length > maxCaracteres) {
    const r2 = await chamar(
      {
        model: modelo,
        max_tokens: maxTokens,
        system: sistema(maxCaracteres),
        messages: [
          { role: 'user', content: usuario },
          { role: 'assistant', content: texto },
          { role: 'user', content: `Passou de ${maxCaracteres} caracteres. Reescreva em no máximo ${maxCaracteres - 100} caracteres, mantendo "Último contato" e "Próxima ação:".` },
        ],
      },
      dados,
    );
    somar(r2);
    texto = textoDe(r2) || texto;
  }
  return { texto: limitar(texto, maxCaracteres), fonte: 'ia', ...uso };
}
