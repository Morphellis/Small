import { describe, expect, test } from "vitest";
import {
  MAX_ANXIETY_ORDER, achromaticOrder, currentStep, hintFor, pairWins, psytestsUrl, rankOrder, shuffledColors, steps, type Pick, type Variant
} from "../src/kinds/luscher/flow";
import { anxiety, anxietyMarks, deviation, vegetativeText } from "../server/luscher/scoring";

/** Пройти тест, отвечая функцией answer(шаг, сколько уже выбрано на шаге). */
function run(variant: Variant, answer: (step: NonNullable<ReturnType<typeof currentStep>>, k: number) => number): Pick[] {
  const log: Pick[] = [];
  for (let guard = 0; guard < 200; guard++) {
    const s = currentStep(variant, log);
    if (!s) return log;
    const k = log.filter((p) => p.step === s.id).length;
    log.push({ step: s.id, value: answer(s, k) });
  }
  throw new Error("тест не закончился");
}

describe("Люшер: подсчёт как на psytests", () => {
  // Примеры с psytests: разметка выборов и количественные показатели.
  test("пример восьмицветового теста (lctA1NkesdIT)", () => {
    expect(anxiety("31605274")).toBe(5); // первый выбор
    expect(anxietyMarks("31605274")).toEqual([0, 0, 1, 0, 0, 1, 0, 3]);
    expect(anxiety("05124376")).toBe(4); // второй выбор — итоговый показатель
    expect(deviation("05124376")).toBe(22);
    expect(vegetativeText("05124376")).toBe("0.6");
  });

  test("пример полного теста (lctN1Q2gOD2f6ica0nZ7QBK): тревожность 6 по второму выбору", () => {
    expect(anxiety("73415062")).toBe(6);
  });

  test("раскладка ключа: тревожность 12, СО 32, ВК 0.3 (проверено на psytests)", () => {
    expect(MAX_ANXIETY_ORDER).toBe("70615243");
    expect(anxiety(MAX_ANXIETY_ORDER)).toBe(12);
    expect(deviation(MAX_ANXIETY_ORDER)).toBe(32);
    expect(vegetativeText(MAX_ANXIETY_ORDER)).toBe("0.3");
  });

  test("12 — наибольшая тревожность, 32 — наибольшее отклонение среди всех 40 320 раскладок", () => {
    let maxA = 0, maxD = 0;
    const perm = (rest: string, acc: string) => {
      if (!rest) {
        maxA = Math.max(maxA, anxiety(acc));
        maxD = Math.max(maxD, deviation(acc));
        return;
      }
      for (let i = 0; i < rest.length; i++) perm(rest.slice(0, i) + rest.slice(i + 1), acc + rest[i]);
    };
    perm("01234567", "");
    expect([maxA, maxD]).toEqual([12, 32]);
  });
});

describe("Люшер: ход теста", () => {
  test("в полном тесте 6-й выбор — последнее место, 7-й — предпоследнее, оставшийся — 6-е (пример psytests)", () => {
    expect(rankOrder("full", [5, 4, 3, 2, 1, 7, 0])).toBe("54321607");
    expect(rankOrder("full", [7, 3, 4, 1, 5, 2, 6])).toBe("73415062");
    expect(rankOrder("short", [3, 1, 6, 0, 5, 2, 7])).toBe("31605274");
  });

  test("ахроматические: два симпатичных, оставшийся, затем неприятные (пример psytests: 3 4 1 2 0)", () => {
    expect(achromaticOrder([3, 4, 0, 2])).toEqual([3, 4, 1, 2, 0]);
  });

  test("нестрогая таблица проходится второй раз, строгая — нет", () => {
    const log: Pick[] = [];
    const s0 = steps("full", log).map((s) => s.id);
    expect(s0).toEqual(["achromatic", "rank1", "pairs3", "pairs4", "pairs5", "pairs6", "pairs7", "figures", "rank2"]);
    // Таблица 5: победы 2, 2, 2, 0 — порядок нестрогий.
    const pairs5 = [1, 2, 1, 3, 3, 2].map((value) => ({ step: "pairs5", value }));
    expect(pairWins(pairs5.map((p) => p.value))).toBe("2220");
    expect(steps("full", pairs5).map((s) => s.id)).toContain("pairs5b");
    const strict = [1, 2, 1, 3, 1, 2].map((value) => ({ step: "pairs5", value }));
    expect(pairWins(strict.map((p) => p.value))).toBe("3210");
    expect(steps("full", strict).map((s) => s.id)).not.toContain("pairs5b");
  });

  test("ключ ведёт к раскладке 70615243 в обоих вариантах", () => {
    for (const v of ["short", "full"] as const) {
      const log = run(v, (s, k) => {
        const h = hintFor(v, s, k);
        if (h !== null) return h;
        if (s.kind === "pairs") return [1, 2, 1, 3, 1, 2][k];
        if (s.kind === "achromatic") return [3, 4, 0, 2][k];
        if (s.kind === "figures") return [3, 4, 5, 0][k];
        return 0;
      });
      const by = (id: string) => log.filter((p) => p.step === id).map((p) => p.value);
      expect(rankOrder(v, by("rank1")), v).toBe(MAX_ANXIETY_ORDER);
      expect(rankOrder(v, by("rank2")), v).toBe(MAX_ANXIETY_ORDER);
    }
  });

  test("ссылка на psytests совпадает с проверенными", () => {
    const short = run("short", (s, k) => hintFor("short", s, k) ?? 0);
    expect(psytestsUrl("short", short)).toBe("https://psytests.org/result?v=lctA1sleb6BI");

    // Полный тест: ахроматические, таблицы и фигуры — как в примере psytests (таблицы 5 и 7 повторены),
    // восьмицветовые выборы — по ключу.
    const full = run("full", (s, k) => {
      const h = hintFor("full", s, k);
      if (h !== null) return h;
      if (s.kind === "achromatic") return [3, 4, 0, 2][k];
      if (s.kind === "figures") return [3, 4, 5, 0][k];
      if (s.kind === "pairs") return chooseForWins(s.id, k);
      return 0;
    });
    expect(psytestsUrl("full", full)).toBe("https://psytests.org/result?v=lctN1Q2slfWf6ica0nZ76BQ");
  });

  test("случайная раскладка — без соседства 0–1, 0–7, 1–7", () => {
    for (let i = 0; i < 200; i++) {
      const s = shuffledColors().join("");
      expect(s).not.toMatch(/01|10|07|70|17|71/);
      expect([...s].sort().join("")).toBe("01234567");
    }
  });
});

/*
 * Выборы в парах, дающие победы из примера psytests. Пары идут так: (1,4) (2,3) (1,2) (3,4) (1,3) (2,4).
 */
const WINS: Record<string, string> = {
  pairs3: "3102", pairs4: "3210", pairs5: "2121", pairs5b: "2121", pairs6: "0231", pairs7: "1212", pairs7b: "0321"
};
const LINES: [number, number][] = [[1, 4], [2, 3], [1, 2], [3, 4], [1, 3], [2, 4]];

function chooseForWins(stepId: string, k: number): number {
  const target = WINS[stepId];
  // Перебираем исходы шести пар и берём первый с нужными победами.
  for (let mask = 0; mask < 64; mask++) {
    const picks = LINES.map(([a, b], i) => ((mask >> i) & 1 ? b : a));
    if (pairWins(picks) === target) return picks[k];
  }
  throw new Error("нет такого исхода: " + target);
}
