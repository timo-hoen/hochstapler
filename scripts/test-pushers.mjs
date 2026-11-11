// Harte Passagen: Rammböcke und Stanzpressen stoßen Spieler wirklich hinunter,
// auf Schiebebalken fährt man mit. Läuft mit der echten Physik am echten Level.
import { buildLevel, phaseOf } from '../client/src/level.js';
import { Colliders, createBody, stepBody } from '../client/src/physics.js';

const level = buildLevel();
const world = new Colliders(level);
world.forceOpen = true;
world.updatePlates([], 0);
const dt = 1 / 120;
let fails = 0;
const ok = (c, msg) => { console.log((c ? '✓ ' : '✗ ') + msg); if (!c) fails++; };

// Plattform direkt unter/neben einem Rammbock (gleiche Oberkante, überdeckt entlang der Laufrichtung)
function platformOf(m) {
  const b = m.base;
  const top = m.kind === 'press' ? b.min[1] + m.delta[1] : b.min[1];
  const cands = level.statics.filter((s) => Math.abs(s.max[1] - top) < 1e-6 && s.sec === m.sec);
  const sw = { min: b.min.map((v, i) => Math.min(v, v + m.delta[i])), max: b.max.map((v, i) => Math.max(v, v + m.delta[i])) };
  return cands.find((s) => s.min[0] < sw.max[0] && s.max[0] > sw.min[0] && s.min[2] < sw.max[2] && s.max[2] > sw.min[2]);
}
const timeAt = (m, u) => { let t = 1000; while (Math.abs(phaseOf(m.period, m.phase, t) - u) > 0.003) t += 0.002; return t; };

function knock(kind) {
  const ms = level.movers.filter((m) => m.kind === kind);
  let shoved = 0, fell = 0, tried = 0;
  for (const m of ms) {
    const p = platformOf(m);
    if (!p) continue;
    tried++;
    let t = timeAt(m, 0.3); // in Ruhe
    world.t = null; world.update(t);
    // Spieler auf der Plattform, dort wo der Kolben durchfährt
    const bx = (Math.max(p.min[0], m.base.min[0]) + Math.min(p.max[0], m.base.max[0])) / 2;
    const bz = (Math.max(p.min[2], m.base.min[2]) + Math.min(p.max[2], m.base.max[2])) / 2;
    const cx = m.delta[0] ? (p.min[0] + p.max[0]) / 2 : bx;
    const cz = m.delta[2] ? (p.min[2] + p.max[2]) / 2 : bz;
    const body = createBody([cx, p.max[1] + 0.01, cz]);
    body.grounded = true; body.ground = p;
    let hit = false;
    for (let s = 0; s < 120 * m.period; s++) {
      t += dt; world.update(t);
      stepBody(body, { x: 0, z: 0, jump: false, brace: false }, world, dt);
      if (body.shoved) hit = true;
    }
    if (hit) shoved++; else if (process.env.DBG) console.log("kein Stoß", kind, level.movers.indexOf(m), body.pos.map((v) => v.toFixed(2)).join(","), p.max[1].toFixed(2), body.ground && body.ground.mat);
    if (body.ground !== p && !(body.pos[1] > p.max[1] - 0.05 && body.pos[0] > p.min[0] && body.pos[0] < p.max[0] && body.pos[2] > p.min[2] && body.pos[2] < p.max[2])) fell++; // nicht mehr auf der Plattform
  }
  return { tried, shoved, fell, total: ms.length };
}
const r = knock('ram');
ok(r.tried > 20 && r.shoved === r.tried && r.fell === r.tried, `Rammböcke: ${r.fell}/${r.tried} Spieler hinuntergestoßen (${r.total} Rammböcke)`);
const p = knock('press');
ok(p.tried > 20 && p.shoved === p.tried && p.fell === p.tried, `Stanzpressen: ${p.fell}/${p.tried} Spieler von der Stufe gedrückt (${p.total} Pressen)`);

// Wer rechtzeitig weitergeht, kommt durch: Spieler in Ruhe neben dem eingefahrenen Kolben bleibt oben
{
  const m = level.movers.find((x) => x.kind === 'ram' && platformOf(x));
  const pl = platformOf(m);
  let t = timeAt(m, 0.05);
  world.t = null; world.update(t);
  const body = createBody([(pl.min[0] + pl.max[0]) / 2, pl.max[1] + 0.01, (pl.min[2] + pl.max[2]) / 2]);
  body.grounded = true; body.ground = pl;
  for (let s = 0; s < 60; s++) { t += dt; world.update(t); stepBody(body, { x: 0, z: 0, jump: false, brace: false }, world, dt); }
  ok(!body.shoved && body.grounded && Math.abs(body.pos[1] - pl.max[1]) < 0.05, 'Rammbock in Ruhe: Spieler steht sicher');
}

