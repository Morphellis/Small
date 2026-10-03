/*
 * Эталон подсчёта опросника для tests/questionnaire/golden.test.ts: ключи вопросов, поправка K при K = 0…40,
 * профили для набора ответов и изменившиеся шкалы. Снимается с текущего кода ДО рефакторинга — после него
 * любое расхождение с эталоном значит, что баллы на сайте поменялись.
 *
 *   npm run fixture <id>        например: npm run fixture mmil → tests/fixtures/mmil.json
 */
import fs from "node:fs";
import { computeProfile, questionKeys } from "../server/questionnaire/engine";
import { QUESTIONNAIRES } from "../server/registry";
import { changedScales } from "../src/kinds/questionnaire/answers";
import type { MaybeAnswer } from "../src/kinds/questionnaire/types";

const id = process.argv.filter((a) => a !== "--").pop()!;
const def = QUESTIONNAIRES[id];
if (!def) throw new Error("нет опросника " + id + " в server/registry.ts");
const N = def.questions.length;
const values: MaybeAnswer[] = def.allowDontKnow === false ? ["Y", "N", null] : ["Y", "N", "?", null];

// Детерминированный генератор (mulberry32), чтобы эталон воспроизводился.
let seed = 20260929;
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const enc = (a: MaybeAnswer[]) => a.map((v) => v ?? ".").join("");
const sets: MaybeAnswer[][] = [
  ...values.map((v) => new Array<MaybeAnswer>(N).fill(v)),
  ...Array.from({ length: 300 }, () => Array.from({ length: N }, () => values[Math.floor(rnd() * values.length)]))
];
const cases = sets.map((a) => ({ answers: enc(a), ...computeProfile(def, a) }));
const changed = Array.from({ length: 60 }, (_, i) => {
  const a = i, b = (i * 7 + 3) % sets.length;
  return { a, b, scales: changedScales(def, computeProfile(def, sets[a]), computeProfile(def, sets[b])) };
});
const fixture = {
  note: `Эталон ${def.title}, снят ${new Date().toISOString().slice(0, 10)} с кода до рефакторинга (tools/make-fixture.ts).`,
  questionKeys: questionKeys(def),
  kCorrection: Array.from({ length: 41 }, (_, k) => def.kCorrection(k)),
  cases,
  changed
};
fs.writeFileSync(`tests/fixtures/${id}.json`, JSON.stringify(fixture));
console.log(`tests/fixtures/${id}.json: ${cases.length} профилей`);
