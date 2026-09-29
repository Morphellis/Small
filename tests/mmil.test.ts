import { describe, expect, test } from "vitest";
import { computeProfile, questionKeys } from "../src/kinds/questionnaire/engine";
import type { Answer, MaybeAnswer } from "../src/kinds/questionnaire/types";
import { MMIL_DATA as D } from "../src/tests/mmil/data";
import { mmil } from "../src/tests/mmil/definition";
import { K_ON, MMIL_HINTS } from "../src/tests/mmil/hints";

const N = 377;

describe("ММИЛ: как пример результата psytests (mmlM5-uPOTpl-dk6HXK, мужчина)", () => {
  // Таблица «Расчеты»: сырой → с поправкой K → Т. K = 23.
  const rows: [string, number, number, number][] = [
    ["L", 0, 0, 32], ["F", 1, 1, 34], ["K", 23, 23, 69],
    ["1", 0, 12, 50], ["2", 17, 17, 42], ["3", 21, 21, 57], ["4", 13, 22, 52], ["5", 19, 19, 43],
    ["6", 6, 6, 38], ["7", 9, 32, 60], ["8", 4, 27, 51], ["9", 16, 21, 56], ["0", 22, 22, 43]
  ];

  test("поправка K = 23: +12, +9, +23, +23, +5 (половина вверх)", () => {
    expect(mmil.kCorrection(23)).toEqual({ "1": 12, "4": 9, "7": 23, "8": 23, "9": 5 });
  });

  test("Т по всем 13 шкалам", () => {
    const add = mmil.kCorrection(23);
    for (const [s, raw, corrected, t] of rows) {
      expect(raw + (add[s] ?? 0), `с поправкой ${s}`).toBe(corrected);
      expect(mmil.tScore(s, corrected).t, `Т ${s}`).toBe(t);
    }
  });
});

describe("ММИЛ: данные", () => {
  test("377 утверждений в порядке бланка psytests", () => {
    expect(D.questions.length).toBe(N);
    expect(D.questions[0]).toMatch(/работа медбрата/);
    expect(D.questions[375]).toMatch(/изжога/);
    expect(D.questions[376]).toMatch(/В хорошую погоду/);
  });

  test("выбор обязательный: без «Не знаю»", () => {
    expect(mmil.allowDontKnow).toBe(false);
  });

  /*
   * Максимумы шкал в таблице psytests (число пунктов + наибольшая поправка K при K = 30).
   * Шкалы 4 и 7 у psytests длиннее и короче на один пункт — известное расхождение с ключом psylab (см. data.ts).
   */
  test("длина шкал как у psytests, кроме известных расхождений в 4 и 7", () => {
    const psyMax: Record<string, number> = { L: 15, F: 63, K: 30, "1": 48, "2": 59, "3": 59, "4": 60, "5": 55, "6": 40, "7": 77, "8": 104, "9": 52, "0": 68 };
    const kMax = mmil.kCorrection(30);
    const differ: string[] = [];
    for (const s of mmil.scaleOrder) {
      const max = D.scales[s].yes.length + D.scales[s].no.length + (kMax[s] ?? 0);
      if (max !== psyMax[s]) differ.push(`${s}: ${max} ≠ ${psyMax[s]}`);
    }
    expect(differ).toEqual(["4: 59 ≠ 60", "7: 78 ≠ 77"]);
  });
});

describe("ММИЛ: подсказки снижают L, F, K и поднимают 2 и 7", () => {
  const CONTROL = ["L", "F", "K"], TARGET = ["2", "7"];
  const keys = questionKeys(mmil);
  const effect = (q: number, a: Answer) => {
    const ks = keys[q - 1].filter((k) => k.answer === a).map((k) => k.scale);
    return { bad: ks.filter((s) => CONTROL.includes(s)).length, good: ks.filter((s) => TARGET.includes(s)).length };
  };

  test("подсказка есть у каждого утверждения из шкал L, F, K, 2, 7 и только у них", () => {
    for (let q = 1; q <= N; q++) {
      const touches = keys[q - 1].some((k) => CONTROL.includes(k.scale) || TARGET.includes(k.scale));
      expect(q in MMIL_HINTS, `утверждение ${q}`).toBe(touches);
    }
  });

  test("подсказанный ответ не хуже другого: (2 и 7) − (L, F, K) не меньше, при равенстве — меньше L, F, K (кроме K_ON)", () => {
    for (const [qs, a] of Object.entries(MMIL_HINTS)) {
      const q = Number(qs);
      if (K_ON.includes(q)) continue;
      const other: Answer = a === "Y" ? "N" : "Y";
      const mine = effect(q, a), alt = effect(q, other);
      const netMine = mine.good - mine.bad, netAlt = alt.good - alt.bad;
      expect(netMine, `утверждение ${q}`).toBeGreaterThanOrEqual(netAlt);
      if (netMine === netAlt) expect(mine.bad, `утверждение ${q}`).toBeLessThanOrEqual(alt.bad);
    }
  });

  test("в K_ON выбран ответ в пользу K, и он не прибавляет к L, F и не отнимает у 2 и 7", () => {
    for (const q of K_ON) {
      const a = MMIL_HINTS[q];
      const other: Answer = a === "Y" ? "N" : "Y";
      const mine = keys[q - 1].filter((k) => k.answer === a).map((k) => k.scale);
      const alt = keys[q - 1].filter((k) => k.answer === other).map((k) => k.scale);
      expect(mine, `утверждение ${q}`).toContain("K");
      expect(mine.filter((s) => s === "L" || s === "F"), `утверждение ${q}`).toEqual([]);
      expect(alt.filter((s) => s === "2" || s === "7"), `утверждение ${q}`).toEqual([]);
    }
  });

  test("ответы по подсказкам: L и F на нуле, K = 11 (38 Т), 2 и 7 — почти максимум", () => {
    const answers: MaybeAnswer[] = new Array(N).fill(null);
    for (const [q, a] of Object.entries(MMIL_HINTS)) answers[Number(q) - 1] = a;
    const p = computeProfile(mmil, answers);
    expect([p.raw.L, p.raw.F, p.raw.K]).toEqual([0, 0, 11]);
    expect(p.t.K).toBe(38);
    // Все пункты 2 и 7, кроме спорных, где выбран ответ без L, F, K: у шкалы 2 это 50, 105, 163, 193
    // (43, 124, 223, 277 засчитаны через K_ON), у шкалы 7 — 261.
    expect(p.raw["2"]).toBe(D.scales["2"].yes.length + D.scales["2"].no.length - 4);
    expect(p.raw["7"]).toBe(D.scales["7"].yes.length + D.scales["7"].no.length - 1);
  });
});

describe("ММИЛ: нормы как в таблице «Расчеты» psytests (mmlM5-uPOTpl-dk6HXK, сверено 29.09.2026)", () => {
  test("M и SD всех 13 шкал", () => {
    const psy: Record<string, [number, number]> = {
      L: [3.944, 2.236], F: [5.756, 2.921], K: [15.744, 3.881], "1": [12.044, 3.283], "2": [20.252, 4.144],
      "3": [18.068, 4.438], "4": [21.232, 4.177], "5": [21.606, 3.913], "6": [9.24, 2.771], "7": [27.384, 4.791],
      "8": [26.704, 4.463], "9": [18.62, 4.005], "0": [26.766, 7.037]
    };
    expect(D.norms).toEqual(psy);
  });
});