// Schiebebalken: man fährt quer mit und fällt nicht herunter
{
  const m = level.movers.find((x) => x.sidestep);
  const i = level.movers.indexOf(m);
  const box = world.moverBoxes[i];
  let t = timeAt(m, 0.05);
  world.t = null; world.update(t);
  const body = createBody([(box.min[0] + box.max[0]) / 2, box.max[1] + 0.01, (box.min[2] + box.max[2]) / 2]);
  body.grounded = true; body.ground = box;
  const x0 = [body.pos[0], body.pos[2]];
  for (let s = 0; s < 120 * m.period * 0.5; s++) { t += dt; world.update(t); stepBody(body, { x: 0, z: 0, jump: false, brace: false }, world, dt); }
  const moved = Math.hypot(body.pos[0] - x0[0], body.pos[2] - x0[1]);
  const want = Math.hypot(m.delta[0], m.delta[2]);
  ok(body.grounded && body.ground === box && Math.abs(moved - want) < 0.15, `Schiebebalken (${(box.max[0] - box.min[0]).toFixed(2)}×${(box.max[2] - box.min[2]).toFixed(2)} m): mitgefahren ${moved.toFixed(2)} von ${want.toFixed(2)} m`);
}

// Jeder Akt 2–7 hat mindestens zwei harte Passagen
{
  const acts = new Map();
  for (const q of level.path) if (['sliders', 'rams', 'gauntlet', 'presses'].includes(q.piece)) {
    const a = level.sections[q.box.sec ?? q.mover?.sec]?.act;
    if (!acts.has(a)) acts.set(a, new Set());
    acts.get(a).add(q.piece + (q.box.sec ?? q.mover?.sec));
  }
  const thin = [2, 3, 4, 5, 6, 7].filter((a) => !acts.has(a) || acts.get(a).size < 2);
  ok(!thin.length, `harte Passagen in allen Akten 2–7 (${[...acts].map(([a, s]) => `Akt ${a}: ${s.size}`).join(', ')})`);
}

