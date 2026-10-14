// Acesso SOMENTE LEITURA à Liv via navegador headless.
// Garantias: após o login, qualquer requisição que não seja GET é bloqueada, exceto
// a paginação das grades de Históricos e de histórico de conversa (consultas das próprias grades). Nada é clicado além de
// links de paginação e, se autorizado, do "Ok" de sessão duplicada no login.

import { chromium } from 'playwright';
import { dedupeMessages } from './rules.js';

const POST_PERMITIDO_APOS_LOGIN = [/\/grid_chatbot_triagem_AF\/index\.php/, /\/grid_chatbot_historico\/index\.php/];

export async function connect({ baseUrl, login, password, allowTakeover = false, chromiumPath, log = () => {} }) {
  if (!login || !password) throw new Error('Defina LIV_LOGIN e LIV_SENHA no ambiente.');
  const browser = await chromium.launch({
    executablePath: chromiumPath || undefined,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  let logado = false;
  await page.route('**/*', (route) => {
    const r = route.request();
    const m = r.method();
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return route.continue();
    if (!logado) return route.continue(); // fase de login
    if (POST_PERMITIDO_APOS_LOGIN.some((re) => re.test(r.url()))) return route.continue();
    log(`bloqueado ${m} ${r.url().slice(0, 100)}`);
    return route.abort();
  });

  await page.goto(`${baseUrl}/login/`, { waitUntil: 'networkidle' });
  await page.fill('#id_sc_field_login', login);
  await page.fill('#id_sc_field_pswd', password);
  await page.click('#btnlogarr');
  await page.waitForTimeout(4000);

  const ok = page.locator('button:visible, a:visible, input[type=button]:visible').filter({ hasText: /^\s*Ok\s*$/ });
  if (await ok.count()) {
    if (!allowTakeover) {
      await browser.close();
      throw new Error(
        'A Liv avisou que esse usuário já está conectado em outra sessão. Nada foi feito. ' +
          'Use um usuário exclusivo do robô, ou defina LIV_ALLOW_SESSION_TAKEOVER=1 para desconectar a outra sessão.',
      );
    }
    await ok.first().click({ timeout: 5000 });
  }

  // Administradores caem no menu; atendentes caem direto na tela de chat. Nos dois casos já estamos logados.
  await page.waitForURL(/menu\/menu\.php|blank_chat_v2/, { timeout: 30000, waitUntil: 'commit' });
  const noChat = /blank_chat_v2/.test(page.url());
  if (!noChat) await page.waitForTimeout(5000);
  logado = true;
  if (noChat) log('Usuário de atendente: caiu na tela de chat; saindo dela sem interagir.');

  // Descobre cliente e canais pelo dashboard (mesmos parâmetros que a interface usa).
  let ids = null;
  for (const f of page.frames()) {
    const m = f.url().match(/id_cliente=(\d+)&id_instancia=([\d,]+)/);
    if (m) ids = { idCliente: m[1], idInstancias: m[2] };
  }

  async function close() {
    // Encerrar a sessão libera o login (e tira o atendente do "online"). Procura o link "Sair" em qualquer quadro.
    try {
      await page.goto(`${baseUrl}/menu/menu.php`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      for (const f of page.frames()) {
        const sair = f.locator('a[href*="login/index.php"]').first();
        if (await sair.count().catch(() => 0)) {
          await sair.evaluate((a) => a.click());
          await page.waitForTimeout(2000);
          log('Sessão encerrada.');
          break;
        }
      }
    } catch {
      /* cortesia: o navegador fecha de qualquer forma */
    }
    await browser.close();
  }

  return { browser, page, ids, close };
}

const SQL_DATE = (iso) => iso; // aaaa-mm-dd

/** Lista os atendimentos de UM dia (a Liv corta em 100 linhas; um dia fica bem abaixo disso). */
export async function listarProtocolosDoDia(page, { baseUrl, idCliente, idInstancias }, dia) {
  const d = SQL_DATE(dia);
  const filtro = `data BETWEEN '${d}' AND '${d}' AND id_cliente = ${Number(idCliente)} AND id_instancia IN(${String(idInstancias).replace(/[^\d,]/g, '')})`;
  const url =
    `${baseUrl}/blank_ultimos_atendimentos/index.php?filtro=${encodeURIComponent(filtro)}` +
    `&id_cliente=${Number(idCliente)}&id_instancia=${encodeURIComponent(idInstancias)}` +
    `&departamentos=&atendentes=&data_inicial=${d}&data_final=${d}`;
  await page.goto(url, { waitUntil: 'networkidle' });

  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.replace(/\s+/g, ' ').trim())),
  );
  const out = [];
  for (const c of rows) {
    if (c.length < 8) continue;
    const dt = c[1].match(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})/);
    if (!dt || !/^\d{10,}$/.test(c[0])) continue;
    out.push({ protocolo: c[0], data: dt[1], hora: dt[2], nome: c[2], whatsapp: c[3], status: c[4], departamento: c[5], atendente: c[6], canal: c[7] });
  }
  if (out.length >= 100) throw new Error(`Dia ${dia} retornou 100 linhas (limite da Liv); resultados podem estar incompletos.`);
  return out;
}

