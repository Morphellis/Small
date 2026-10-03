/*
 * Ход теста Люшера: из каких шагов он состоит, что значит каждый выбор и что получается в итоге.
 * Без DOM — чтобы проверять тестами. Порядок шагов и смысл выборов повторяют psytests.org:
 *
 *   краткий (восьмицветовой): выбор 1 → пауза → выбор 2;
 *   полный: ахроматические цвета → выбор 1 → попарные сравнения в таблицах 3–7 → фигуры → выбор 2.
 *
 * Прохождение хранится как журнал выборов (Pick[]); всё остальное из него выводится. Поэтому «Назад» —
 * это просто отмена последней записи журнала.
 *
 * Общий для браузера и сервера: экран ведёт по шагам, сервер по журналу считает результат (server/luscher/).
 */

/**
 * Раскладка с наибольшей тревожностью. Проверено на psytests: тревожность 12 из 12 в обоих выборах,
 * совокупное отклонение 32 (наибольшее возможное: это аутогенная норма задом наперёд).
 * Её же показывает блок «Как поднять тревожность», поэтому она не секрет и живёт здесь, а не на сервере.
 */
export const MAX_ANXIETY_ORDER = "70615243";

export type Variant = "short" | "full";

/** Цвета карточек, как на psytests. */
export const COLOR: Record<number, { hex: string; name: string; dark?: boolean }> = {
  0: { hex: "#98938D", name: "серый" },
  1: { hex: "#004983", name: "синий" },
  2: { hex: "#1D9772", name: "зелёный" },
  3: { hex: "#F12F23", name: "красный" },
  4: { hex: "#F2DD00", name: "жёлтый", dark: true },
  5: { hex: "#D42481", name: "фиолетовый" },
  6: { hex: "#C55223", name: "коричневый" },
  7: { hex: "#231F20", name: "чёрный" },
  11: { hex: "#5F5D60", name: "тёмно-серый" },
  13: { hex: "#C7C0BA", name: "светло-серый", dark: true },
  14: { hex: "#FFFFFF", name: "белый", dark: true },
  42: { hex: "#2B7381", name: "сине-зелёный" },
  43: { hex: "#475D8F", name: "сине-фиолетовый" },
  44: { hex: "#55A9CE", name: "голубой", dark: true },
  51: { hex: "#5A773D", name: "оливковый" },
  53: { hex: "#41A85F", name: "изумрудный" },
  54: { hex: "#96CB59", name: "салатовый", dark: true },
  62: { hex: "#FA802A", name: "оранжевый", dark: true },
  64: { hex: "#B33E2C", name: "кирпичный" },
  71: { hex: "#E49348", name: "охристый", dark: true },
  72: { hex: "#BFD449", name: "лимонный", dark: true },
  73: { hex: "#FA953D", name: "абрикосовый", dark: true }
};

/** Ахроматический набор: номер карточки → цвет. Карточка 0 — серый восьмицветового ряда. */
export const ACHROMATIC: Record<number, number> = { 0: 0, 1: 11, 2: 7, 3: 13, 4: 14 };
/** Раскладка ахроматических карточек на экране (как у psytests: 3 0 4 / 2 1). */
export const ACHROMATIC_LAYOUT = [3, 0, 4, 2, 1];

/** Таблицы попарных сравнений 3–7: цвета карточек 1–4. */
export const PAIR_TABLES: { table: number; title: string; colors: [number, number, number, number] }[] = [
  { table: 3, title: "основные цвета", colors: [1, 2, 3, 4] },
  { table: 4, title: "оттенки синего", colors: [1, 42, 43, 44] },
  { table: 5, title: "оттенки зелёного", colors: [51, 2, 53, 54] },
  { table: 6, title: "оттенки красного", colors: [6, 62, 3, 64] },
  { table: 7, title: "оттенки жёлтого", colors: [71, 72, 73, 4] }
];
/** Шесть пар в том порядке, в каком их показывает psytests (номера карточек 1–4). */
export const PAIR_LINES: [number, number][] = [[1, 4], [2, 3], [1, 2], [3, 4], [1, 3], [2, 4]];

/** Фигуры 0–6 и их места в сетке 3 × 5 (как у psytests). */
export const FIGURE_GRID: (number | null)[][] = [
  [null, 4, null],
  [5, null, 3],
  [null, 0, null],
  [6, null, 2],
  [null, 1, null]
];

export type Step =
  | { id: string; kind: "achromatic" }
  | { id: string; kind: "rank"; n: 1 | 2 }
  | { id: string; kind: "pause" }
  | { id: string; kind: "pairs"; table: number; round: 1 | 2 }
  | { id: string; kind: "figures" };

/** Одна запись журнала: на каком шаге что выбрано (цвет, номер карточки или фигуры; у паузы — 0). */
export interface Pick {
  step: string;
  value: number;
}

/** Сколько выборов нужно сделать на шаге. */
export function need(step: Step): number {
  switch (step.kind) {
    case "achromatic": return 4;
    case "rank": return 7;
    case "pause": return 1;
    case "pairs": return 6;
    case "figures": return 4;
  }
}

/** Выборы по шагам. */
export function picksByStep(log: readonly Pick[]): Record<string, number[]> {
  const by: Record<string, number[]> = {};
  for (const p of log) (by[p.step] ??= []).push(p.value);
  return by;
}

/** Сколько побед у каждой карточки 1–4 в таблице (строка из четырёх цифр, как у psytests: "3120"). */
export function pairWins(chosen: readonly number[]): string {
  const w = [0, 0, 0, 0];
  for (const c of chosen) w[c - 1]++;
  return w.join("");
}

/** Порядок строгий, если у карточек разное число побед (3, 2, 1, 0). Иначе таблицу проходят второй раз. */
export const isStrict = (wins: string) => [...wins].sort().join("") === "0123";

