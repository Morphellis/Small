/*
 * ММИЛ (Ф. Б. Березин, М. П. Мирошников, 377 утверждений), мужской вариант: как считать.
 * Подсчёт как у psytests.org: ключ Березина, поправка K долями с округлением половины вверх,
 * Т по формуле с мужскими нормами psytests и их округлением (дробь от 0,6 — вверх, как в СМИЛ).
 */
import { mmil as SPEC } from "../../../src/tests/mmil/spec";
import { kCorrectionByFactors, tFormula, validityByLimits } from "../../questionnaire/engine";
import type { QuestionnaireDef } from "../../questionnaire/types";
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
  ...SPEC,
  key: D.scales,
  kCorrection: kCorrectionByFactors(D.kFactors),
  tScore: (scale, x) => {
    const [m, sd] = D.norms[scale];
    return { t: Math.floor(tFormula(x, m, sd) + 0.4 + 1e-9), extrapolated: false };
  },
  validity: validityByLimits(VALIDITY_LIMITS, VALIDITY_REASONS, "t"),
  hints: MMIL_HINTS
};
