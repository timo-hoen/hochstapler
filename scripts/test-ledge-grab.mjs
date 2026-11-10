// Kantengriff: Springt man an eine Wand, deren Oberkante in Griffhöhe liegt, muss man
// zuverlässig hängen bleiben – auch wenn die Wand aus gestapelten oder nebeneinander
// stehenden Kisten besteht (dann berührt man mehrere Boxen gleichzeitig).
import { Colliders, createBody, stepBody, PHYS } from '../client/src/physics.js';

const dt = 1 / 120;
const box = (min, max, extra = {}) => ({ min, max, mat: 'crate', ...extra });

// Boden bei y=0; Wand ab x=2. Varianten der Wand (Oberkante jeweils 2,0 m über dem Boden)
const walls = {
  'eine Kiste': [box([2, 0, -2], [3, 2, 2])],
  'zwei gestapelt (unten zuerst)': [box([2, 0, -2], [3, 1, 2]), box([2, 1, -2], [3, 2, 2])],
  'zwei gestapelt (oben zuerst)': [box([2, 1, -2], [3, 2, 2]), box([2, 0, -2], [3, 1, 2])],
  'Sockel + Kiste (Sockel 0,6 m)': [box([2, 0.6, -2], [3, 2, 2]), box([2, 0, -2], [3, 0.6, 2])],
  'nebeneinander, Fuge in der Mitte': [box([2, 0, -2], [3, 2, 0]), box([2, 0, 0], [3, 1.2, 2])],
  'drei gestapelt': [box([2, 1.4, -2], [3, 2, 2]), box([2, 0, -2], [3, 0.7, 2]), box([2, 0.7, -2], [3, 1.4, 2])],
  'höhere Kiste dahinter': [box([2, 0, -2], [3, 1, 2]), box([2, 0, -2], [3.2, 2, 2])],
};

function world(statics) {
  const floor = box([-6, -1, -6], [6, 0, 6]);
  const w = new Colliders({ statics: [floor, ...statics], movers: [], zones: [], hooks: [], ladders: [], hazards: [], plates: [] });
  w.forceOpen = true;
  return w;
}

// Anlauf, Sprung, gegen die Wand drücken. Ergebnis: hängt man an der Kante?
function attempt(w, startX, z, jumpAt) {
  const body = createBody([startX, 0, z]);
  body.grounded = true;
  for (let s = 0; s < 120 * 2; s++) {
    const jump = s === jumpAt;
    stepBody(body, { x: 1, z: 0, jump, brace: false }, w, dt);
    if (body.hang) return { ok: true, top: body.hang.top };
  }
  return { ok: false, y: body.pos[1].toFixed(2), grounded: body.grounded };
}

let fail = 0;
for (const [name, statics] of Object.entries(walls)) {
  const w = world(statics);
  let ok = 0, n = 0; const bad = [];
  for (const startX of [-1.5, 0, 1]) for (const z of [-1, -0.3, 0.3, 1]) for (const jumpAt of [0, 5, 10, 20]) {
    n++;
    const r = attempt(w, startX, z, jumpAt);
    if (r.ok && Math.abs(r.top - 2) < 1e-6) ok++;
    else if (bad.length < 3) bad.push(`x=${startX} z=${z} sprung@${jumpAt}: ${r.ok ? 'falsche Kante ' + r.top : 'kein Griff, y=' + r.y}`);
  }
  // Fuge: auf der niedrigeren Seite (z>0) ist die Kante 1,2 m – dort zählt die höhere nicht
  const need = name.startsWith('nebeneinander') ? n / 2 : n;
  const pass = ok >= need;
  if (!pass) fail++;
  console.log(`${pass ? 'ok  ' : 'FEHL'} ${name}: ${ok}/${n} gegriffen${pass ? '' : '  ' + bad.join(' | ')}`);
}
// Nach dem Hochziehen kurz stehen bleiben: W und Leertaste gehalten/gedrückt, schmale Kiste
// (1 m tief) – man darf nicht gleich wieder hinten herunterlaufen oder -springen.
{
  const w = world([box([2, 0, -2], [3, 2, 2])]);
  const body = createBody([1, 0, 0]);
  body.grounded = true;
  let climbedAt = -1, fell = false, moved = 0, jumpedAfter = false, top = null;
  for (let s = 0; s < 120 * 3; s++) {
    const jump = s === 0 || (climbedAt < 0 && body.hang && s % 2 === 0) || (climbedAt >= 0 && s % 3 === 0);
    stepBody(body, { x: 1, z: 0, jump, brace: false }, w, dt);
    if (body.climbed && climbedAt < 0) { climbedAt = s; top = [...body.pos]; }
    if (climbedAt >= 0 && s - climbedAt < 120 * (0.45)) {
      moved = Math.max(moved, Math.hypot(body.pos[0] - top[0], body.pos[2] - top[2]));
      if (body.jumped) jumpedAfter = true;
    }
    if (climbedAt >= 0 && s - climbedAt < 120 * 0.5 && body.pos[1] < 1.9) fell = true;
  }
  const pass = climbedAt >= 0 && moved < 0.01 && !jumpedAfter && !fell;
  if (!pass) fail++;
  console.log(`${pass ? 'ok  ' : 'FEHL'} Stehenbleiben nach dem Hochziehen: hochgezogen=${climbedAt >= 0} bewegt=${moved.toFixed(3)} m gesprungen=${jumpedAfter} runter=${fell}`);
  // danach geht es normal weiter
  if (pass && Math.hypot(body.pos[0] - top[0], body.pos[2] - top[2]) < 0.3) { fail++; console.log('FEHL danach wieder beweglich'); }
}
if (fail) { console.error(`Kantengriff: ${fail} Wandvarianten unzuverlässig`); process.exit(1); }
console.log('Kantengriff ok');