/** Шаги теста с учётом уже сделанных выборов: повтор таблицы появляется, только если первый проход нестрогий. */
export function steps(variant: Variant, log: readonly Pick[]): Step[] {
  if (variant === "short") {
    return [{ id: "rank1", kind: "rank", n: 1 }, { id: "pause", kind: "pause" }, { id: "rank2", kind: "rank", n: 2 }];
  }
  const by = picksByStep(log);
  const list: Step[] = [{ id: "achromatic", kind: "achromatic" }, { id: "rank1", kind: "rank", n: 1 }];
  for (const t of PAIR_TABLES) {
    const first = `pairs${t.table}`;
    list.push({ id: first, kind: "pairs", table: t.table, round: 1 });
    const done = by[first];
    if (done && done.length === 6 && !isStrict(pairWins(done))) {
      list.push({ id: `pairs${t.table}b`, kind: "pairs", table: t.table, round: 2 });
    }
  }
  list.push({ id: "figures", kind: "figures" }, { id: "rank2", kind: "rank", n: 2 });
  return list;
}

/** Текущий шаг: первый незавершённый. null — тест пройден. */
export function currentStep(variant: Variant, log: readonly Pick[]): Step | null {
  const by = picksByStep(log);
  return steps(variant, log).find((s) => (by[s.id]?.length ?? 0) < need(s)) ?? null;
}

/** Идёт ли сейчас выбор неприятного (а не симпатичного). k — сколько выборов на шаге уже сделано. */
export function isDislikePhase(variant: Variant, step: Step, k: number): boolean {
  if (step.kind === "achromatic" || step.kind === "figures") return k >= 2;
  if (step.kind === "rank") return variant === "full" && k >= 5;
  return false;
}

/** Итоговый порядок восьмицветового выбора. В полном тесте 6-й выбор — самый неприятный (8-е место), 7-й — 7-е. */
export function rankOrder(variant: Variant, picks: readonly number[]): string | null {
  if (picks.length < 7) return null;
  const left = [0, 1, 2, 3, 4, 5, 6, 7].find((c) => !picks.includes(c))!;
  const order = variant === "full" ? [...picks.slice(0, 5), left, picks[6], picks[5]] : [...picks, left];
  return order.join("");
}

/** Итог ахроматического набора (номера карточек): два симпатичных, оставшаяся, два неприятных (самый — последним). */
export function achromaticOrder(picks: readonly number[]): number[] | null {
  if (picks.length < 4) return null;
  const left = [0, 1, 2, 3, 4].find((c) => !picks.includes(c))!;
  return [picks[0], picks[1], left, picks[3], picks[2]];
}

/**
 * Какой цвет выбрать, чтобы тревожность была наибольшей (раскладка MAX_ANXIETY_ORDER).
 * null — на этом шаге выбор на тревожность не влияет.
 */
export function hintFor(variant: Variant, step: Step, k: number): number | null {
  if (step.kind !== "rank") return null;
  const target = MAX_ANXIETY_ORDER;
  if (variant === "full" && k >= 5) return Number(target[k === 5 ? 7 : 6]);
  return Number(target[k]);
}

/** Раскладка восьми цветов, как у psytests: случайная, но без соседства 0–1, 0–7 и 1–7. */
export function shuffledColors(random: () => number = Math.random): number[] {
  for (;;) {
    const a = [0, 1, 2, 3, 4, 5, 6, 7];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    const s = a.join("");
    if (!/01|10|07|70|17|71/.test(s)) return a;
  }
}

/* ---------- ссылка на результат psytests ---------- */

/** Коды таблиц попарных сравнений (psytests, fullcolor-run.html): победы карточек 1–4 → две цифры. */
const PAIR_CODES: Record<string, string> = {
  "0123": "01", "0132": "02", "0213": "03", "0231": "04", "0312": "05", "0321": "06", "1023": "07", "1032": "10",
  "1203": "11", "1230": "12", "1302": "13", "1320": "14", "2013": "15", "2031": "16", "2103": "17", "2130": "20",
  "2301": "21", "2310": "22", "3012": "23", "3021": "24", "3102": "25", "3120": "26", "3201": "27", "3210": "30",
  "0033": "51", "0222": "52", "0303": "53", "0330": "54", "1113": "55", "1122": "56", "1131": "57", "1212": "60",
  "1221": "61", "1311": "62", "2022": "63", "2112": "64", "2121": "65", "2202": "66", "2211": "67", "2220": "70",
  "3003": "71", "3030": "72", "3111": "73", "3300": "74"
};

const B64 = "0123456789-_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Перевод восьмеричной строки в 64-ричную (как endec у psytests). */
export function octalTo64(s: string): string {
  let n = 0n;
  for (const ch of s) n = n * 8n + BigInt(Number(ch));
  let r = "";
  while (n > 0n) {
    r = B64[Number(n % 64n)] + r;
    n /= 64n;
  }
  return r || "0";
}

/** Ссылка на тот же результат на psytests.org — когда тест пройден целиком. */
export function psytestsUrl(variant: Variant, log: readonly Pick[]): string | null {
  if (currentStep(variant, log) !== null) return null;
  const by = picksByStep(log);
  let qa = "";
  if (variant === "short") {
    qa = by.rank1.join("") + by.rank2.join("");
  } else {
    qa = by.achromatic.join("") + by.rank1.join("");
    for (const s of steps(variant, log)) if (s.kind === "pairs") qa += PAIR_CODES[pairWins(by[s.id])];
    qa += by.figures.join("") + by.rank2.join("");
  }
  return `https://psytests.org/result?v=${variant === "short" ? "lctA" : "lctN"}${octalTo64("1" + qa)}`;
}