/**
 * Mapeia protocolo -> id interno (necessário para abrir o histórico) pagindo a grade de Históricos,
 * que é ordenada do mais novo para o mais antigo. Para quando todos os protocolos pedidos forem achados.
 */
export async function mapearProtocolos(page, baseUrl, protocolos, { maxPaginas = 60, log = () => {} } = {}) {
  const faltam = new Set(protocolos);
  const mapa = new Map();
  if (!faltam.size) return mapa;
  await page.goto(`${baseUrl}/grid_chatbot_triagem_AF/`, { waitUntil: 'networkidle' });

  for (let n = 1; n <= maxPaginas && faltam.size; n++) {
    const achados = await page.evaluate(() =>
      [...document.querySelectorAll('a[title="Acessar Histórico"]')].map((a) => ({
        id: a.dataset.id,
        protocolo: (a.closest('tr').querySelector('[id^="id_sc_field_protocolo_"]') || {}).innerText?.trim(),
      })),
    );
    for (const a of achados) {
      if (faltam.has(a.protocolo)) (mapa.set(a.protocolo, a.id), faltam.delete(a.protocolo));
    }
    log(`Históricos pág ${n}: ${achados.length} linhas, faltam ${faltam.size}`);
    if (!faltam.size) break;
    const prox = page.locator(`a:text-is("${n + 1}")`).first();
    if (!(await prox.count())) break;
    await prox.click();
    await page.waitForTimeout(3000);
  }
  return mapa;
}

/** Lê a conversa de um atendimento (id interno). Retorna mensagens sem duplicatas, em ordem. */
export async function lerConversa(page, baseUrl, idInterno) {
  await page.goto(`${baseUrl}/grid_chatbot_historico/index.php?var_triagem=${idInterno}`, { waitUntil: 'networkidle' });
  const todas = [];
  for (let pg = 1; pg <= 30; pg++) {
    const msgs = await page.evaluate(() => {
      const cel = (span, role) => {
        const t = span.innerText.replace(/ /g, ' ').trim();
        if (!t) return null;
        const lines = t.split('\n').map((l) => l.trim());
        const quando = lines.find((l) => /\d{2}\/\d{2}\/\d{4}\s+á?s?\s*\d{2}:\d{2}:\d{2}/.test(l)) || '';
        const autor = lines[0] || '';
        const i = lines.indexOf(quando);
        const texto = lines.slice(i + 1).join('\n').trim();
        return { role, autor, at: quando.replace(/\s+á?s?\s+/, ' '), text: texto };
      };
      const out = [];
      document.querySelectorAll('[id^="id_sc_field_resposta_"], [id^="id_sc_field_pergunta_"]').forEach((s) => {
        const m = cel(s, s.id.startsWith('id_sc_field_resposta_') ? 'lead' : 'bot');
        if (m) out.push({ n: Number(s.id.match(/_(\d+)$/)[1]), ...m });
      });
      return out.sort((a, b) => a.n - b.n);
    });
    todas.push(...msgs);
    // Paginação do histórico (conversas longas): só segue se existir link da próxima página.
    const prox = page.locator(`a:text-is("${pg + 1}")`).first();
    if (!(await prox.count())) break;
    // O histórico usa a mesma mecânica de grade; só consultas, nunca ações.
    await prox.click().catch(() => {});
    await page.waitForTimeout(2500);
    if (!msgs.length) break;
  }
  return dedupeMessages(todas.map(({ n, ...m }) => m));
}
