/*
 * Подсчёт шкал СМИЛ. Без обращения к DOM, чтобы логику можно было тестировать в Node.
 * API повторяет scoring.js (СМОЛ), чтобы интерфейс работал с любым из тестов одинаково.
 * Ответ на вопрос: "Y" (Верно), "N" (Неверно), "?" (Не знаю) или null (нет ответа).
 */
(function (root, factory) {
  const isNode = typeof module === "object" && module.exports;
  const api = factory(isNode ? require("./smil-data.js") : root.SMIL_DATA);
  if (isNode) module.exports = api;
  else root.SMIL_SCORING = api;
})(typeof self !== "undefined" ? self : this, function (D) {
  "use strict";

  const QUESTION_COUNT = D.questions.length;
  const ORDER = D.scaleOrder;
  const K_CORRECTED = Object.keys(D.kFactors);
  const K_FACTORS = D.kFactors;
  const T_DIGITS = 0;
  const CONTROL_ITEMS = D.controlItems;

  /*
   * Достоверность по Л. Н. Собчик: профиль не интерпретируют, если L или K выше 70 Т либо F выше 80 Т.
   * Сравниваются Т-баллы (у СМОЛ — сырые баллы, там шкалы короче).
   */
  const VALIDITY_LIMITS = { L: 70, F: 80, K: 70 }; // недостоверно, если Т больше
  const VALIDITY_RULE = "По правилам СМИЛ (Л. Н. Собчик) результат недостоверен, если L или K выше 70 Т либо F выше 80 Т.";
  const VALIDITY_REASONS = {
    L: "много ответов, в которых человек выставляет себя лучше, чем бывает у людей на самом деле (никогда не сердится, не сплетничает, все знакомые нравятся). Ответы выглядят неискренними",
    F: "много редких, нетипичных ответов, которые почти не дают обычные люди. Так бывает при невнимательных или случайных ответах, непонимании вопросов или намеренном преувеличении своих проблем",
    K: "выраженная защитная установка: человек старается выглядеть благополучнее, чем есть, и скрывает трудности"
  };

  // Границы интерпретации, как у полос psytests.org для СМИЛ: [0–29] низкие, [30–70] средние, [71–120] высокие.
  const THRESHOLDS = { high: 71, low: 29 };

  // Для каждого вопроса: в какие шкалы и каким ответом он засчитывается.
  const QUESTION_KEYS = Array.from({ length: QUESTION_COUNT }, () => []);
  for (const scale of ORDER) {
    for (const dir of ["yes", "no"]) {
      for (const n of D.scales[scale][dir]) {
        QUESTION_KEYS[n - 1].push({ scale, answer: dir === "yes" ? "Y" : "N" });
      }
    }
  }
  for (const list of QUESTION_KEYS) list.sort((a, b) => ORDER.indexOf(a.scale) - ORDER.indexOf(b.scale));

  function normalizeAnswers(answers) {
    const out = new Array(QUESTION_COUNT).fill(null);
    if (!answers) return out;
    for (let i = 0; i < QUESTION_COUNT; i++) {
      const a = answers[i];
      out[i] = a === "Y" || a === "N" || a === "?" ? a : null;
    }
    return out;
  }

  function rawScores(answers) {
    const a = normalizeAnswers(answers);
    const raw = {};
    for (const scale of ORDER) {
      let n = 0;
      for (const q of D.scales[scale].yes) if (a[q - 1] === "Y") n++;
      for (const q of D.scales[scale].no) if (a[q - 1] === "N") n++;
      raw[scale] = n;
    }
    let dontKnow = 0;
    let answered = 0;
    for (const v of a) {
      if (v === "?") dontKnow++;
      if (v !== null) answered++;
    }
    const controlCorrect = CONTROL_ITEMS.filter((q) => a[q - 1] === "?").length;
    return { raw, dontKnow, answered, controlCorrect };
  }

  // Сколько прибавить к шкалам 1, 4, 7, 8, 9 при сыром K = k.
  function kCorrection(k) {
    const over = D.kCorrectionOverrides[String(k)] || {};
    const add = {};
    for (const s of K_CORRECTED) add[s] = s in over ? over[s] : Math.floor(K_FACTORS[s] * k + 0.5 + 1e-9);
    return add;
  }

  /*
   * T = 50 + 10 * (X - M) / SD, мужские нормы. psytests.org округляет так, что дробь от 0,6 идёт вверх,
   * а до 0,6 — вниз (67,69 → 68, но 60,51 → 60 и 27,59 → 27): отсюда floor(T + 0,4).
   */
  function tScore(scale, x) {
    const [m, sd] = D.norms[scale];
    return { t: Math.floor(50 + (10 * (x - m)) / sd + 0.4 + 1e-9), extrapolated: false };
  }

  function levelOf(t) {
    if (t >= THRESHOLDS.high) return "high";
    if (t <= THRESHOLDS.low) return "low";
    return "norm";
  }

  // Полный расчёт профиля (нормы мужские): сырые, с поправкой K и Т-баллы по всем шкалам.
  function computeProfile(answers) {
    const { raw, dontKnow, answered, controlCorrect } = rawScores(answers);
    const add = kCorrection(raw.K);
    const corrected = {};
    const t = {};
    const extrapolated = {};
    const level = {};
    for (const s of ORDER) {
      corrected[s] = raw[s] + (add[s] || 0);
      const r = tScore(s, corrected[s]);
      t[s] = r.t;
      extrapolated[s] = r.extrapolated;
      level[s] = levelOf(t[s]);
    }
    return {
      method: "formula", raw, kAdd: add, corrected, t, extrapolated, level, dontKnow, answered,
      controlCorrect, controlTotal: CONTROL_ITEMS.length, validity: validity(t)
    };
  }

  // Достоверность по Т-баллам L, F, K: { valid, checks: [{ scale, value, unit, limit, exceeded, reason }] }.
  function validity(t) {
    const checks = Object.keys(VALIDITY_LIMITS).map((scale) => {
      const exceeded = t[scale] > VALIDITY_LIMITS[scale];
      return { scale, value: t[scale], unit: "Т", limit: VALIDITY_LIMITS[scale], exceeded, reason: exceeded ? VALIDITY_REASONS[scale] : null };
    });
    return { valid: checks.every((c) => !c.exceeded), checks };
  }

  // Какие шкалы изменились между двумя расчётами (сырой, с поправкой или Т-балл).
  function changedScales(before, after) {
    return ORDER.filter((s) => before.raw[s] !== after.raw[s] || before.corrected[s] !== after.corrected[s] || before.t[s] !== after.t[s]);
  }

  // Состояние клетки регистрационного листа — как в СМОЛ.
  function cellState(history, current) {
    const given = (history || []).filter((v) => v !== null);
    if (current === null || current === undefined) return "empty";
    if (current === "?") return given.some((v) => v === "Y" || v === "N") ? "dkAfter" : "dk";
    return given.some((v) => v !== current) ? "changed" : "first";
  }

  return {
    QUESTION_COUNT,
    ORDER,
    K_CORRECTED,
    K_FACTORS,
    VALIDITY_LIMITS,
    VALIDITY_RULE,
    THRESHOLDS,
    T_DIGITS,
    CONTROL_ITEMS,
    QUESTION_KEYS,
    normalizeAnswers,
    rawScores,
    kCorrection,
    tScore,
    levelOf,
    computeProfile,
    validity,
    changedScales,
    cellState
  };
});
