# liv-zaptrack

Automatiza a parte repetitiva do passo a passo "Análise Liv → Zap Track": lê os leads novos na Liv
**somente em modo leitura**, abre a conversa de cada um e gera um **rascunho** com as colunas da planilha
(Data, Qualificação, Status, Nome, Fone, Frase, E-mail, Resumo), marcando o que precisa de olho humano.

> Nada é lançado nas abas Adulto/Kids. O resultado é um CSV (ou, se habilitado, uma aba de rascunho).

## Como funciona

1. Lê o que já está na planilha (CSV exportado, ou Google Sheets) e acha de onde continuar.
2. Entra na Liv, lista os atendimentos **dia a dia** (a Liv corta em 100 linhas) — equivalente a "Últimos Protocolos".
3. Mapeia protocolo → id interno pela grade de Históricos e lê a conversa — equivalente a "Históricos → Acessar Histórico".
4. Aplica as regras do passo a passo (frase, origem, Adulto/Kids, status, gênero, qualificação).
5. Grava `out/rascunho-<de>_<ate>.csv`. Duas colunas dizem o que olhar em cada linha:
   - **Conferir:** o que a pessoa precisa checar, em texto claro (ex.: "Agendamento incompleto: falta horário",
     "Gênero não identificado pelo nome; qualificação não preenchida", "Planilha Kids inferida: …"). Vazio = nada a conferir.
   - **Erros do Bot:** desvios do bot na conversa (texto-modelo vazado, mensagem repetida, pergunta do lead sem resposta,
     valor ignorado, e-mail pedido de novo, mais as regras da equipe em `botRegras` do `config.json`).
   Também preenche **Resumo** e **Filho** a partir da recapitulação do próprio bot e sugere o **Nome** real dado na conversa.

### Garantias de somente leitura
- Depois do login, o navegador **bloqueia toda requisição que não seja GET**, exceto a paginação das grades de
  Históricos (consultas da própria grade). Não há cliques em botões de ação, formulários nem avaliações (estrelas).
- Não abre o chat ao vivo, então não marca conversa como lida nem assume atendimento.
- Se a Liv avisar "usuário já conectado em outra sessão", o script **para** (não derruba ninguém), a menos que
  `LIV_ALLOW_SESSION_TAKEOVER=1`.
- Contatos internos: só o telefone descarta (`ignorar.telefones`). Nome igual ao de um atendente da Liv gera só um aviso em Conferir, porque pode ser homônimo.
- Ao terminar, sai da Liv para liberar a sessão. Usuários de atendente (não administradores) caem direto na tela de chat após o login; o script sai dela sem interagir e usa `liv.idCliente`/`liv.idInstancias` do `config.json`.

## Uso

```bash
npm install
npx playwright install chromium      # ou defina CHROMIUM_PATH
cp config.example.json config.json   # e ajuste (veja "O que falta preencher")

export LIV_LOGIN=...  LIV_SENHA=...
node src/cli.js --de 2026-10-09 --ate 2026-10-13 \
  --planilha-csv adulto.csv --planilha-csv kids.csv
```

`--por-aba` grava também CSVs no layout das abas Adulto (A–H) e Kids (A–N, com a coluna Filho). Sem `--de`, começa na última data encontrada na planilha (ou ontem) e vai até hoje. `node src/cli.js --ajuda` lista as opções.
Testes: `npm test` (sem rede; usa conversas sintéticas).

## Regras implementadas (do passo a passo)
- **Frase** = primeira mensagem do lead (a Liv grava duplicada; o script remove a duplicata).
- **Origem**: prefixo (`Pr.`, `Fb.`, `Rm3 -`…) = campanha; saudações → "Saudação"; o resto → "Dúvida".
- **Status**: `Não interagiu` (lead só enviou a origem), `Agendado` (e-mail + dia + horário), `Não quero` (padrões de
  texto, **sempre para revisão**), senão `Conversa Iniciada`.
- **Qualificação**: as quatro regras Adulto/Kids × homem/mulher. Sem gênero ou sem planilha definida, **não chuta**:
  deixa em branco e marca `Revisar`.
- **Duplicados**: compara DDD + 8 últimos dígitos do telefone + dia (ignora `55` e o nono dígito).

