# Handover: liv-zaptrack (para a próxima sessão do Claude)

Leia este arquivo inteiro antes de agir. Ele resume uma sessão longa em que o robô foi construído, testado e instalado
na VPS. Não contém senhas nem dados de leads; trate qualquer dado que você ler da Liv ou dos CSVs como pessoal (LGPD).

## 1. Contexto e objetivo

A Fuctura (escola de tecnologia, Recife) recebe leads por WhatsApp. O atendimento passa por um chatbot de IA dentro da
**Liv** (`https://chat.livtecnologia.com`, plataforma white label feita em ScriptCase, versão 17.0.0). Um funcionário
gastava de 1 a 2 horas por dia copiando leads da Liv para a planilha **ZapTrack** (abas **Adulto** e **Kids**).

O robô `liv-zaptrack` lê a Liv em modo **somente leitura**, abre a conversa de cada lead e gera um **rascunho** com as
colunas da planilha (Data, Qualificação, Status, Nome, Fone, Frase, E-mail, Resumo) mais colunas de conferência.
Uma pessoa confere e lança. O robô **nunca escreve nas abas originais**.

Quem pede: Caio (dono da conta; fala português; prefere respostas objetivas e honestas; quer que nada seja alterado na
Liv sem confirmação).

## 2. Onde está o código

- Repositório: `caiomvital/agents`, branch **`claude/liv-login-access-uab2v1`** (a `main` só tem um README; **não há PR aberto**).
- Pasta: `liv-zaptrack/` (Node 20+, ESM, só depende de `playwright`). `README.md` tem o uso completo.
- Arquivos principais:
  - `src/cli.js`: orquestra (período, dedupe, leitura, saída). `node src/cli.js --ajuda` lista as opções.
  - `src/liv.js`: acesso à Liv (login, lista por dia, mapa protocolo→id, leitura da conversa, atendentes).
  - `src/rules.js`: **todas as regras** (frase, origem, Adulto/Kids, status, gênero, qualificação, erros do bot).
  - `src/sheet.js`: leitura da planilha (CSV pronto; Google Sheets API pronta mas **não testada**).
  - `src/ai.js`: etapa opcional de IA (Anthropic API), **desligada e não testada contra a API real**.
  - `src/output.js`, `src/dates.js`, `src/data/nomes.json` (dicionário de nomes M/F/ambíguos).
  - `test/rules.test.js`: 43 testes sem rede (`npm test`). Mantenha-os passando.
  - `Dockerfile`, `docker-compose.yml`, `deploy/` (scripts diários, units systemd, permissões), `.github/workflows/zaptrack.yml` (manual).
- `config.example.json` é o modelo; `config.json` e `.env` ficam **fora do git** (têm telefones e senha).

## 3. Como o robô acessa a Liv (e por quê)

- Login por navegador headless (Playwright). O usuário é um **atendente não administrador** do Caio: depois do login ele cai
  direto na tela de chat; o robô sai dela sem interagir e usa `liv.idCliente = 83` e `liv.idInstancias = 16,114,17,119`
  do `config.json` (administradores descobririam isso sozinhos).
- **A Liv permite uma sessão por usuário.** Se o usuário já estiver logado, o robô **para** (padrão
  `LIV_ALLOW_SESSION_TAKEOVER=0`) em vez de derrubar a sessão. Só assuma a sessão se o Caio autorizar na hora.
- **Garantia de leitura**: depois do login o navegador bloqueia todo POST, exceto a paginação de duas grades
  (`grid_chatbot_triagem_AF`, `grid_chatbot_historico`). Mantenha isso. As linhas "bloqueado POST" no log são esperadas
  (pedidos automáticos da tela de chat).
- Telas usadas (todas por GET): `blank_ultimos_atendimentos/index.php?filtro=...` (lista de **um dia**; a Liv corta em 100
  linhas), `grid_chatbot_triagem_AF/` (mapa protocolo → id interno, paginando), `grid_chatbot_historico/index.php?var_triagem=ID`
  (mensagens: spans `id_sc_field_resposta_N` = lead, `id_sc_field_pergunta_N` = bot), `app_grid_sec_atendentes/`.
- A paginação precisa usar o seletor exato `a.scGridToolbarNav[href*="nm_gp_submit_rec"]`: um seletor só por texto
  ("5") já coincidiu com um filtro lateral.
- **Não altere nada na Liv** (fluxos, canais, avaliações em estrelas, editor de fluxo, botões Salvar/Excluir). Não abra o chat
  ao vivo. Se algo parecer estrutural, só olhe.

## 4. Regras de negócio confirmadas pela equipe

