#!/usr/bin/env bash
# Uso único (como root): entrega ao usuário do contêiner os arquivos que ele precisa ler ou gravar.
# O contêiner roda sem privilégios; o config.json (chmod 600, dono root) e a pasta out/ precisam ser dele.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p out logs planilha
APPUID=$(docker compose run --rm -T --entrypoint id zaptrack -u)
echo "uid do usuário do contêiner: ${APPUID}"
[ -f config.json ] && chown "${APPUID}:${APPUID}" config.json && chmod 600 config.json
chown -R "${APPUID}:${APPUID}" out planilha
echo "pronto: config.json, out/ e planilha/ agora pertencem ao usuário do contêiner"