## O que falta preencher / ainda não testado
| Item | Situação |
|---|---|
| Mapa prefixo → Adulto/Kids (`origens.prefixos`) | Preenchido com o que a planilha mostra: `RM3` = Adulto, `RC*` = Kids; genéricos (Fb., Sb., Pr.…) caem em Adulto salvo pista de Kids. Prefixos novos (ex.: `K2-`, `RM2`) entram pelas palavras-chave ou devem ser acrescentados. |
| Status "Nº interação" | A planilha mistura "Conversa Iniciada" e "1o/2o/3o interação". Padrão: Conversa Iniciada; `status.interacao = "contagem"` troca para a contagem de respostas do lead (regra exata a confirmar). |
| Usuário exclusivo do robô na Liv (só leitura) | **Criar**. A Liv permite uma sessão por usuário. |
| Planilha Zap Track | **Compartilhar**. Hoje funciona por CSV exportado; Google Sheets está implementado mas **não testado**. |
| Gênero | Dicionário inicial em `src/data/nomes.json` (ampliar). Nomes desconhecidos ficam para revisão ou para a IA. |
| IA (`--ia`) | Implementada, **não testada contra a API real** (sem chave). Desligada por padrão; não envia telefone. |
| Agendamento (`.github/workflows/zaptrack.yml`) | Só manual. Habilitar `schedule` depois de validar. |

## Segurança e privacidade
- Credenciais só por variável de ambiente (`LIV_LOGIN`, `LIV_SENHA`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `ANTHROPIC_API_KEY`).
- `config.json` e `out/` estão no `.gitignore`: o CSV contém nomes e telefones de leads. Não versionar.
- Com `--ia`, nome e texto da conversa vão para o provedor de IA (telefone não, por padrão). Confirme se isso é aceitável (LGPD).
- A leitura usa as mesmas URLs que a interface da Liv usa (`blank_ultimos_atendimentos`, `grid_chatbot_historico`).
  Se a Liv mudar as telas, o script pode quebrar; uma API/webhook oficial seria mais estável.

## Rodar na sua VPS (Docker)

Pré-requisitos: Docker com o plugin Compose, acesso de saída à internet e um usuário da Liv só para o robô.

```bash
# 1) Copie a pasta liv-zaptrack para a VPS (ex.: /opt/liv-zaptrack) e entre nela
cd /opt/liv-zaptrack

# 2) Credenciais e configuração (nenhum dos dois vai para o git)
cp .env.example .env && chmod 600 .env        # preencha LIV_LOGIN e LIV_SENHA
cp config.example.json config.json            # preencha ignorar.telefones, prefixos etc.

# 3) Construa a imagem e teste uma vez
docker compose build
docker compose run --rm zaptrack --por-aba --de 2026-10-22 --ate 2026-10-23
ls out/                                        # o CSV de rascunho aparece aqui
```

Para pular quem já foi lançado, exporte as abas Adulto e Kids da planilha como CSV e coloque em `./planilha/`.
O script `deploy/run-diario.sh` usa esses arquivos automaticamente.

### Agendar (escolha um)

**systemd timer** (recomendado: roda mesmo se a VPS estiver desligada no horário):
```bash
sudo cp deploy/zaptrack.service deploy/zaptrack.timer /etc/systemd/system/   # ajuste WorkingDirectory/ExecStart
sudo systemctl daemon-reload && sudo systemctl enable --now zaptrack.timer
systemctl list-timers zaptrack.timer           # confere o próximo disparo
journalctl -u zaptrack.service -n 50           # saída da última execução
```

**cron** (07:00 de Recife/Brasília = 10:00 UTC):
```
0 10 * * *  /opt/liv-zaptrack/deploy/run-diario.sh
```

O CSV diário fica em `out/rascunho-AAAA-MM-DD.csv` (apagado após 7 dias) e o log em `logs/` (30 dias).

### Cuidados
- O `.env` e o `config.json` têm credenciais e telefones: permissão 600 e só o usuário do robô lê.
- O CSV tem nomes e telefones de leads: a VPS deve ser privada, sem pasta compartilhada.
- A Liv permite uma sessão por usuário. Com `LIV_ALLOW_SESSION_TAKEOVER=0` (padrão), se o usuário estiver logado o robô falha sem derrubar ninguém; o erro aparece no log.
- A imagem não foi construída no ambiente de desenvolvimento (sem daemon Docker lá): faça o primeiro `docker compose build` e a execução de teste antes de agendar.

### Sem Docker (usando o Node e o Chromium da própria VPS)

```bash
cd /opt/liv-zaptrack
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --omit=dev
cp .env.example .env && chmod 600 .env && nano .env     # LIV_LOGIN, LIV_SENHA
cp config.example.json config.json && chmod 600 config.json
chmod +x deploy/run-diario-nativo.sh
./deploy/run-diario-nativo.sh                            # teste manual; CSV em out/
```
Requer Node 20+ e um Chromium ou Chrome que não seja snap (o script avisa se for). Para agendar, use o mesmo
`deploy/zaptrack.service`/`.timer`, trocando o `ExecStart` por `run-diario-nativo.sh`, ou o cron com esse script.