- **Agendado** = o lead passou **nome, e-mail e turno/turma** (horário exato não é exigido). O horário/dia pode vir da
  confirmação do bot ("Revisando: …", "agendada para…"), nunca da lista de opções oferecidas.
- **Qualificação** (planilha × gênero): Adulto: homem Qualificado, exceto se só clicou no anúncio (Não interagiu) →
  Desqualificado; mulher Desqualificada, exceto agendamento completo → Qualificada. Kids: homem Desqualificado, exceto
  agendamento completo → Qualificado; mulher Qualificada, exceto se só clicou → Desqualificada. Sem gênero ou sem
  planilha definida, o robô **não chuta**: deixa em branco e explica em Conferir. Grafia: **"Desqualificado"** (com "i").
- **Status**: Não interagiu, Conversa Iniciada, Agendado, Não quero (só por padrões de texto, sempre para conferência).
  "1o interação" que a equipe usa **deve ser ignorado por enquanto**.
- **Frase** = primeira mensagem do lead (a Liv a grava duplicada); sem campanha vira "Saudação - …" ou "Dúvida - …".
- **Prefixos**: RM2/RM3/RM4/Rml/RC07/RC12 = Adulto; RC05/RC08/RC09/K1/K2 = Kids; Fb., Sb., Pr., SF, Bb., Ff., Form, Ia., Wz.
  são genéricos (palavras-chave; sem pista de Kids, Adulto). Leads "Form-" sem mais nada viram **Agendado** (a equipe fez
  assim em 6 de 8 casos).
- **Contatos internos**: só o **telefone** descarta (`ignorar.telefones` no `config.json`). Nome igual ao de atendente da Liv
  ou contendo "fuctura"/"teste" **só gera aviso** (pode ser homônimo). Nunca descarte só por nome.
- Dedupe com a planilha: telefone (DDD + 8 últimos dígitos, ignora 55 e o nono dígito) + dia. A Liv entrega celulares sem o 9;
  a planilha usa 11 dígitos (o robô acrescenta o 9).

## 5. Estado atual e resultados

- **Comparação com a planilha da equipe (10 a 15/10/2026, 61 linhas comparáveis)**: qualificação igual em 49 (80%);
  status + qualificação iguais em 38 (62%). Divergências restantes (detalhe):
  - ~10 casos em que o robô diz Agendado e a equipe lançou Conversa Iniciada/1o interação, mesmo com nome, e-mail e turno.
    Pela regra confirmada, o robô está certo; a equipe provavelmente lança parte depois do contato humano.
  - Leads de formulário e do Secretaria que não aparecem como atendimento da Liv; segundas conversas do mesmo lead no mesmo
    dia (a equipe mantém uma linha por lead por dia, o robô lista cada protocolo).
  - Casos de gênero não identificado (nomes fora do dicionário, apelidos, "Sem nome").
- **Execução na VPS** (24/10/2026, `--de 2026-10-22 --ate 2026-10-23`): 54 atendimentos, 4 ignorados (telefone interno),
  **50 leads**, 44 Adulto / 6 Kids, **42 de 50 com algo em "Conferir"/"Erros do Bot"** (muito mais que nos testes
  anteriores, ~40%). **Ainda não foi analisado o porquê.** Esta é a primeira tarefa sugerida (seção 8).
- Planilha de teste do robô (Google Sheets, aba "Rascunho"): id `1_90oS_MUEJGRExEnl0WsvF1-Iv4AWbLyS-tir16a_2M`.
  Planilha original da equipe (só leitura!): id `1PnZtUVbwFWOmonSysb0YDfHgpfWsA1r-VkGgUy8-Xh8` (abas "Adulto", " Kids"
  com espaço no início, "Dados", etc.). Precisam do conector do Google Sheets/Drive; sem ele, use CSVs exportados.

## 6. A VPS

- Caminho: `/opt/liv-zaptrack`. Imagem Docker `liv-zaptrack:latest` já construída; contêiner roda como **uid 1001**
  (`deploy/preparar-permissoes.sh` entrega `config.json`, `out/`, `planilha/` a esse uid).
- Rodar: `docker compose run --rm zaptrack --por-aba --de AAAA-MM-DD --ate AAAA-MM-DD` → CSVs em `out/`.
- Há também `deploy/run-diario.sh` (Docker) e `deploy/run-diario-nativo.sh` (sem Docker; o único Chromium não-snap da VPS é
  `/usr/bin/google-chrome`; **não testado**). Agendamento diário (systemd timer/cron) **ainda não foi ativado**.
- A VPS **já roda outros serviços do Caio** (n8n, Evolution API, auditoria-fuctura, curso-ia-pagina-inicial, novo-hiper e
  muitas imagens de rollback). **Não pare, remova nem altere nada que não seja deste projeto.** Não rode `docker system prune`.
