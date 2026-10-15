# Worker de vagas

Coleta vagas (Java, Python, IA, júnior/pleno) em fontes abertas e em URLs que você cadastra, filtra, remove duplicatas e grava o resultado em `data/vagas_novas.json`.

**Regra fundamental: este projeto nunca envia candidatura.** O envio só acontece depois da sua aprovação explícita, vaga a vaga, e não faz parte desta etapa.

## Como funciona
- `worker/collect.py`: Remotive (API pública), feeds RSS e URLs manuais (`data/manual_urls.txt`). Não faz login nem contorna CAPTCHA ou bloqueios; sites que bloquearem a leitura são ignorados.
- `worker/pipeline.py`: filtro por cargo, senioridade e localização (`config.json`) e deduplicação entre fontes. Vagas sem salário publicado não são descartadas.
- `.github/workflows/vagas.yml`: roda duas vezes por dia e faz commit de `data/`.

## Uso
    python -m unittest discover -s tests
    python worker/main.py

Para analisar uma vaga específica, adicione a URL em `data/manual_urls.txt`.

## Próximas etapas (dependem das suas respostas)
1. Análise de compatibilidade com seu currículo e rascunhos de candidatura no Gmail, com registro em planilha.
2. Leitura dos alertas de vaga recebidos por e-mail.
