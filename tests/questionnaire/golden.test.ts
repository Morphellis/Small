/*
 * Движок против эталонов подсчёта (tests/fixtures/<id>.json, сняты до рефакторингов — tools/make-fixture.ts).
 * Любое расхождение значит, что баллы на сайте поменялись. Эталон есть у каждого опросника сервера (server/registry.ts).
 */
import fs from "node:fs";
import { describe, expect, test } from "vitest";
import { changedScales } from "../../src/kinds/questionnaire/answers";
import { computeProfile, questionKeys } from "../../server/questionnaire/engine";
import { QUESTIONNAIRES } from "../../server/registry";
import type { MaybeAnswer } from "../../src/kinds/questionnaire/types";

interface Fixture {
  questionKeys: unknown;
  kCorrection: Record<string, number>[];
  cases: ({ answers: string } & Record<string, unknown>)[];
  changed: { a: number; b: number; scales: string[] }[];
}

const decode = (s: string) => [...s].map((c) => (c === "." ? null : c)) as MaybeAnswer[];
const defs = Object.values(QUESTIONNAIRES);

test("у каждого опросника есть эталон", () => {
  for (const def of defs) expect(fs.existsSync(`tests/fixtures/${def.id}.json`), def.id).toBe(true);
});

for (const def of defs) {
  const file = `tests/fixtures/${def.id}.json`;
  if (!fs.existsSync(file)) continue;
  const fx = JSON.parse(fs.readFileSync(file, "utf8")) as Fixture;

  describe(`${def.title}: совпадает с эталоном`, () => {
    test("ключи вопросов", () => {
      expect(questionKeys(def)).toEqual(fx.questionKeys);
    });

    test("поправка K при K = 0…40", () => {
      fx.kCorrection.forEach((add, k) => expect(def.kCorrection(k), `K = ${k}`).toEqual(add));
    });

    test(`${fx.cases.length} профилей`, () => {
      for (const [i, c] of fx.cases.entries()) {
        const { answers, ...expected } = c;
        expect(computeProfile(def, decode(answers)), `набор ${i}`).toEqual(expected);
      }
    });

    test("какие шкалы изменились", () => {
      for (const { a, b, scales } of fx.changed) {
        const pa = computeProfile(def, decode(fx.cases[a].answers));
        const pb = computeProfile(def, decode(fx.cases[b].answers));
        expect(changedScales(def, pa, pb)).toEqual(scales);
      }
    });
  });
}
