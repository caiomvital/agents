// Etapa OPCIONAL de IA (API da Anthropic). Desligada por padrão: só roda com --ia e ANTHROPIC_API_KEY.
// Usada apenas onde regra simples não basta: gênero por nome desconhecido, "Não quero" e resumo do agendamento.
// Ainda não testada contra a API real (não havia chave); o parsing é coberto por teste com resposta simulada.

const SYSTEM = `Você ajuda a classificar leads de uma escola de tecnologia a partir da conversa de WhatsApp com um chatbot.
Responda SOMENTE com um objeto JSON, sem texto extra, neste formato:
{
 "genero": "M" | "F" | null,
 "confianca_genero": "alta" | "media" | "baixa",
 "planilha": "Adulto" | "Kids" | null,
 "status": "Não interagiu" | "Conversa Iniciada" | "Agendado" | "Não quero",
 "agendamento": { "nome": string|null, "dia": string|null, "horario": string|null, "email": string|null },
 "resumo_agendamento": string,
 "resumo": string
}
Regras: "Agendado" só se houver nome completo, dia, horário e e-mail. "Não quero" quando o lead recusa por
disponibilidade, distância ou dinheiro. "Não interagiu" se o lead só enviou a mensagem de origem.
Use genero=null se o nome não permitir inferir com segurança. "resumo" tem no máximo 2 frases.`;

export function montarPrompt(lead, msgs, { enviarTelefone = false } = {}) {
  const linhas = msgs.map((m) => `[${m.role === 'lead' ? 'LEAD' : 'BOT'}] ${m.text.replace(/\s+/g, ' ')}`);
  return `Nome do contato: ${lead.nome}\n${enviarTelefone ? `Telefone: ${lead.whatsapp}\n` : ''}Conversa:\n${linhas.join('\n')}`;
}

export function extrairJSON(texto) {
  const i = texto.indexOf('{');
  const j = texto.lastIndexOf('}');
  if (i < 0 || j < i) throw new Error('resposta da IA sem JSON');
  return JSON.parse(texto.slice(i, j + 1));
}

export async function classificarComIA(lead, msgs, { apiKey, modelo, maxTokens = 600, enviarTelefone = false, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error('Defina ANTHROPIC_API_KEY para usar --ia.');
  const resp = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: modelo,
      max_tokens: maxTokens,
      system: SYSTEM,
      messages: [{ role: 'user', content: montarPrompt(lead, msgs, { enviarTelefone }) }],
    }),
  });
  if (!resp.ok) throw new Error(`API da IA respondeu ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  return extrairJSON(data.content?.map((c) => c.text ?? '').join('') ?? '');
}
