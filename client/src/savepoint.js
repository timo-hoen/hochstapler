// Speicher-Items: Pro Akt hat man zwei Stück. Eins benutzen setzt den Speicherpunkt
// genau dorthin, wo man gerade steht. Ab dann geht es nach Absturz und Reset dorthin
// zurück – bis der nächste Zwischenstopp erreicht ist (der ist dann weiter oben).
// Wird von Spiel (main.js) und Raum (worker.js) gemeinsam benutzt.

export const SAVES_PER_ACT = 2;

// Akt eines Abschnitts (Akt 1 hat in level.js keine Nummer)
export function actOfSection(level, sec) {
  return level.sections[sec]?.act || 1;
}

// Kann man hier speichern? Liefert null (ja) oder den Grund (nein).
// body: Spielerkörper aus physics.js, cpY: Höhe des aktuellen Zwischenstopps,
// world: Colliders (Wind, Lüfter, Laser/Stacheln in der Nähe)
export function saveSpotError(body, cpY = 0, world = null) {
  const g = body.ground;
  if (!body.grounded || !g || body.hang || body.hook || body.ladder) return 'Erst fest auf einer Plattform stehen';
  if (g.big) return 'Auf dem Hof gibt es nichts zu speichern';
  if (g.mover || g.machine || g.crumble || g.blink || g.hidden || g.ramp || g.round || g.slide) return 'Hier wackelt es – stell dich auf festen Boden';
  if (g.belt || g.ice) return 'Hier rutscht man weg – stell dich auf festen Boden';
  if (body.pos[1] < cpY - 2) return 'Das liegt unter deinem Zwischenstopp';
  if (world?.zoneAt?.(body.pos, true) || world?.zoneAt?.(body.pos)) return 'Hier weht es zu stark';
  const p = body.pos, m = 1.2; // Laser und Stacheln (auch ausgefahrene/wandernde) nicht zu nah
  if ((world?.hazards || []).some((z) => p[0] > z.min[0] - m && p[0] < z.max[0] + m && p[2] > z.min[2] - m && p[2] < z.max[2] + m && p[1] + 1.8 > z.min[1] - 0.3 && p[1] < z.max[1] + 0.3)) return 'Zu nah an einer Gefahr';
  return null;
}

// Gültige Zahlen für Position/Index/Akt (Netz und Speicher)
export function cleanSave(m) {
  if (!m || !Array.isArray(m.pos) || m.pos.length !== 3) return null;
  const pos = m.pos.map(Number);
  if (pos.some((v) => !Number.isFinite(v) || Math.abs(v) > 5000)) return null;
  const i = Math.floor(Number(m.i)), act = Math.floor(Number(m.act));
  if (!Number.isFinite(i) || i < 0 || i > 10000 || !Number.isFinite(act) || act < 1 || act > 50) return null;
  return { pos: pos.map((v) => Math.round(v * 100) / 100), i, act };
}

// Stand eines Teams (bei allen an einem Seil: der ganzen Seilschaft)
export class SaveState {
  constructor(data) {
    this.used = {}; // Akt → benutzte Items
    this.pt = null; // { pos, i, act }: aktueller Speicherpunkt (i = Zwischenstopp beim Setzen)
    if (data) this.load(data);
  }

  load(data) {
    this.used = {};
    for (const [k, n] of Object.entries(data?.used || {})) {
      const a = Math.floor(Number(k)), c = Math.floor(Number(n));
      if (a >= 1 && a <= 50 && c > 0) this.used[a] = Math.min(SAVES_PER_ACT, c);
    }
    this.pt = cleanSave(data?.pt);
    return this;
  }

  left(act) { return Math.max(0, SAVES_PER_ACT - (this.used[act] || 0)); }

  // Speicherpunkt setzen; false, wenn in diesem Akt keine Items mehr übrig sind
  place(save) {
    const s = cleanSave(save);
    if (!s || this.left(s.act) <= 0) return false;
    this.used[s.act] = (this.used[s.act] || 0) + 1;
    this.pt = s;
    return true;
  }

  // Gilt der Punkt noch? Nur solange kein neuerer Zwischenstopp erreicht ist.
  active(cp) { return !!this.pt && this.pt.i === cp; }

  // Neuer Zwischenstopp: der alte Punkt liegt darunter und ist hinfällig
  passed(cp) { if (this.pt && cp > this.pt.i) this.pt = null; }

  clear() { this.used = {}; this.pt = null; }
  toJSON() { return { used: { ...this.used }, pt: this.pt }; }
}
