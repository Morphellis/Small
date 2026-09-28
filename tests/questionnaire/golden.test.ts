/*
 * Новый движок против эталонов старого подсчёта (tests/fixtures, сняты до переноса на новую архитектуру).
 * Любое расхождение значит, что баллы на сайте поменялись.
 */
import { describe, expect, test } from "vitest";
import { changedScales, computeProfile, questionKeys } from "../../src/kinds/questionnaire/engine";
import type { QuestionnaireDef } from "../../src/kinds/questionnaire/types";
import { smil } from "../../src/tests/smil/definition";
import { smol } from "../../src/tests/smol/definition";
import smilFixture from "../fixtures/smil.json";
import smolFixture from "../fixtures/smol.json";

const decode = (s: string) => [...s].map((c) => (c === "." ? null : c));

for (const [def, fx] of [[smol, smolFixture], [smil, smilFixture]] as [QuestionnaireDef, typeof smolFixture][]) {
  describe(`${def.title}: совпадает со старым подсчётом`, () => {
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