// Stanzpressen obendrüber: vom Podest auf den ersten Stempel, von Stempel zu Stempel,
// oben mitfahren, Kante greifen. Alle Pressen einer Reihe stoßen im selben Takt.
{
  const presses = level.movers.filter((m) => m.kind === 'press');
  const box = (m) => world.moverBoxes[level.movers.indexOf(m)];
  const rows = [];
  for (const m of presses) {
    const r = rows.find((x) => x.sec === m.sec && x.period === m.period && Math.abs(x.ms[x.ms.length - 1].base.min[1] - m.base.min[1]) < 1.5);
    if (r && r.ms.length < 4) r.ms.push(m); else rows.push({ sec: m.sec, period: m.period, ms: [m] });
  }
  ok(rows.every((r) => r.ms.every((m) => m.phase === r.ms[0].phase)), `Pressen einer Reihe im selben Takt (${rows.length} Reihen)`);
  // Sprung von Box a zur Mitte von Box b (Anlauf von hinten, Absprung an der Kante, Luftsteuerung)
  function hop(a, b, t) {
    const ac = [(a.min[0] + a.max[0]) / 2, a.max[1], (a.min[2] + a.max[2]) / 2];
    const bc = () => [(b.min[0] + b.max[0]) / 2, b.max[1], (b.min[2] + b.max[2]) / 2];
    const c0 = bc(), dx = c0[0] - ac[0], dz = c0[2] - ac[2];
    const dir = Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
    const half = dir[0] ? (a.max[0] - a.min[0]) / 2 : (a.max[2] - a.min[2]) / 2;
    const body = createBody([ac[0] - dir[0] * (half - 0.35), ac[1] + 0.01, ac[2] - dir[1] * (half - 0.35)]);
    body.grounded = true; body.ground = a;
    let jumped = false;
    for (let s = 0; s < 120 * 3; s++) {
      t += dt; world.update(t);
      let ix = dir[0], iz = dir[1], jump = false;
      const out = dir[0] ? (dir[0] > 0 ? body.pos[0] + 0.3 - a.max[0] : a.min[0] - (body.pos[0] - 0.3)) : (dir[1] > 0 ? body.pos[2] + 0.3 - a.max[2] : a.min[2] - (body.pos[2] - 0.3));
      if (!jumped && out > 0.1 && body.grounded) { jump = true; jumped = true; }
      if (jumped && !jump) { const c = bc(); const tx = c[0] - body.pos[0], tz = c[2] - body.pos[2], l = Math.hypot(tx, tz); const k2 = Math.min(1, l * 0.8) / Math.max(l, 1e-6); ix = tx * k2; iz = tz * k2; }
      stepBody(body, { x: ix, z: iz, jump, brace: false }, world, dt);
      if (jumped && s > 10 && body.grounded) return { ok: body.ground === b, body, t };
    }
    return { ok: false, body, t };
  }
  let exitOk = 0, exitN = 0, pod = 0, podN = 0, across = 0, acrossN = 0, ride = 0, rideN = 0;
  for (const r of rows) {
    const m0 = r.ms[0];
    const t0 = timeAt(m0, 0.03); // Ruhe beginnt gerade
    world.t = null; world.update(t0);
    // Podest: statische Fläche direkt vor dem ersten Tritt, knapp unter dem ersten Stempel
    const s0 = platformOf(m0), b0 = box(m0);
    const i0 = level.path.findIndex((q) => q.box === s0);
    const podest = i0 > 0 ? level.path[i0 - 1].box : null;
    if (podest && podest.max[1] > s0.max[1] + 1) {
      podN++;
      world.t = null; world.update(t0);
      if (hop(podest, b0, t0).ok) pod++; else if (process.env.DBG) console.log('Podest → Stempel', presses.indexOf(m0));
    }
    for (let i = 0; i + 1 < r.ms.length; i++) {
      acrossN++;
      world.t = null; world.update(t0);
      if (hop(box(r.ms[i]), box(r.ms[i + 1]), t0).ok) across++; else if (process.env.DBG) console.log('Stempel → Stempel', presses.indexOf(r.ms[i]));
    }
    // Vom letzten Stempel hinunter auf die Ausstiegsfläche
    {
      const last = r.ms[r.ms.length - 1], sl = platformOf(last);
      const il = level.path.findIndex((q) => q.box === sl);
      const exit = il >= 0 ? level.path[il + 1]?.box : null;
      if (exit && exit.max[1] < box(last).max[1] && !exit.mover) {
        exitN++;
        world.t = null; world.update(t0);
        if (hop(box(last), exit, t0).ok) exitOk++; else if (process.env.DBG) console.log('Stempel → Ausstieg', presses.indexOf(last));
      }
    }
    // Oben stehen bleiben: ein ganzer Takt (Stoß und Hochfahren), man fährt mit und bleibt oben
    {
      rideN++;
      let t = t0; world.t = null; world.update(t);
      const b = box(m0);
      const body = createBody([(b.min[0] + b.max[0]) / 2, b.max[1] + 0.01, (b.min[2] + b.max[2]) / 2]);
      body.grounded = true; body.ground = b;
      for (let s = 0; s < 120 * m0.period * 1.2; s++) { t += dt; world.update(t); stepBody(body, { x: 0, z: 0, jump: false, brace: false }, world, dt); }
      if (body.grounded && body.ground === b && Math.abs(body.pos[1] - b.max[1]) < 0.05) ride++;
    }
  }
  ok(podN > 10 && pod === podN, `Podest → erster Stempel: ${pod}/${podN} Sprünge gelandet`);
  ok(acrossN > 20 && across === acrossN, `Stempel → Stempel: ${across}/${acrossN} Sprünge gelandet`);
  ok(exitN > 10 && exitOk === exitN, `letzter Stempel → Ausstieg: ${exitOk}/${exitN} Sprünge gelandet`);
  ok(rideN > 10 && ride === rideN, `oben auf dem Stempel durch einen ganzen Takt mitgefahren: ${ride}/${rideN}`);

  // Kantengriff: am ruhenden Stempel hängen, beim Losfahren loslassen
  {
    const m = rows[0].ms[1];
    const b = box(m);
    let t = timeAt(m, 0.03); world.t = null; world.update(t);
    const s = m.side; // quer zur Laufrichtung: zur Seite hin hängen
    const ax = s[0] ? 0 : 2, sg = 1;
    const p = [(b.min[0] + b.max[0]) / 2, b.max[1] - 1.6, (b.min[2] + b.max[2]) / 2];
    p[ax] = (sg > 0 ? b.max[ax] + 0.31 : b.min[ax] - 0.31);
    const body = createBody(p);
    body.grounded = false; body.vel[1] = -0.5;
    const inp = { x: ax === 0 ? -sg : 0, z: ax === 2 ? -sg : 0, jump: false, brace: false };
    let hung = false;
    for (let k2 = 0; k2 < 30; k2++) { t += dt; world.update(t); stepBody(body, inp, world, dt); if (body.hang) { hung = true; break; } }
    ok(hung && body.hang.box === b, 'Kante eines ruhenden Stempels greifbar');
    let let0 = false;
    for (let k2 = 0; k2 < 120 * m.period && hung; k2++) { t += dt; world.update(t); stepBody(body, { x: 0, z: 0, jump: false, brace: false }, world, dt); if (!body.hang) { let0 = true; break; } }
    ok(let0 && phaseOf(m.period, m.phase, t) > 0.5, 'fährt der Stempel los, lässt man los');
  }
}

if (fails) { console.log(`${fails} Fehler`); process.exit(1); }
console.log('✓ Harte Passagen ok');
