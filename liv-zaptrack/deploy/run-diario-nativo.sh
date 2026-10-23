#!/usr/bin/env bash
# Versão SEM Docker: usa o Node e o Chromium que já existem na máquina.
# Pré-requisitos: Node 20+, `npm ci --omit=dev` já executado (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1) e um Chromium/Chrome
# que NÃO seja snap. Credenciais em .env e regras em config.json (ambos com chmod 600).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p out logs planilha

# carrega LIV_LOGIN, LIV_SENHA etc.
if [ -f .env ]; then set -a; . ./.env; set +a; fi

# Chromium do sistema (ou o que você definir em CHROMIUM_PATH no .env)
export CHROMIUM_PATH="${CHROMIUM_PATH:-$(command -v chromium || command -v chromium-browser || command -v google-chrome || command -v google-chrome-stable || true)}"
if [ -z "${CHROMIUM_PATH}" ]; then
  echo "Chromium/Chrome não encontrado. Instale um ou defina CHROMIUM_PATH no .env." >&2
  exit 1
fi
case "${CHROMIUM_PATH}" in
  /snap/*) echo "Aviso: Chromium em /snap costuma falhar com Playwright. Prefira o pacote .deb ou o Docker." >&2 ;;
esac

HOJE=$(TZ=America/Recife date +%F)
ARGS=(--por-aba --saida "out/rascunho-${HOJE}.csv")
for f in planilha/*.csv; do
  [ -e "$f" ] && ARGS+=(--planilha-csv "$f")
done

LOG="logs/zaptrack-${HOJE}.log"
echo "[$(date -Is)] iniciando (nativo, ${CHROMIUM_PATH}): ${ARGS[*]}" >> "$LOG"
if node src/cli.js "${ARGS[@]}" >> "$LOG" 2>&1; then
  echo "[$(date -Is)] ok" >> "$LOG"
else
  echo "[$(date -Is)] FALHOU (veja as linhas acima)" >> "$LOG"
  exit 1
fi

# Limpeza: o CSV tem nomes e telefones de leads.
find out -name 'rascunho-*.csv' -mtime +7 -delete
find logs -name '*.log' -mtime +30 -delete
