// Prueba de humo de la app (PWA) con Playwright: iPhone 13 y escritorio 1440 px, tema claro y oscuro.
// Requiere el Worker local (wrangler dev en :8787), los mocks (:8790) y la app servida en :8000 (FRONTEND_ORIGIN).
// Sin peticiones externas: todo lo que no sea localhost se bloquea (el mapa muestra su aviso sin conexión).
// Uso: node worker/test/app-smoke.cjs [carpeta-capturas]
const { chromium, devices } = require('playwright');
const OUT = process.argv[2] || null;
const B = 'http://localhost:8787';
const ROUTES = ['inicio', 'locales', 'visitas', 'incidencias', 'aprobaciones', 'agenda', 'tareas', 'factorial', 'configuracion'];
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++; };

(async () => {
  const browser = await chromium.launch();
  const runs = [
    ['iphone-claro', { ...devices['iPhone 13'], colorScheme: 'light' }],
    ['iphone-oscuro', { ...devices['iPhone 13'], colorScheme: 'dark' }],
    ['escritorio', { viewport: { width: 1440, height: 900 }, colorScheme: 'light' }],
  ];
  for (const [name, opts] of runs) {
    const ctx = await browser.newContext({ ...opts, deviceScaleFactor: 1 });
    await ctx.route((url) => !/^(localhost|127\.0\.0\.1)$/.test(url.hostname), (r) => r.abort());
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::/.test(m.text())) errors.push(m.text()); });
    page.on('dialog', (d) => d.dismiss());
    await page.goto(`${B}/`);
    await page.evaluate(() => localStorage.setItem('restalia.settings', JSON.stringify({ backendUrl: 'http://localhost:8787/api' })));
    await page.reload(); await page.waitForTimeout(600);
    ok((await page.textContent('.sync-chip').catch(() => '')).includes('Sin sesión'), `${name}: sin sesión → aviso «Sin sesión»`);
    const st = await page.evaluate(async () => (await fetch('/api/auth/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'local-test-access-key-123456789' }), credentials: 'include' })).status);
    ok(st === 200, `${name}: acceso con llave`);
    await page.reload(); await page.waitForTimeout(800);
    await page.evaluate(async () => { const s = await import('/js/core/sync.js'); await s.syncNow(); });
    const n = await page.evaluate(async () => { const s = await import('/js/core/store.js'); return s.all('locales').filter((l) => l.source?.system === 'notion').length; });
    ok(n > 0, `${name}: locales de Notion sincronizados (${n})`);
    for (const r of ROUTES) {
      await page.goto(`${B}/#/${r}`); await page.waitForTimeout(350);
      const h = await page.locator('#view').innerText().catch(() => '');
      ok(h.trim().length > 20, `${name}: #/${r} se pinta`);
      if (OUT) await page.screenshot({ path: `${OUT}/${name}-${r}.png` });
    }
    // Ficha de un local, mapa a pantalla completa y alta de visita → propuesta para Notion con el local como relación
    await page.goto(`${B}/#/locales`); await page.waitForTimeout(300);
    await page.click('button:has-text("Mapa")'); await page.waitForTimeout(400);
    await page.click('[data-mapfull]'); await page.waitForTimeout(200);
    const full = await page.evaluate(() => { const r = document.querySelector('#l-mapcard')?.getBoundingClientRect(); return r && r.width === innerWidth && r.height === innerHeight; });
    ok(full, `${name}: mapa a pantalla completa`);
    await page.click('[data-mapfull]');
    const loc = await page.evaluate(async () => { const s = await import('/js/core/store.js'); return s.all('locales').find((l) => l.source?.system === 'notion').id; });
    await page.goto(`${B}/#/visitas/nueva/${loc}`); await page.waitForTimeout(500);
    await page.fill('.sheet [name=observaciones]', 'Prueba de humo'); await page.click('.sheet [data-save]'); await page.waitForTimeout(400);
    const op = await page.evaluate(async () => { const s = await import('/js/core/store.js'); return s.all('aprobaciones').find((a) => a.op?.type === 'notion.create' && a.op.collection === 'visitas')?.op; });
    ok(op && op.fields.localRel === loc, `${name}: visita guardada → propuesta notion.create con relación al local`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(overflow <= 1, `${name}: sin scroll horizontal (${overflow}px)`);
    ok(!errors.length, `${name}: sin errores de consola${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `\n${fails} fallos` : '\nTodo correcto');
  process.exit(fails ? 1 : 0);
})();
