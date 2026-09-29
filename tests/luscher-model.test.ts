/*
 * Люшер: эталон подсчёта по всем 40 320 раскладкам (снят до рефакторинга) и модель прохождения.
 */
import { describe, expect, test } from "vitest";
import { hintFor, type Pick } from "../src/kinds/luscher/flow";
import { derive, layoutFor, loadSaved, replayValid, toSaved, emptySession } from "../src/kinds/luscher/model";
import { anxiety, anxietyMarks, deviation, vegetativeText } from "../src/kinds/luscher/scoring";

describe("эталон подсчёта по всем раскладкам", () => {
  test("распределение тревожности, отклонение, знаки «!» и ВК не изменились", () => {
    const hist: Record<number, number> = {};
    const vk: Record<string, number> = {};
    let dev = 0, marks = 0, n = 0;
    const perm = (rest: string, acc: string) => {
      if (!rest) {
        n++;
        hist[anxiety(acc)] = (hist[anxiety(acc)] ?? 0) + 1;
        dev += deviation(acc);
        vk[vegetativeText(acc)] = (vk[vegetativeText(acc)] ?? 0) + 1;
        marks += anxietyMarks(acc).reduce((s, m, i) => s + m * (i + 1), 0);
        return;
      }
      for (let i = 0; i < rest.length; i++) perm(rest.slice(0, i) + rest.slice(i + 1), acc + rest[i]);
    };
    perm("01234567", "");
    expect(n).toBe(40320);
    expect(hist).toEqual({ 0: 1584, 1: 1872, 2: 3024, 3: 4608, 4: 5184, 5: 5328, 6: 5760, 7: 4320, 8: 3744, 9: 2448, 10: 1440, 11: 720, 12: 288 });
    expect(dev).toBe(846720);
    expect(marks).toBe(1038240);
    expect(vk).toEqual({
      "0.2": 1056, "0.3": 1824, "0.4": 2112, "0.5": 2784, "0.6": 3168, "0.7": 2976, "0.8": 2880, "0.9": 1248, "1.0": 4512,
      "1.1": 2400, "1.2": 2112, "1.3": 1536, "1.4": 1152, "1.5": 1632, "1.6": 1152, "1.7": 672, "1.8": 1344, "2.0": 768,
      "2.1": 576, "2.2": 576, "2.3": 288, "2.4": 288, "2.5": 384, "2.6": 480, "2.7": 192, "2.8": 192, "3.0": 576, "3.2": 192,
      "3.3": 192, "3.5": 96, "3.6": 288, "3.7": 96, "4.0": 192, "4.3": 192, "4.6": 96, "5.0": 96
    });
  });
});

describe("модель прохождения", () => {
  const byKey = (variant: "short" | "full") => {
    const log: Pick[] = [];
    for (let guard = 0; guard < 100; guard++) {
      const d = derive(variant, log);
      if (!d.step) break;
      const h = hintFor(variant, d.step, d.k);
      const v = h ?? (d.step.kind === "pairs" ? [1, 2, 1, 3, 1, 2][d.k] : d.step.kind === "achromatic" ? [3, 4, 0, 2][d.k] : d.step.kind === "figures" ? [0, 1, 2, 3][d.k] : 0);
      log.push({ step: d.step.id, value: v });
    }
    return log;
  };

  test("итог — по второму выбору, пока его нет — по первому", () => {
    const log = byKey("short");
    expect(derive("short", log.slice(0, 7)).main).toEqual({ order: "70615243", n: 1 });
    expect(derive("short", log).main).toEqual({ order: "70615243", n: 2 });
    expect(derive("short", log).step).toBe(null);
    expect(derive("full", byKey("full")).main).toEqual({ order: "70615243", n: 2 });
  });

  test("номер шага и число выборов на шаге", () => {
    const d = derive("full", [{ step: "achromatic", value: 3 }]);
    expect([d.stepNo, d.steps.length, d.step?.id, d.k]).toEqual([1, 9, "achromatic", 1]);
  });

  test("загрузка отбрасывает журнал, который не ложится на шаги, и неверные раскладки", () => {
    const log = byKey("short");
    const bad = [...log.slice(0, 3), { step: "rank2", value: 1 }, ...log.slice(3)];
    expect(replayValid("short", bad)).toEqual(log.slice(0, 3));
    const s = loadSaved("short", {
      log: [...log.slice(0, 2), { step: 5 }, "мусор"],
      layouts: { rank1: [0, 1, 2, 3, 4, 5, 6, 7], rank2: [1, 1, 1, 1, 1, 1, 1, 1], x: "нет" },
      keyMode: true
    });
    expect(s.log).toEqual(log.slice(0, 2));
    expect(s.layouts).toEqual({ rank1: [0, 1, 2, 3, 4, 5, 6, 7] });
    expect(s.keyMode).toBe(true);
    expect(loadSaved("full", null)).toEqual(emptySession());
  });

  test("раскладка карточек запоминается и переживает сохранение", () => {
    const s = emptySession();
    const step = derive("short", []).step!;
    const first = layoutFor(s, step);
    expect(layoutFor(s, step)).toBe(first);
    expect(loadSaved("short", JSON.parse(JSON.stringify(toSaved(s)))).layouts.rank1).toEqual(first);
  });
});