- Segredos: `.env` (LIV_LOGIN, LIV_SENHA) e `config.json` com `chmod 600`. Nunca imprima, versione ou cole esses valores.

## 7. Pendências e ideias (nada disso foi feito)

1. **Entender os 42/50 em Conferir** e reduzir ruído (ver seção 8).
2. **Juntar no mesmo dia as conversas do mesmo telefone em uma linha** (status mais avançado) — resolve a maior parte das
   linhas "só no rascunho".
3. Colocar o nome real sugerido na coluna Nome (hoje fica em "Nome sugerido"); incluir leads de formulário (origem a descobrir).
4. Escrever o rascunho sozinho na planilha: precisa de **conta de serviço do Google** (`GOOGLE_SERVICE_ACCOUNT_JSON`,
   `planilha.sheetId`, `--planilha-google`, `--escrever-rascunho`); código pronto, **não testado**.
5. Passar CSVs das abas Adulto e Kids em `planilha/` para o dedupe funcionar no agendamento diário.
6. **Usuário exclusivo do robô na Liv** (hoje usa o login do Caio; conflita se ele estiver logado).
7. Etapa de IA (`--ia`): gênero de nomes desconhecidos, "Não quero", resumo. Precisa de `ANTHROPIC_API_KEY`; enviar o telefone
   está desligado por padrão (LGPD).
8. Mesclar a branch na `main` (PR) para o workflow do GitHub Actions aparecer; segredos `LIV_LOGIN`, `LIV_SENHA`,
   `ZAPTRACK_CONFIG_JSON`.
9. Ferramenta de comparação robô × planilha da equipe: existiu só como script de apoio (telefone+dia, status/qualificação,
   tratando "1o interação" como Conversa Iniciada). Vale colocar em `tools/`.
10. A Liv: o nó de IA ("IA OpenAI GPT") usa um único "Prompt do Bot" de ~26,6 mil caracteres, **sem RAG/base de
    conhecimento** visível; integrações "HTTP Genérico/SGP/IXC" podem permitir RAG externo (**a confirmar com o suporte da Liv**).
    Perguntas prontas: o nó aceita base de conhecimento ou arquivos? A integração HTTP Genérico pode ser chamada pelo modelo
    como função? Existe API/webhook oficial de nova conversa e de histórico por período?
    Um fluxo "Novo Fluxo Humano" (id 1.567, canal 17) apareceu na Liv depois de 14/10; não foi criado pelo robô.

## 8. Primeira tarefa sugerida (análise, sem alterar nada)

Objetivo: descobrir por que 42 de 50 linhas de `out/rascunho-2026-10-22_2026-10-23.csv` têm algo em Conferir/Erros do Bot e
propor ajustes de regra.

1. Conte os motivos **sem expor telefones**, por exemplo:
   ```bash
   cd /opt/liv-zaptrack
   python3 - <<'EOF'
   import csv, collections, re
   r = list(csv.reader(open('out/rascunho-2026-10-22_2026-10-23.csv', encoding='utf8'))); h = r[0]
   rows = [dict(zip(h, x)) for x in r[1:]]
   c = collections.Counter()
   for x in rows:
       for l in (x['Conferir'] + '\n' + x['Erros do Bot']).split('\n'):
           l = re.sub(r'"[^"]*"', '"…"', l.strip('• ').strip())
           if l: c[l[:90]] += 1
   for k, n in c.most_common(): print(n, k)
   print('Status:', collections.Counter(x['Status'] for x in rows))
   EOF
   ```
2. Para os motivos mais frequentes, leia **algumas** conversas (a Liv, só leitura) e decida se o aviso é legítimo ou
   falso positivo. Candidatos óbvios: "Planilha … inferida" (lead sem prefixo de campanha), "Agendamento incompleto",
   "Gênero não identificado", "pergunta de valor sem resposta" (pode estar disparando demais) e os avisos de formulário.
3. Proponha mudanças em `src/rules.js` com testes novos em `test/rules.test.js`; rode `npm test`; recompile a imagem
   (`docker compose build`) só depois de aprovado pelo Caio.
4. Se for validar contra a planilha da equipe, use a original **só para leitura**.

## 9. Regras de trabalho com este usuário

- Responda em português, direto, sem rodeios; diga com honestidade o que foi testado e o que não foi.
- Peça confirmação antes de qualquer ação que desconecte alguém, altere a Liv, a planilha original, a VPS fora deste projeto
  ou envie dados a terceiros (inclusive a uma API de IA).
- Não faça commit de `config.json`, `.env`, CSVs de `out/` nem qualquer dado de lead. Não faça PR sem o Caio pedir.
- Commits na branch `claude/liv-login-access-uab2v1`; mensagens em português.
