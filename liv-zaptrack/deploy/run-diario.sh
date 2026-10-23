#!/usr/bin/env bash
# Roda o robô uma vez, guarda o CSV em out/ e o log em logs/. Pensado para cron ou systemd timer.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p out logs planilha

HOJE=$(TZ=America/Recife date +%F)
ARGS=(--por-aba --saida "out/rascunho-${HOJE}.csv")

# Se houver CSVs exportados das abas em ./planilha, o robô pula quem já foi lançado.
for f in planilha/*.csv; do
  [ -e "$f" ] && ARGS+=(--planilha-csv "/app/$f")
done

echo "[$(date -Is)] iniciando: ${ARGS[*]}" >> "logs/zaptrack-${HOJE}.log"
if docker compose run --rm zaptrack "${ARGS[@]}" >> "logs/zaptrack-${HOJE}.log" 2>&1; then
  echo "[$(date -Is)] ok" >> "logs/zaptrack-${HOJE}.log"
else
  echo "[$(date -Is)] FALHOU (veja as linhas acima)" >> "logs/zaptrack-${HOJE}.log"
  exit 1
fi

# Limpeza: o CSV tem nomes e telefones de leads.
find out -name 'rascunho-*.csv' -mtime +7 -delete
find logs -name '*.log' -mtime +30 -delete
