// Abstimmung „zurück zum Zwischenstopp“: Im Koop holt die Reset-Taste (R / View / ↺)
// die ganze Seilschaft zurück – aber erst, wenn alle darin zugestimmt haben.
// Wer fragt, entscheidet am Ende (schickt den Warp); die anderen zeigen nur den Stand.
// Dieselbe Abstimmung gibt es für Speicher-Items (kind 'save'): Speicherpunkt dort setzen,
// wo der Fragende steht – auch dafür müssen alle in der Seilschaft zustimmen.

export const VOTE_TIME = 20; // Sekunden, bis eine Abstimmung verfällt
export const VOTE_GRACE = 5; // so lange warten Mitspieler zusätzlich auf den Warp

export class ResetVote {
  // need: alle Spieler-IDs, die zustimmen müssen (inkl. dem, der fragt)
  constructor({ v, by, byName, need, team = 0, now = 0, kind = 'reset', act = 1, pos = null }) {
    this.v = v;
    this.by = by;
    this.byName = byName;
    this.need = [...new Set(need)];
    if (!this.need.includes(by)) this.need.push(by);
    this.team = team;
    this.kind = kind === 'save' ? 'save' : 'reset';
    this.act = act; // Speicher-Item: Akt, aus dessen Vorrat es kommt
    this.pos = pos; // Speicher-Item: wo der Fragende stand (nur bei ihm bekannt)
    this.yes = new Set([by]);
    this.started = now;
    this.until = now + VOTE_TIME * 1000;
    this.closing = false; // alle dafür, Warp kommt gleich
  }

  // true, wenn die Stimme neu ist
  agree(id) {
    if (!this.need.includes(id) || this.yes.has(id)) return false;
    this.yes.add(id);
    return true;
  }

  // Spieler hat den Raum verlassen: zählt nicht mehr mit
  drop(id) {
    this.need = this.need.filter((x) => x !== id);
    this.yes.delete(id);
  }

  has(id) { return this.need.includes(id); }
  get count() { return this.need.filter((id) => this.yes.has(id)).length; }
  get done() { return this.need.every((id) => this.yes.has(id)); }
  secondsLeft(now) { return Math.max(0, Math.ceil((this.until - now) / 1000)); }
}

// Kommen sich zwei Abstimmungen in die Quere? Nur gleiche Art mit gemeinsamen Spielern
export function votesClash(a, b) {
  return a.kind === b.kind && a.need.some((id) => b.has(id));
}

// Fragen zwei gleichzeitig, gewinnt überall dieselbe Abstimmung (kleinere Kennung)
export function voteWinner(a, b) {
  return a.v <= b.v ? a : b;
}

export function newVoteId() {
  return Math.random().toString(36).slice(2, 10);
}
