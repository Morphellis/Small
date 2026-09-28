/*
 * ММИЛ (Ф. Б. Березин, М. П. Мирошников, 377 утверждений), мужской вариант: как считать.
 * Подсчёт как у psytests.org: ключ Березина, поправка K долями с округлением половины вверх,
 * Т по формуле с мужскими нормами psytests и их округлением (дробь от 0,6 — вверх, как в СМИЛ).
 */
import { kCorrectionByFactors, tFormula, validityByLimits } from "../../kinds/questionnaire/engine";
import type { QuestionnaireDef } from "../../kinds/questionnaire/types";
import { MMIL_DATA as D } from "./data";
import { MMIL_HINTS } from "./hints";

/*
 * Достоверность по описанию шкал у psytests: 70–80 Т по L или F — повод усомниться в профиле,
 * больше 80 Т — результат недостоверен.
 */
const VALIDITY_LIMITS = { L: 80, F: 80 };
const VALIDITY_REASONS = {
  L: "много ответов, в которых человек выставляет себя лучше, чем бывает у людей на самом деле. Ответы выглядят неискренними",
  F: "много редких, нетипичных ответов, которые почти не дают обычные люди. Так бывает при невнимательных или случайных ответах, непонимании вопросов или намеренном преувеличении своих проблем"
};

export const mmil: QuestionnaireDef = {
  id: "mmil",
  title: "ММИЛ",
  storageKey: "mmil-trainer-v1",
  questions: D.questions,
  scaleOrder: D.scaleOrder,
  scaleInfo: D.scaleInfo,
  key: D.scales,
  kCorrected: Object.keys(D.kFactors),
  kCorrection: kCorrectionByFactors(D.kFactors),
  tScore: (scale, x) => {
    const [m, sd] = D.norms[scale];
    return { t: Math.floor(tFormula(x, m, sd) + 0.4 + 1e-9), extrapolated: false };
  },
  tDigits: 0,
  // Как полосы psytests.org для ММИЛ: [0–29] низкие, [30–70] средние, [71–120] высокие.
  thresholds: { high: 71, low: 29 },
  validity: validityByLimits(VALIDITY_LIMITS, VALIDITY_REASONS, "t"),
  validityRule: "По описанию шкал ММИЛ результат недостоверен, если L или F выше 80 Т (70–80 Т — повод усомниться).",
  allowDontKnow: false,
  ui: {
    // Упор на контрольные шкалы и на депрессию (2) и психастению (7): подсказки снижают первые и поднимают вторые.
    focus: ["L", "F", "K", "2", "7"],
    hints: MMIL_HINTS,
    keyHighlight: false,
    bars: { min: 0, max: 120 },
    band: [30, 70]
  }
};
