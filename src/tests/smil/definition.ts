/*
 * СМИЛ (Л. Н. Собчик, 566 утверждений), мужской вариант: как считать. Всё выверено по прогонам psytests.org.
 */
import { kCorrectionByFactors, tFormula, validityByLimits } from "../../kinds/questionnaire/engine";
import type { QuestionnaireDef } from "../../kinds/questionnaire/types";
import { SMIL_DATA as D } from "./data";
import { SMIL_HINTS } from "./hints";

/*
 * Достоверность по Л. Н. Собчик: профиль не интерпретируют, если L или K выше 70 Т либо F выше 80 Т.
 * Сравниваются Т-баллы (у СМОЛ — сырые баллы, там шкалы короче).
 */
const VALIDITY_LIMITS = { L: 70, F: 80, K: 70 };
const VALIDITY_REASONS = {
  L: "много ответов, в которых человек выставляет себя лучше, чем бывает у людей на самом деле (никогда не сердится, не сплетничает, все знакомые нравятся). Ответы выглядят неискренними",
  F: "много редких, нетипичных ответов, которые почти не дают обычные люди. Так бывает при невнимательных или случайных ответах, непонимании вопросов или намеренном преувеличении своих проблем",
  K: "выраженная защитная установка: человек старается выглядеть благополучнее, чем есть, и скрывает трудности"
};

export const smil: QuestionnaireDef = {
  id: "smil",
  title: "СМИЛ",
  storageKey: "smil-trainer-v1",
  questions: D.questions,
  scaleOrder: D.scaleOrder,
  scaleInfo: D.scaleInfo,
  key: D.scales,
  kCorrected: Object.keys(D.kFactors),
  kCorrection: kCorrectionByFactors(D.kFactors, D.kCorrectionOverrides),
  /*
   * T = 50 + 10 · (X − M) / SD, мужские нормы. psytests.org округляет так, что дробь от 0,6 идёт вверх,
   * а до 0,6 — вниз (67,69 → 68, но 60,51 → 60 и 27,59 → 27): отсюда floor(T + 0,4).
   */
  tScore: (scale, x) => {
    const [m, sd] = D.norms[scale];
    return { t: Math.floor(tFormula(x, m, sd) + 0.4 + 1e-9), extrapolated: false };
  },
  tDigits: 0,
  // Как полосы psytests.org для СМИЛ: [0–29] низкие, [30–70] средние, [71–120] высокие.
  thresholds: { high: 71, low: 29 },
  validity: validityByLimits(VALIDITY_LIMITS, VALIDITY_REASONS, "t"),
  validityRule: "По правилам СМИЛ (Л. Н. Собчик) результат недостоверен, если L или K выше 70 Т либо F выше 80 Т.",
  controlItems: D.controlItems,
  ui: {
    focus: ["L", "F", "K", "1", "2", "7", "8"],
    hints: SMIL_HINTS,
    keyHighlight: false,
    bars: { min: 0, max: 120 },
    band: [30, 70]
  }
};
