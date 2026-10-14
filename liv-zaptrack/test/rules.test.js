import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRow, classifyOrigin, classifyStatus, dedupeMessages, extractSchedule, guessGender, phoneKey, phoneForSheet, qualify } from '../src/rules.js';
import { parseCSV, registrosDaPlanilha, chavesExistentes, chaveDoLead, ultimaData } from '../src/sheet.js';
import { extrairJSON, montarPrompt, classificarComIA } from '../src/ai.js';
import { diasEntre, hojeISO } from '../src/dates.js';

const cfg = {
  origens: { prefixos: { Pr: 'Adulto', Fb: 'Adulto', Rm3: 'Adulto', Kd: 'Kids' }, palavrasAdulto: ['adulto'], palavrasKids: ['kids', 'criança'] },
  naoQuero: { padroes: ['n[aã]o posso (esses|nesses) dias?', 'muito longe', 'n[aã]o posso agora'] },
};
const lead = (t, at = '13/10/2026 10:00:00') => ({ role: 'lead', autor: 'X', at, text: t });
const bot = (t, at = '13/10/2026 10:00:03') => ({ role: 'bot', autor: 'Assistente virtual', at, text: t });
const L = { protocolo: '830000000000001', data: '13/10/2026', hora: '10:00:00', nome: 'Daniel Teste', whatsapp: '558185550000', status: 'Encerrado pelo Sistema', canal: 'Canal X' };

test('telefone: ignora 55 e nono dígito; formato da planilha sem 55', () => {
  assert.equal(phoneKey('558187770001'), phoneKey('81987770001'));
  assert.equal(phoneKey('+55 (81) 9 8777-0001'), phoneKey('81987770001'));
  assert.equal(phoneForSheet('5581987770002'), '81987770002');
  assert.equal(phoneForSheet('558187770002'), '81987770002'); // Liv sem o nono dígito
  assert.equal(phoneForSheet('558133334444'), '8133334444'); // fixo não ganha 9
});

test('dedupe: primeira mensagem do lead vem duplicada na Liv', () => {
  const m = dedupeMessages([lead('Pr. Oi'), lead('Pr. Oi'), bot('Olá'), lead('Sim', '13/10/2026 10:05:00')]);
  assert.equal(m.length, 3);
});

test('origem: campanha com prefixo mapeado e por palavra-chave', () => {
  assert.deepEqual(pick(classifyOrigin('Pr. Sou iniciante e quero programação para adulto', cfg)), { tipo: 'campanha', planilha: 'Adulto' });
  assert.equal(classifyOrigin('Wz- Gostaria de marcar uma aula para criança', cfg).planilha, 'Kids');
  assert.equal(classifyOrigin('Form- Confirmei uma aula gratuita', cfg).planilha, null); // sem pista: revisar
  assert.equal(classifyOrigin('Diz ai', cfg).tipo, 'saudacao');
  assert.equal(classifyOrigin('Quanto custa o curso?', cfg).tipo, 'duvida');
});
const pick = (o) => ({ tipo: o.tipo, planilha: o.planilha });

test('status: Não interagiu quando só há a mensagem de origem', () => {
  assert.equal(classifyStatus([lead('Pr. x'), bot('Qual seu objetivo?')], cfg).status, 'Não interagiu');
});

test('status: Agendado exige e-mail + dia + horário', () => {
  const msgs = [lead('Ia. Quero saber mais'), bot('Qual seu nome completo?'), lead('Fulano de Tal da Silva'), bot('E-mail?'), lead('fulano@exemplo.com'), bot('Dia?'), lead('Sábado 8h30')];
  const s = classifyStatus(msgs, cfg);
  assert.equal(s.status, 'Agendado');
  assert.equal(s.ag.email, 'fulano@exemplo.com');
  assert.equal(s.ag.nome, 'Fulano de Tal da Silva');
});

test('status: dia e horário sem e-mail NÃO é Agendado (e fica para revisão)', () => {
  const s = classifyStatus([lead('Pr. x'), bot('Qual dia?'), lead('Sábado 8:30')], cfg);
  assert.equal(s.status, 'Conversa Iniciada');
  assert.equal(s.revisar, true);
});

test('status: Não quero por padrão, sempre marcado para revisão', () => {
  const s = classifyStatus([lead('Pr. x'), bot('Vamos agendar?'), lead('Não posso esses dias')], cfg);
  assert.equal(s.status, 'Não quero');
  assert.equal(s.revisar, true);
});

