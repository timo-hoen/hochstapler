// Online-Test Speicher-Items: Im Koop setzt das Item den Speicherpunkt erst, wenn alle
// zugestimmt haben; danach kommen alle dort wieder hoch. 2 pro Akt, Stand bleibt im Raum.
// Start: npm run build && npx wrangler dev --port 8799, dann node scripts/e2e-speicher-items.cjs
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8799';
const ROOM = 'S' + Math.random().toString(36).slice(2, 7).toUpperCase();
let fails = 0;
const ok = (c, msg) => { console.log(c ? '✓' : '✗', msg); if (!c) fails++; };
(async () => {
  const br = await chromium.launch({ args: ['--no-proxy-server', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const open = async (n, solo = false) => {
    const ctx = await br.newContext({ viewport: { width: 200, height: 120 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('hochstapler.settings', JSON.stringify({ quality: 'low', splitscreen: false })); } catch {} });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => console.log('ERR', n, e.message));
    await pg.goto(`${BASE}/?room=${solo ? 'SOLO' + ROOM : ROOM}&name=${n}&debug=timo${solo ? '' : '&autostart=1'}`);
    if (solo) await pg.click('#solo');
    await pg.waitForFunction((solo) => window.__game && window.__game.netReady && (solo || window.__game.p1.online), solo, { timeout: 90000 });
    await pg.evaluate(() => { const v = window.__game.view; v.renderer.render = () => {}; if (v.composer) v.composer.render = () => {}; });
    return pg;
  };
  // Feste Plattform über Zwischenstopp 5 (nicht der Zwischenstopp selbst)
  const spot = (pg) => pg.evaluate(() => {
    const g = window.__game, c5 = g.level.checkpoints[5], c6 = g.level.checkpoints[6];
    const bad = (b) => b.mover || b.belt || b.ice || b.crumble || b.blink || b.ramp || b.round || b.hidden || b.machine || b.big || b === c5.box;
    const b = g.world.statics.find((b) => !bad(b) && b.max[1] > c5.pos[1] + 2 && b.max[1] < c6.pos[1] - 1 && b.max[0] - b.min[0] > 1.8 && b.max[2] - b.min[2] > 1.8
      && g.standable([(b.min[0] + b.max[0]) / 2, b.max[1], (b.min[2] + b.max[2]) / 2])
      && !g.world.zoneAt([(b.min[0] + b.max[0]) / 2, b.max[1], (b.min[2] + b.max[2]) / 2], true) && !g.world.zoneAt([(b.min[0] + b.max[0]) / 2, b.max[1], (b.min[2] + b.max[2]) / 2])
      && !g.world.statics.some((o) => o !== b && o.min[1] < b.max[1] + 2.2 && o.max[1] > b.max[1] + 0.01 && o.min[0] < b.max[0] && o.max[0] > b.min[0] && o.min[2] < b.max[2] && o.max[2] > b.min[2]));
    return { pos: [(b.min[0] + b.max[0]) / 2, b.max[1] + 0.3, (b.min[2] + b.max[2]) / 2] };
  });
  // Erst alle im Freiflug hinbringen (sonst zieht das Seil zur alten Netzposition), dann landen
  const standAt = async (pages, sp) => {
    for (const fly of [true, false]) {
      for (const [i, pg] of pages.entries()) await pg.evaluate(([sp, i, fly]) => {
        const g = window.__game; g.setCheckpoint(5, false, true);
        const b = g.p1.body; b.pos = [sp.pos[0] + (i ? 0.4 : -0.4), sp.pos[1], sp.pos[2]]; b.vel = [0, 0, 0]; g.p1.fly = fly; g.p1.saveTry = 0;
      }, [sp, i, fly]);
      await pages[0].waitForTimeout(900);
    }
    for (const pg of pages) await pg.waitForFunction(() => { const b = window.__game.p1.body; return b.grounded && b.vel[1] === 0 || b.grounded; }, null, { timeout: 15000 }).catch(() => {});
    await pages[0].waitForTimeout(300);
  };
  const near = (pages, sp, d = 2) => Promise.all(pages.map((p) => p.evaluate(([sp, d]) => { const q = window.__game.p1.body.pos; return Math.hypot(q[0] - sp.pos[0], q[1] - sp.pos[1], q[2] - sp.pos[2]) < d; }, [sp, d])));
  const crash = (pages) => Promise.all(pages.map((p) => p.evaluate(() => { const g = window.__game; g.p1.body.pos[1] += 30; g.crashRespawn(g.p1); })));

  // ── Solo: sofort, ohne Abstimmung
  const solo = await open('Solo', true);
  const sp = await spot(solo);
  await standAt([solo], sp);
  await solo.evaluate(() => window.__game.requestSave(window.__game.p1));
  let s = await solo.evaluate(() => ({ pt: !!window.__game.activeSave(window.__game.p1), left: window.__game.saveOf(window.__game.p1).left(1), hud: document.getElementById('hud-save').textContent }));
  ok(s.pt && s.left === 1, 'Solo: Speicherpunkt sofort gesetzt, noch 1 Item');
  console.log('  HUD:', s.hud);
  await crash([solo]);
  ok((await near([solo], sp)).every(Boolean), 'Solo: nach Absturz am Speicherpunkt');
  await solo.evaluate(() => { const g = window.__game; g.p1.body.pos = [0, 0.3, 0]; g.p1.body.grounded = false; });
  await solo.waitForTimeout(400);
  await solo.evaluate(() => { const g = window.__game; g.p1.saveTry = 0; g.requestSave(g.p1); });
  ok(await solo.evaluate(() => window.__game.saveOf(window.__game.p1).left(1) === 1), 'Solo: auf dem Hof kein Item verbraucht');
  await solo.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/solo.png' : '/dev/null' }).catch(() => {});
  await solo.context().close();

  // ── Online zu zweit: erst nach Zustimmung
  const pages = [await open('Anna'), await open('Ben')];
  await pages[0].waitForTimeout(1500);
  const all = (fn, arg) => Promise.all(pages.map((p) => p.evaluate(fn, arg)));
  await standAt(pages, sp);
  await pages[0].evaluate(() => window.__game.requestSave(window.__game.p1));
  await pages[0].waitForTimeout(700);
  let st = await all(() => { const g = window.__game, v = [...g.votes.values()][0]; return { v: v ? `${v.kind} ${v.count}/${v.need.length}` : null, pt: !!g.activeSave(g.p1), txt: document.getElementById('vote').textContent }; });
  ok(st.every((x) => x.v === 'save 1/2' && !x.pt), 'Abstimmung bei beiden, noch kein Speicherpunkt');
  console.log('  Anzeige:', st[1].txt);
  await pages[1].evaluate(() => window.__game.requestSave(window.__game.p1));
  await pages[0].waitForTimeout(1200);
  st = await all(() => { const g = window.__game; return { pt: !!g.activeSave(g.p1), left: g.saveOf(g.p1).left(1), votes: g.votes.size }; });
  ok(st.every((x) => x.pt && x.left === 1 && x.votes === 0), 'nach Zustimmung: Speicherpunkt bei beiden, 1 Item übrig');
  // R im Koop (Abstimmung): die Seilschaft geht zum Speicherpunkt statt zum Zwischenstopp
  await all(() => { const g = window.__game; g.p1.body.pos[1] -= 20; g.lastReset = 0; });
  await pages[0].evaluate(() => window.__game.requestReset(window.__game.p1));
  await pages[0].waitForTimeout(600);
  ok(await pages[1].evaluate(() => document.getElementById('vote').textContent.includes('Speicherpunkt')), 'Reset-Abstimmung nennt den Speicherpunkt als Ziel');
  await pages[1].evaluate(() => window.__game.requestReset(window.__game.p1));
  await pages[0].waitForTimeout(1500);
  const after = await Promise.all(pages.map((p) => p.evaluate(() => window.__game.p1.body.pos.map((v) => +v.toFixed(2)))));
  const pt = await pages[0].evaluate(() => window.__game.saves[0].pt);
  ok((await near(pages, pt, 2.5)).every(Boolean), 'beide steigen am Speicherpunkt wieder ein');
  console.log('  Punkt', pt.pos, 'Spieler', JSON.stringify(after));

  // Zweites Item, drittes geht nicht mehr
  await standAt(pages, sp);
  await pages[1].evaluate(() => window.__game.requestSave(window.__game.p1));
  await pages[0].waitForTimeout(500);
  await pages[0].evaluate(() => window.__game.requestSave(window.__game.p1));
  await pages[0].waitForTimeout(1200);
  ok((await all(() => window.__game.saveOf(window.__game.p1).left(1))).every((n) => n === 0), 'zweites Item benutzt');
  await all(() => { const g = window.__game; g.p1.saveTry = 0; g.requestSave(g.p1); });
  await pages[0].waitForTimeout(500);
  ok((await all(() => window.__game.votes.size)).every((n) => n === 0), 'drittes Item im Akt: keine Abstimmung');

  // Neuer Mitspieler bekommt den Stand vom Raum
  const cem = await open('Cem');
  ok(await cem.evaluate(() => { const st = window.__game.saves[0]; return st.left(1) === 0 && !!st.pt; }), 'Neuer Mitspieler kennt den Stand (0 Items, Punkt gesetzt)');
  // Nächster Zwischenstopp: Punkt hinfällig
  await pages[0].evaluate(() => { const g = window.__game; g.setCheckpoint(6, true, false, g.p1); });
  await pages[0].waitForTimeout(800);
  ok((await all(() => !window.__game.activeSave(window.__game.p1))).every(Boolean), 'neuer Zwischenstopp: Speicherpunkt gilt nicht mehr');

  await br.close();
  console.log(fails ? `${fails} Fehler` : 'alles ok');
  process.exit(fails ? 1 : 0);
})();
