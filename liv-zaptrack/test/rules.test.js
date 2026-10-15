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
const L = { protocolo: '830000000000001', data: '13/10/2026', hora: '10:00:00', nome: 'Daniel Souza', whatsapp: '558185550000', status: 'Encerrado pelo Sistema', canal: 'Canal X' };

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

test('planilha inferida pela conversa: Kids por palavras, senão Adulto (como a equipe lança)', () => {
  assert.equal(inferPlanilha([lead('meu filho quer'), bot('ok')], 'Conversa Iniciada').planilha, 'Kids');
  assert.equal(inferPlanilha([lead('Boa noite'), bot('Olá'), lead('Quero aprender')], 'Conversa Iniciada').planilha, 'Adulto');
  assert.equal(inferPlanilha([lead('Diz ai'), bot('Olá')], 'Não interagiu').planilha, 'Adulto');
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

test('Conferir: cada linha diz o que checar, em texto legível', () => {
  const parcial = buildRow({ ...L, nome: 'Daniel' }, [lead('Pr. adulto'), bot('Qual dia?'), lead('Sábado'), bot('Seu e-mail?')], cfg);
  assert.equal(parcial.revisar, true);
  assert.match(parcial.conferir, /Agendamento incompleto: falta nome, e-mail/);

  const semGenero = buildRow({ ...L, nome: 'brenne' }, [lead('Pr. Quero programação para adulto'), bot('Oi'), lead('ok')], cfg);
  assert.match(semGenero.conferir, /Gênero não identificado pelo nome/);

  const tudoCerto = buildRow(L, [lead('Pr. Quero programação para adulto'), bot('Oi'), lead('ok')], cfg);
  assert.equal(tudoCerto.conferir, '');
  assert.equal(tudoCerto.errosBot, '');

  const inferida = buildRow(L, [lead('Boa noite'), bot('Olá'), lead('Quero aprender')], cfg);
  assert.match(inferida.conferir, /Planilha Adulto inferida: sem pista de Kids na conversa/);
});

test('recapitulação precedida de "Perfeito!" também é reconhecida', () => {
  const m = [lead('x'), bot('Perfeito! Revisando: - Nome do aluno: Davi Lima - Idade: 8 anos - Responsável: Ana Lima - E-mail: a@b.co - Aula experimental: sábado às 15h30. Está tudo certo?')];
  assert.equal(extractFilho(m), 'Davi Lima');
  assert.equal(extractNomeReal(m, 'Apelido'), 'Ana Lima');
  assert.ok(extractResumo(m).startsWith('Nome do aluno: Davi Lima'));
  assert.ok(!extractResumo(m).includes('Perfeito'));
});

test('resumo: corta "Está tudo certo?" mesmo quando o lead acrescenta algo depois', () => {
  const m = [lead('Revisando: Ana Lima, e-mail: a@b.co. Aula na terça. Está tudo certo? Sim')];
  assert.equal(extractResumo(m), 'Ana Lima. Aula na terça.');
});

// ---------- ajustes após comparar com a planilha da equipe (12 e 13/10) ----------
test('Agendado: horário vindo da confirmação do bot conta (lead só disse "Terça")', () => {
  const msgs = [
    lead('Fb. Sou iniciante e quero saber mais sobre programação para adulto'),
    bot('Qual seu nome completo?'), lead('Leonardo Lima Morais da Silva'),
    bot('Qual seu e-mail?'), lead('leo@exemplo.com'),
    bot('Qual dia e horário? Opções: - Terça, 19h às 22h - Quinta, 19h às 22h - Sábado, 8h30 às 12h30'),
    lead('Terça'),
    bot('Perfeito! Vamos agendar sua aula experimental na terça-feira, das 19h às 22h. Revisando: Leonardo Lima Morais da Silva, e-mail: leo@exemplo.com. Aula experimental na terça, das 19h às 22h. Está tudo certo?'),
    lead('Sim'),
  ];
  const s = classifyStatus(msgs, cfg);
  assert.equal(s.status, 'Agendado');
  assert.ok(s.ag.horario);
});

test('Agendado: lista de opções do bot sozinha NÃO conta como dia e horário escolhidos', () => {
  const msgs = [lead('Pr. x'), bot('Qual seu e-mail?'), lead('a@b.co'), bot('Escolha. Opções: - Terça, 19h às 22h - Sábado, 8h30'), lead('depois eu vejo')];
  assert.notEqual(classifyStatus(msgs, cfg).status, 'Agendado');
});

test('Form-: lead de formulário que não escreveu mais nada vira Agendado (configurável, com aviso)', () => {
  const r = buildRow({ ...L, nome: 'Daniel' }, [lead('Form- Confirmei uma aula gratuita,, obrigado'), bot('Perfeito! A equipe entrará em contato para confirmar.')], { ...cfg, origens: { ...cfg.origens, prefixos: { ...cfg.origens.prefixos, Form: 'Adulto' } } });
  assert.equal(r.status, 'Agendado');
  assert.match(r.conferir, /Lead de formulário/);
  const ci = buildRow({ ...L, nome: 'Daniel' }, [lead('Form- Confirmei uma aula gratuita'), bot('ok')], { ...cfg, origens: { ...cfg.origens, formularioStatus: 'Conversa Iniciada' } });
  assert.equal(ci.status, 'Conversa Iniciada');
  const off = buildRow({ ...L, nome: 'Daniel' }, [lead('Form- Confirmei uma aula gratuita'), bot('ok')], { ...cfg, origens: { ...cfg.origens, formularioComoInteracao: false } });
  assert.equal(off.status, 'Não interagiu');
});

test('Frase fora de campanha ganha o prefixo que a equipe usa', () => {
  assert.equal(buildRow(L, [lead('Boa noite'), bot('Olá')], cfg).frase, 'Saudação - Boa noite');
  assert.equal(buildRow(L, [lead('Quantas horas de curso?'), bot('x')], cfg).frase, 'Dúvida - Quantas horas de curso?');
  assert.equal(buildRow(L, [lead('Pr. Quero programação para adulto'), bot('x')], cfg).frase, 'Pr. Quero programação para adulto');
});

test('gênero: letras estilizadas, número no apelido e grafias variantes', () => {
  assert.equal(guessGender('𝑹𝒆𝒗𝒊𝒂𝒏𝒆 𝑳𝒊𝒎𝒂').genero, 'F');
  assert.equal(guessGender('Kauã1').confianca, 'ambíguo');
  assert.equal(guessGender('Priscyla Moraes').genero, 'F');
  assert.equal(guessGender('Renatha').genero, 'F');
  assert.equal(guessGender('Sidinei Bezerra').genero, 'M');
  assert.equal(guessGender('Suzana').genero, 'F');
  assert.equal(guessGender('Herverto Diogo').genero, 'M');
});

test('Agendado pelo bot vem com aviso para a equipe confirmar', () => {
  const msgs = [lead('Fb. Quero saber para adulto'), bot('Qual seu nome?'), lead('Ana Lima Souza'), bot('E-mail?'), lead('a@b.co'), bot('Revisando: Ana Lima Souza, e-mail: a@b.co. Aula experimental na terça, das 19h às 22h. Está tudo certo?'), lead('Sim')];
  const r = buildRow({ ...L, nome: 'Ana' }, msgs, cfg);
  assert.equal(r.status, 'Agendado');
  assert.equal(r.conferir, ''); // sem aviso por padrão: a regra é da equipe
  const aviso = buildRow({ ...L, nome: 'Ana' }, msgs, { ...cfg, avisoAgendadoPeloBot: true });
  assert.match(aviso.conferir, /Agendado pelo bot/);
});

test('prefixos RC: RC05/08/09 são Kids, RC07/RC12 são Adulto (como na planilha da equipe)', () => {
  const c = { origens: { prefixos: { RC05: 'Kids', RC08: 'Kids', RC09: 'Kids', RC07: 'Adulto', RC12: 'Adulto', K2: 'Kids', RM2: 'Adulto' } } };
  assert.equal(classifyOrigin('RC05- Quero informação sobre Programação Kids', c).planilha, 'Kids');
  assert.equal(classifyOrigin('RC12 - Desejo conhecer mais sobre o curso de programação', c).planilha, 'Adulto');
  assert.equal(classifyOrigin('RC07- Tenho interesse no curso de Programação', c).planilha, 'Adulto');
  assert.equal(classifyOrigin('K2- Gostaria de saber mais', c).planilha, 'Kids');
});

test('Form sem pista: planilha assumida vem com aviso', () => {
  const c = { ...cfg, origens: { ...cfg.origens, genericos: ['Form'], padraoGenerico: 'Adulto' } };
  const r = buildRow({ ...L, nome: 'Ana' }, [lead('Form- Confirmei uma aula gratuita'), bot('ok')], c);
  assert.equal(r.planilha, 'Adulto');
  assert.match(r.conferir, /lead de formulário sem pista/);
});

test('nome sugerido: rejeita respostas soltas e perguntas, aceita nome completo', () => {
  const ask = bot('Para agendar, qual seu nome completo?');
  assert.equal(extractNomeReal([ask, lead('Que horas tem')], 'Apelido'), '');
  assert.equal(extractNomeReal([ask, lead('Quanto custa?')], 'Apelido'), '');
  assert.equal(extractNomeReal([ask, lead('Sim')], 'Apelido'), '');
  assert.equal(extractNomeReal([ask, lead('Maria Aparecida Souza')], 'Apelido'), 'Maria Aparecida Souza');
});

test('Agendado = lead passou nome, e-mail e turno/turma (horário exato não é exigido)', () => {
  const msgs = [lead('Pr. Quero saber'), bot('Qual seu nome completo?'), lead('Maria Souza'), bot('E-mail?'), lead('m@x.co'), bot('Qual turno? manhã, tarde ou noite?'), lead('Noite')];
  const s = classifyStatus(msgs, cfg);
  assert.equal(s.status, 'Agendado');
  assert.equal(s.ag.horario, null);
  // sem turno/turma não fecha
  const sem = classifyStatus([lead('Pr. x'), bot('Nome completo?'), lead('Maria Souza'), bot('E-mail?'), lead('m@x.co')], cfg);
  assert.equal(sem.status, 'Conversa Iniciada');
  assert.match(sem.motivo, /falta turno\/turma/);
  // sem nome não fecha
  const semNome = classifyStatus([lead('Pr. x'), bot('E-mail?'), lead('m@x.co'), bot('Qual turno?'), lead('Noite')], cfg);
  assert.equal(semNome.status, 'Conversa Iniciada');
  assert.match(semNome.motivo, /falta nome/);
});

test('Agendado: nome pode vir só na recapitulação do bot (responsável)', () => {
  const msgs = [lead('K2- quero saber'), bot('Seu e-mail?'), lead('r@x.co'), bot('Revisando: - Nome do aluno: Davi - Responsável: Rita Lima - E-mail: r@x.co - Aula experimental: sábado. Está tudo certo?'), lead('Sim')];
  assert.equal(classifyStatus(msgs, cfg).status, 'Agendado');
});

import { combinaComAtendente, dicaDeContatoInterno } from '../src/rules.js';
test('contato interno: nome igual a atendente de nome composto; nome simples não descarta', () => {
  const at = [{ nome: 'Diógenes Leão' }, { nome: 'Secretaria Fuctura' }, { nome: 'Joana' }, { nome: 'Caio' }];
  assert.ok(combinaComAtendente('Diógenes s Leao', at));
  assert.ok(combinaComAtendente('Secretaria FUCTURA', at));
  assert.equal(combinaComAtendente('Joana', at), null); // lead chamada Joana não é descartada
  assert.equal(combinaComAtendente('Caio Silva', at), null);
  assert.equal(combinaComAtendente('Diógenes Souza', at), null);
});
test('dica de contato interno só avisa', () => {
  assert.equal(dicaDeContatoInterno('THYAGO FUCTURA'), true);
  assert.equal(dicaDeContatoInterno('Pedro teste'), true);
  assert.equal(dicaDeContatoInterno('Maria Souza'), false);
  const r = buildRow({ ...L, nome: 'Fuctura Kids' }, [lead('Pr. x'), bot('?')], cfg);
  assert.match(r.conferir, /parece de contato interno/);
});

test('homônimo de atendente: não descarta, avisa para conferir e orienta usar o telefone', () => {
  const r = buildRow({ ...L, nome: 'Maria Souza', homonimoDe: 'atendente "Maria Souza" da Liv' }, [lead('Pr. Quero programação para adulto'), bot('Oi'), lead('ok')], cfg);
  assert.equal(r.revisar, true);
  assert.match(r.conferir, /Nome igual ao de atendente "Maria Souza" da Liv; pode ser homônimo/);
  assert.match(r.conferir, /ignorar\.telefones/);
});