test('gênero: dicionário, título ignorado, ambíguo e desconhecido', () => {
  assert.equal(guessGender('Daniel Santini').genero, 'M');
  assert.equal(guessGender('Pr. Otavio Neto').genero, 'M');
  assert.equal(guessGender('Mary Santana').genero, 'F');
  assert.equal(guessGender('Dani').confianca, 'ambíguo');
  assert.equal(guessGender('brenne').genero, null);
  assert.equal(guessGender('😎').genero, null);
});

test('qualificação: tabela das quatro regras do passo a passo', () => {
  const q = (planilha, genero, status) => qualify({ planilha, genero, status }).qualificacao;
  // Adulto
  assert.equal(q('Adulto', 'M', 'Conversa Iniciada'), 'Qualificado');
  assert.equal(q('Adulto', 'M', 'Não interagiu'), 'Desqualificado');
  assert.equal(q('Adulto', 'F', 'Conversa Iniciada'), 'Desqualificado');
  assert.equal(q('Adulto', 'F', 'Agendado'), 'Qualificado');
  // Kids
  assert.equal(q('Kids', 'M', 'Conversa Iniciada'), 'Desqualificado');
  assert.equal(q('Kids', 'M', 'Agendado'), 'Qualificado');
  assert.equal(q('Kids', 'F', 'Conversa Iniciada'), 'Qualificado');
  assert.equal(q('Kids', 'F', 'Não interagiu'), 'Desqualificado');
  // dados faltando: não chuta
  assert.equal(q(null, 'M', 'Agendado'), '');
  assert.equal(q('Adulto', null, 'Agendado'), '');
});

test('linha completa: homem, planilha adulta, conversa iniciada', () => {
  const msgs = [lead('Pr. Sou iniciante e quero saber mais sobre programação para adulto'), bot('Qual seu objetivo?'), lead('Aprender Java', '13/10/2026 10:02:00')];
  const r = buildRow(L, msgs, cfg);
  assert.equal(r.qualificacao, 'Qualificado');
  assert.equal(r.status, 'Conversa Iniciada');
  assert.equal(r.fone, '81985550000');
  assert.equal(r.frase, 'Pr. Sou iniciante e quero saber mais sobre programação para adulto');
  assert.equal(r.revisar, false);
});

test('linha: gênero desconhecido => qualificação vazia e revisar', () => {
  const r = buildRow({ ...L, nome: 'brenne' }, [lead('Pr. Quero programação para adulto'), bot('Oi'), lead('ok')], cfg);
  assert.equal(r.qualificacao, '');
  assert.equal(r.revisar, true);
});

test('IA preenche gênero só quando o dicionário não sabe; "Não interagiu" objetivo prevalece', () => {
  const msgs = [lead('Pr. Quero programação para adulto'), bot('Oi')];
  const r = buildRow({ ...L, nome: 'brenne' }, msgs, cfg, { genero: 'F', confianca_genero: 'media', status: 'Agendado' });
  assert.equal(r.genero, 'F');
  assert.equal(r.status, 'Não interagiu');
  assert.equal(r.revisar, true);
  const r2 = buildRow(L, [lead('Pr. adulto'), bot('x'), lead('y')], cfg, { genero: 'F' });
  assert.equal(r2.genero, 'M'); // dicionário vence a IA
});

test('extractSchedule não confunde e-mail com nome', () => {
  const s = extractSchedule([bot('Qual seu nome completo?'), lead('a@b.co')]);
  assert.equal(s.nome, null);
});

// ---------- planilha ----------
test('CSV: aspas, vírgulas e cabeçalhos; dedupe por telefone+dia', () => {
  const csv = 'Data,Qualificação,Status,NOME,FONE,FRASE\n13/10/2026,Qualificado,Conversa Iniciada,Daniel,81985550000,"Sb. Oi, tudo bem?"\n09/10/2026,Qualificado,Agendado,Alexandre,81987770003,Pr. x\n';
  const reg = registrosDaPlanilha(parseCSV(csv));
  assert.equal(reg.length, 2);
  const chaves = chavesExistentes(reg);
  assert.ok(chaves.has(chaveDoLead('558185550000', '13/10/2026'))); // 55 e sem nono dígito
  assert.ok(!chaves.has(chaveDoLead('558185550000', '14/10/2026')));
  assert.equal(ultimaData(reg), '2026-10-13');
});

