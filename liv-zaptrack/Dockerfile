# Robô liv-zaptrack: Node + Chromium (Playwright). Roda uma vez e sai.
FROM node:22-bookworm-slim

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NODE_ENV=production \
    TZ=America/Recife

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
 && npx playwright install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/*

COPY src ./src
COPY config.example.json ./

# Usuário sem privilégios (o Chromium já roda com --no-sandbox dentro do contêiner)
RUN useradd -m app && mkdir -p /app/out /app/planilha && chown -R app:app /app
USER app

ENTRYPOINT ["node", "src/cli.js"]
CMD ["--ajuda"]
