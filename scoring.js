/*
 * Подсчёт шкал СМОЛ. Без обращения к DOM, чтобы логику можно было тестировать в Node.
 * Ответ на вопрос: "Y" (Да/верно), "N" (Нет/неверно), "?" (Не знаю) или null (нет ответа).
 */
(function (root, factory) {
  const isNode = typeof module === "object" && module.exports;
  const api = factory(isNode ? require("./data.js") : root.SMOL_DATA);
  if (isNode) module.exports = api;
  else root.SMOL_SCORING = api;
})(typeof self !== "undefined" ? self : this, function (D) {
  "use strict";

  const QUESTION_COUNT = D.questions.length;
  const ORDER = D.scaleOrder;
  const K_CORRECTED = ["1", "4", "7", "8", "9"];

  // Откуда брать поправку на K: "table" — таблица бланка (раздел 6.2), "formula" — round(k * K).
  const K_CORRECTION_MODE = "table";
  const K_FACTORS = { "1": 0.5, "4": 0.4, "7": 1, "8": 1, "9": 0.2 };

  /*
   * Критерий достоверности СМОЛ (методика для обследования персонала, therapy.irkutsk.ru/doc/smol.pdf):
   * «При значениях оценки по шкале L выше 4 или по шкале F выше 6 — данные считаются недостоверными.
   * В этих случаях проводится повторное обследование». Сравниваются сырые баллы.
   * Правила СМИЛ (L ≥ 70 Т, F > 80 Т, |F − K| > 11) к СМОЛ не относятся: там другие по длине шкалы.
   */
  const VALIDITY_LIMITS = { L: 4, F: 6 }; // недостоверно, если сырой балл больше
  const VALIDITY_REASONS = {
    L: "много ответов, в которых человек выставляет себя лучше, чем бывает у людей на самом деле (никогда не сердится, не сплетничает, все знакомые нравятся). Ответы выглядят неискренними",
    F: "много редких, нетипичных ответов, которые почти не дают обычные люди. Так бывает при невнимательных или случайных ответах, непонимании вопросов или намеренном преувеличении своих проблем"
  };

  // Границы интерпретации: Т ≥ high — высокие значения, Т ≤ low — низкие.
  const THRESHOLDS = { high: 71, low: 39 };

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
    return { raw, dontKnow, answered };
  }

  function kCorrection(k, mode) {
    const m = mode || K_CORRECTION_MODE;
    const add = {};
    for (const s of K_CORRECTED) {
      if (m === "formula") add[s] = Math.round(K_FACTORS[s] * k);
      else add[s] = (D.kCorrection[String(k)] || D.kCorrection["0"])[s];
    }
    return add;
  }

  // T = 50 + 10 * (X - M) / SD, M и SD из норм для выбранного пола.
  function tScore(scale, x, sex) {
    const i = D.norms.order.indexOf(scale);
    const n = D.norms[sex];
    return 50 + (10 * (x - n.M[i])) / n.SD[i];
  }

  function levelOf(t) {
    if (t >= THRESHOLDS.high) return "high";
    if (t <= THRESHOLDS.low) return "low";
    return "norm";
  }

  /*
   * Полный расчёт профиля. sex: "male" | "female" | null (без пола Т-баллы не считаются).
   * Возвращает сырые, с поправкой K и Т-баллы по всем шкалам.
   */
  function computeProfile(answers, sex) {
    const { raw, dontKnow, answered } = rawScores(answers);
    const add = kCorrection(raw.K);
    const corrected = {};
    const t = {};
    const level = {};
    for (const s of ORDER) {
      corrected[s] = raw[s] + (add[s] || 0);
      if (sex === "male" || sex === "female") {
        t[s] = tScore(s, corrected[s], sex);
        level[s] = levelOf(t[s]);
      } else {
        t[s] = null;
        level[s] = null;
      }
    }
    return { sex: sex || null, raw, kAdd: add, corrected, t, level, dontKnow, answered, validity: validity(raw) };
  }

  // Достоверность по сырым L и F: { valid, checks: [{ scale, raw, limit, exceeded, reason }] }.
  function validity(raw) {
    const checks = Object.keys(VALIDITY_LIMITS).map((scale) => {
      const exceeded = raw[scale] > VALIDITY_LIMITS[scale];
      return { scale, raw: raw[scale], limit: VALIDITY_LIMITS[scale], exceeded, reason: exceeded ? VALIDITY_REASONS[scale] : null };
    });
    return { valid: checks.every((c) => !c.exceeded), checks };
  }

  // Какие шкалы изменились между двумя расчётами (сырой, с поправкой или Т-балл).
  function changedScales(before, after) {
    const out = [];
    for (const s of ORDER) {
      const tb = before.t[s];
      const ta = after.t[s];
      const tChanged = tb === null || ta === null ? tb !== ta : Math.abs(tb - ta) > 1e-9;
      if (before.raw[s] !== after.raw[s] || before.corrected[s] !== after.corrected[s] || tChanged) out.push(s);
    }
    return out;
  }

  /*
   * Состояние клетки регистрационного листа по истории кликов (history — значения после каждого клика).
   * empty — нет ответа; first — Да/Нет с первого раза; changed — ответ менялся;
   * dk — «Не знаю»; dkAfter — сначала Да/Нет, затем «Не знаю».
   */
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
    K_CORRECTION_MODE,
    K_FACTORS,
    VALIDITY_LIMITS,
    THRESHOLDS,
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
