// Speicher-Items: 2 pro Akt, Punkt gilt bis zum nächsten Zwischenstopp, Platzprüfung, Abstimmung
import { SaveState, SAVES_PER_ACT, saveSpotError, cleanSave, actOfSection } from '../client/src/savepoint.js';
import { ResetVote, votesClash } from '../client/src/vote.js';
import { buildLevel } from '../client/src/level.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('✗', msg); } };

const st = new SaveState();
ok(SAVES_PER_ACT === 2 && st.left(1) === 2, 'zwei Items pro Akt');
ok(st.place({ pos: [1, 5, 2], i: 3, act: 1 }) && st.left(1) === 1, 'erstes Item benutzt');
ok(st.active(3) && !st.active(4), 'Punkt gilt nur beim Zwischenstopp, bei dem er gesetzt wurde');
ok(st.place({ pos: [1, 7, 2], i: 3, act: 1 }) && st.left(1) === 0 && st.pt.pos[1] === 7, 'zweites Item ersetzt den Punkt');
ok(!st.place({ pos: [1, 9, 2], i: 3, act: 1 }) && st.pt.pos[1] === 7, 'drittes Item im selben Akt geht nicht');
ok(st.left(2) === 2 && st.place({ pos: [0, 90, 0], i: 8, act: 2 }), 'neuer Akt: wieder zwei');
st.passed(9);
ok(!st.pt && st.left(2) === 1, 'neuer Zwischenstopp: Punkt weg, Zähler bleibt');
const copy = new SaveState(JSON.parse(JSON.stringify(st.toJSON())));
ok(copy.left(1) === 0 && copy.left(2) === 1, 'Stand übersteht Speichern/Laden');
ok(new SaveState({ used: { 1: 99, x: 1 }, pt: { pos: [NaN, 0, 0], i: 0, act: 1 } }).left(1) === 0, 'kaputte Daten werden bereinigt');
ok(!cleanSave({ pos: [0, 0], i: 0, act: 1 }) && !cleanSave({ pos: [0, 0, 0], i: -1, act: 1 }), 'Netzdaten geprüft');

const ground = { min: [0, 0, 0], max: [2, 1, 2] };
const body = (g, extra = {}) => ({ grounded: true, ground: g, pos: [1, 1, 1], ...extra });
ok(saveSpotError(body(ground)) === null, 'fester Boden: speichern geht');
ok(saveSpotError(body(ground, { grounded: false })), 'in der Luft nicht');
ok(saveSpotError(body(ground, { hook: {} })), 'am Haken nicht');
ok(saveSpotError(body({ ...ground, mover: {} })), 'auf beweglicher Plattform nicht');
ok(saveSpotError(body({ ...ground, crumble: true })), 'auf Bruchpalette nicht');
ok(saveSpotError(body({ ...ground, belt: [1, 0, 0] })) && saveSpotError(body({ ...ground, ice: true })), 'auf Förderband und Eis nicht');
ok(saveSpotError(body({ ...ground, big: true })), 'auf dem Hof nicht');
ok(saveSpotError(body(ground), 10), 'weit unter dem Zwischenstopp nicht');
ok(saveSpotError(body(ground), 0, { zoneAt: (p, w) => (w ? { push: [1, 0, 0] } : null), hazards: [] }), 'im Wind nicht');
ok(saveSpotError(body(ground), 0, { zoneAt: () => null, hazards: [{ min: [1.5, 1, 1.5], max: [1.6, 2, 3] }] }), 'neben Laser/Stacheln nicht');
ok(saveSpotError(body(ground), 0, { zoneAt: () => null, hazards: [{ min: [9, 1, 9], max: [10, 2, 10] }] }) === null, 'Gefahr weit weg stört nicht');

const level = buildLevel();
ok(actOfSection(level, 0) === 1 && actOfSection(level, level.sections.length - 1) >= 8, 'Akt aus dem Abschnitt');

const a = new ResetVote({ v: 'a', by: 'A', byName: 'A', need: ['A', 'B'], kind: 'save', act: 2, pos: [0, 0, 0] });
const b = new ResetVote({ v: 'b', by: 'B', byName: 'B', need: ['A', 'B'] });
const c = new ResetVote({ v: 'c', by: 'B', byName: 'B', need: ['A', 'B'], kind: 'save' });
ok(a.kind === 'save' && b.kind === 'reset' && !votesClash(a, b) && votesClash(a, c), 'Speicher- und Reset-Abstimmung stören sich nicht');
ok(!a.done && a.agree('B') && a.done, 'im Koop müssen alle zustimmen');

if (fails) { console.log(`Speicher-Items: ${fails} Fehler`); process.exit(1); }
console.log('Speicher-Items: ok');