// ---------- IA ----------
test('IA: extrai JSON mesmo com texto em volta; prompt omite telefone por padrão', async () => {
  assert.equal(extrairJSON('Claro:\n{"genero":"M"}\nfim').genero, 'M');
  assert.ok(!montarPrompt(L, [lead('oi')]).includes('Telefone'));
  const fake = async () => ({ ok: true, json: async () => ({ content: [{ text: '{"genero":"F","status":"Conversa Iniciada"}' }] }) });
  const r = await classificarComIA(L, [lead('oi')], { apiKey: 'k', modelo: 'm', fetchImpl: fake });
  assert.equal(r.genero, 'F');
  await assert.rejects(() => classificarComIA(L, [], { modelo: 'm' }), /ANTHROPIC_API_KEY/);
});

// ---------- datas ----------
test('datas: intervalo e fuso de Brasília', () => {
  assert.deepEqual(diasEntre('2026-10-30', '2026-11-02'), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  assert.equal(hojeISO(new Date('2026-10-14T01:00:00Z')), '2026-10-13');
});

// ---------- ajustes a partir da planilha real ----------
const cfg2 = {
  origens: { prefixos: { RM3: 'Adulto', 'RC*': 'Kids' }, genericos: ['Fb', 'Sb', 'Pr'], padraoGenerico: 'Adulto', palavrasAdulto: ['adulto'], palavrasKids: ['kids', 'adolescente'] },
  naoQuero: { padroes: [] },
};
test('origem: RM3 adulto, RC* kids, genérico com pista de Kids, genérico sem pista cai em Adulto', () => {
  assert.equal(classifyOrigin('RM3 - Gostaria de conhecer o Curso de Programação para Adultos da Fuctura', cfg2).planilha, 'Adulto');
  assert.equal(classifyOrigin('RC05- Quero informação sobre Programação Kids', cfg2).planilha, 'Kids');
  assert.equal(classifyOrigin('RC09- Gostaria de saber mais informações sobre o curso', cfg2).planilha, 'Kids');
  assert.equal(classifyOrigin('Fb. Gostaria de saber sobre curso de programação Kids', cfg2).planilha, 'Kids');
  const g = classifyOrigin('Fb. Gostaria de saber sobre curso de programação', cfg2);
  assert.equal(g.planilha, 'Adulto');
  assert.equal(g.fonte, 'padrão genérico');
});

test('status: modo contagem produz "No interação" e o padrão continua Conversa Iniciada', () => {
  const msgs = [lead('Pr. x'), bot('?'), lead('a', '13/10/2026 10:01:00'), bot('?'), lead('b', '13/10/2026 10:02:00')];
  assert.equal(classifyStatus(msgs, {}).status, 'Conversa Iniciada');
  assert.equal(classifyStatus(msgs, { status: { interacao: 'contagem' } }).status, '2o interação');
});

test('qualificação usa a grafia pedida: Desqualificado', () => {
  assert.equal(qualify({ planilha: 'Adulto', genero: 'M', status: 'Não interagiu' }).qualificacao, 'Desqualificado');
});

// ---------- resumo, aluno, nome real, planilha inferida, erros do bot ----------
import { extractResumo, extractFilho, extractNomeReal, inferPlanilha, detectBotErrors } from '../src/rules.js';

const kidsLista = [
  lead('K2- Quero saber do curso para crianças'),
  bot('Qual o nome completo do responsável e o e-mail?'),
  lead('Beatriz Souza Lima beatriz@exemplo.com'),
  bot('Revisando: - Nome do aluno: [seu filho] - Idade: 8 anos - Responsável: Beatriz Souza Lima - E-mail: beatriz@exemplo.com - Aula experimental: sábado às 13h30. Está tudo certo?'),
  lead('Revisando: - Nome do aluno: Pedrinho Souza - Idade: 8 anos - Responsável: Beatriz Souza Lima - E-mail: beatriz@exemplo.com - Aula experimental: sábado às 13h30'),
  bot('Perfeito! A equipe entrará em contato para confirmar.'),
];

test('resumo: usa a recapitulação do bot, sem e-mail e sem "está tudo certo"', () => {
  const r = extractResumo(kidsLista);
  assert.ok(r.includes('Aula experimental: sábado às 13h30'));
  assert.ok(!r.includes('@'));
  assert.ok(!/tudo certo/i.test(r));
  const adulto = [lead('Pr. x'), bot('Revisando: Carlos Silva, e-mail: carlos@exemplo.com. Aula experimental na terça, das 19h às 22h. Está tudo certo?')];
  assert.equal(extractResumo(adulto), 'Carlos Silva. Aula experimental na terça, das 19h às 22h.');
  assert.equal(extractResumo([lead('oi')]), '');
});

test('aluno: lê "Nome do aluno" e ignora texto-modelo; formato curto também funciona', () => {
  assert.equal(extractFilho(kidsLista), 'Pedrinho Souza');
  assert.equal(extractFilho([bot('Revisando: Nicoly, 10 anos, sem experiência. Responsável: Clebio, x@y.co. Aula no sábado.')]), 'Nicoly');
  assert.equal(extractFilho([bot('Revisando: - Nome do aluno: [não informado] - Idade: 8 anos')]), '');
});

test('nome real: pega o responsável da conversa e ignora quando é igual ao contato', () => {
  assert.equal(extractNomeReal(kidsLista, 'Deus é mais'), 'Beatriz Souza Lima');
  assert.equal(extractNomeReal(kidsLista, 'Beatriz Souza Lima'), '');
});

test('gênero usa o nome da conversa quando o contato é apelido', () => {
  const r = buildRow({ ...L, nome: 'Deus é mais' }, kidsLista, cfg);
  assert.equal(r.nomeSugerido, 'Beatriz Souza Lima');
  assert.equal(r.genero, 'F');
  assert.equal(r.generoFonte, 'dicionário (nome na conversa)');
  assert.equal(r.filho, 'Pedrinho Souza');
});

test('planilha inferida pela conversa: Kids por palavras, Adulto por padrão se interagiu, nada se não interagiu', () => {
  assert.equal(inferPlanilha([lead('meu filho quer'), bot('ok')], 'Conversa Iniciada').planilha, 'Kids');
  assert.equal(inferPlanilha([lead('Boa noite'), bot('Olá'), lead('Quero aprender')], 'Conversa Iniciada').planilha, 'Adulto');
  assert.equal(inferPlanilha([lead('Diz ai'), bot('Olá')], 'Não interagiu'), null);
  const r = buildRow({ ...L, nome: 'Daniel' }, [lead('Boa noite'), bot('Olá'), lead('Quero aprender Java'), bot('Ótimo')], cfg);
  assert.equal(r.planilha, 'Adulto');
  assert.equal(r.revisar, true); // inferida: sempre conferir
});

test('erros do bot: texto-modelo, repetição, pergunta sem resposta, valor ignorado, e-mail pedido de novo', () => {
  assert.ok(detectBotErrors(kidsLista).some((e) => e.includes('texto-modelo vazou')));

  const rep = [lead('x'), bot('Você quer usar a IA para crescer na sua profissão ou para ganhar mais, com uma nova fonte de renda?'), lead('IA'), bot('Você quer usar a IA para crescer na sua profissão ou para ganhar mais, com uma nova fonte de renda?')];
  assert.ok(detectBotErrors(rep).some((e) => e.startsWith('repetiu')));

  const fim = [lead('x'), bot('Ok'), lead('Mas quero saber valores'), bot('Atendimento Finalizado com sucesso Obrigado!')];
  assert.ok(detectBotErrors(fim).some((e) => e.startsWith('pergunta do lead sem resposta')));

  const valor = [lead('x'), bot('Olá'), lead('Qual o valor?'), bot('Temos aulas na terça e no sábado, qual horário prefere?'), lead('sábado'), bot('Perfeito')];
  assert.ok(detectBotErrors(valor).some((e) => e.startsWith('pergunta de valor')));

  const mail = [lead('x'), bot('Qual seu e-mail?'), lead('a@b.co'), bot('Ótimo. Pode me informar seu e-mail?')];
  assert.ok(detectBotErrors(mail).some((e) => e.startsWith('pediu o e-mail de novo')));
});

test('erros do bot: conversa normal não gera falso alerta; regras da equipe funcionam', () => {
  const ok = [lead('Pr. Quero saber mais'), bot('Qual seu objetivo?'), lead('Aprender Java'), bot('Ótimo! Quer uma aula experimental?'), lead('Sim'), bot('Perfeito! A equipe entrará em contato.')];
  assert.deepEqual(detectBotErrors(ok), []);
  const preco = [lead('x'), bot('Custa R$ 247 por mês')];
  assert.deepEqual(detectBotErrors(preco, {}), []);
  assert.ok(detectBotErrors(preco, { botRegras: { precoProibido: true } })[0].startsWith('citou preço'));
  assert.ok(detectBotErrors(preco, { botRegras: { proibidoNoBot: [{ nome: 'prometeu desconto', padrao: '247' }] } })[0].startsWith('prometeu desconto'));
  const r = buildRow(L, [lead('Pr. adulto'), bot('Custa [valor]'), lead('ok')], cfg);
  assert.ok(r.errosBot.includes('texto-modelo'));
  assert.equal(r.revisar, true);
});
