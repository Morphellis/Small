/*
 * СМОЛ (Мини-Мульт, 71 вопрос): как считать.
 *
 * По умолчанию — как psytests.org: их ключ, поправка K по таблице бланка с их исключением,
 * Т по мужскому профильному листу Козюли. Варианты (ключ из ТЗ, Т по формуле, поправка round(k·K))
 * оставлены для сверки и проверяются тестами: createSmol({ key: "classic", tMethod: "formula" }).
 */
import { tFormula, validityByLimits } from "../../kinds/questionnaire/engine";
import type { QuestionnaireDef, TScore } from "../../kinds/questionnaire/types";
import { SMOL_DATA as D } from "./data";
import { SMOL_HINTS } from "./hints";

export interface SmolOptions {
  /** "psytests" — ключ, восстановленный по результатам psytests.org; "classic" — ключ из ТЗ. */
  key?: "psytests" | "classic";
  /** "sheet" — профильный лист (целые Т, как psytests); "formula" — T = 50 + 10·(X − M)/SD. */
  tMethod?: "sheet" | "formula";
  /** "table" — таблица поправок бланка; "formula" — round(k·K). */
  kMode?: "table" | "formula";
}

const K_FACTORS = { "1": 0.5, "4": 0.4, "7": 1, "8": 1, "9": 0.2 };

/*
 * Критерий достоверности СМОЛ (методика для обследования персонала, therapy.irkutsk.ru/doc/smol.pdf):
 * «При значениях оценки по шкале L выше 4 или по шкале F выше 6 — данные считаются недостоверными.
 * В этих случаях проводится повторное обследование». Сравниваются сырые баллы.
 * Правила СМИЛ (L ≥ 70 Т, F > 80 Т, |F − K| > 11) к СМОЛ не относятся: там другие по длине шкалы.
 */
const VALIDITY_LIMITS = { L: 4, F: 6 };
const VALIDITY_REASONS = {
  L: "много ответов, в которых человек выставляет себя лучше, чем бывает у людей на самом деле (никогда не сердится, не сплетничает, все знакомые нравятся). Ответы выглядят неискренними",
  F: "много редких, нетипичных ответов, которые почти не дают обычные люди. Так бывает при невнимательных или случайных ответах, непонимании вопросов или намеренном преувеличении своих проблем"
};

/** Поправка K: по таблице бланка (у psytests при K = 5 к шкале 1 прибавляется 2, а не 3) или round(k·K). */
export function smolKCorrection(k: number, opts: SmolOptions = {}): Record<string, number> {
  const psy = (opts.key ?? "psytests") === "psytests" ? D.kCorrectionPsytests[String(k)] || {} : {};
  const table = D.kCorrection[String(k)] || D.kCorrection["0"];
  const add: Record<string, number> = {};
  for (const s of Object.keys(K_FACTORS) as (keyof typeof K_FACTORS)[]) {
    if (opts.kMode === "formula") add[s] = Math.round(K_FACTORS[s] * k);
    else add[s] = s in psy ? psy[s] : table[s];
  }
  return add;
}

function tByFormula(scale: string, x: number): TScore {
  const i = D.norms.order.indexOf(scale);
  return { t: tFormula(x, D.norms.M[i], D.norms.SD[i]), extrapolated: false };
}

/** По профильному листу: значение из таблицы, за краем листа — продление по прямой (метод наименьших квадратов). */
function tBySheet(scale: string, x: number): TScore {
  const table = D.profileSheet[scale];
  const last = table.from + table.t.length - 1;
  if (x >= table.from && x <= last) return { t: table.t[x - table.from], extrapolated: false };
  const n = table.t.length;
  const xs = table.t.map((_, i) => table.from + i);
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = table.t.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (table.t[i] - my);
    den += (xs[i] - mx) * (xs[i] - mx);
  }
  const edge = x < table.from ? table.from : last;
  return { t: table.t[edge - table.from] + (num / den) * (x - edge), extrapolated: true };
}

export function createSmol(opts: SmolOptions = {}): QuestionnaireDef {
  const tMethod = opts.tMethod ?? "sheet";
  return {
    id: "smol",
    title: "СМОЛ",
    storageKey: "smol-trainer-v1",
    questions: D.questions,
    scaleOrder: D.scaleOrder,
    scaleInfo: D.scaleInfo,
    key: (opts.key ?? "psytests") === "classic" ? D.scalesClassic : D.scales,
    kCorrected: Object.keys(K_FACTORS),
    kCorrection: (k) => smolKCorrection(k, opts),
    tScore: tMethod === "formula" ? tByFormula : tBySheet,
    tDigits: tMethod === "sheet" ? 0 : 2,
    // Как на psytests.org: [10–39] низкие, [40–69] средние, [70–110] высокие.
    thresholds: { high: 70, low: 39 },
    validity: validityByLimits(VALIDITY_LIMITS, VALIDITY_REASONS, "raw"),
    validityRule: "По правилам СМОЛ результат недостоверен, если сырой балл L больше 4 или F больше 6.",
    ui: {
      focus: ["L", "F", "K", "1", "2", "7", "8"],
      hints: SMOL_HINTS,
      keyHighlight: true,
      bars: { min: 10, max: 110 },
      band: [40, 70]
    }
  };
}

/** СМОЛ так, как он работает на сайте. */
export const smol = createSmol();

