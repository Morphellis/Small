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
  const THRESHOLDS = { high: 70, low: 39 }; // как на psytests.org: [10–39] низкие, [40–69] средние, [70–110] высокие

  // Перевод в Т: "sheet" — профильные листы, как на psytests.org (целые Т); "formula" — T = 50 + 10·(X − M)/SD.
  const T_METHOD = "sheet";

  // Ключ: "psytests" — как считает psytests.org (восстановлен по их результатам), "classic" — ключ из ТЗ.
  const KEY_VARIANT = "psytests";
  const keyOf = (variant) => ((variant || KEY_VARIANT) === "classic" ? D.scalesClassic : D.scales);
  const T_DIGITS = T_METHOD === "sheet" ? 0 : 2;

  // Для каждого вопроса: в какие шкалы и каким ответом он засчитывается.
  const QUESTION_KEYS = Array.from({ length: QUESTION_COUNT }, () => []);
  for (const scale of ORDER) {
    for (const dir of ["yes", "no"]) {
      for (const n of keyOf()[scale][dir]) {
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

  function rawScores(answers, keyVariant) {
    const key = keyOf(keyVariant);
    const a = normalizeAnswers(answers);
    const raw = {};
    for (const scale of ORDER) {
      let n = 0;
      for (const q of key[scale].yes) if (a[q - 1] === "Y") n++;
      for (const q of key[scale].no) if (a[q - 1] === "N") n++;
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

  function kCorrection(k, mode, keyVariant) {
    const m = mode || K_CORRECTION_MODE;
    const psy = (keyVariant || KEY_VARIANT) === "psytests" ? D.kCorrectionPsytests[String(k)] || {} : {};
    const add = {};
    for (const s of K_CORRECTED) {
      if (m === "formula") add[s] = Math.round(K_FACTORS[s] * k);
      else add[s] = s in psy ? psy[s] : (D.kCorrection[String(k)] || D.kCorrection["0"])[s];
    }
    return add;
  }

  // T = 50 + 10 * (X - M) / SD, M и SD из норм для выбранного пола.
  function tScoreFormula(scale, x, sex) {
    const i = D.norms.order.indexOf(scale);
    const n = D.norms[sex];
    return 50 + (10 * (x - n.M[i])) / n.SD[i];
  }

  // По профильному листу: значение из таблицы, за краем листа — продление по прямой.
  function tScoreSheet(scale, x, sex) {
    const table = D.profileSheets[sex][scale];
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

  function tScore(scale, x, sex, method) {
    if ((method || T_METHOD) === "formula") return { t: tScoreFormula(scale, x, sex), extrapolated: false };
    return tScoreSheet(scale, x, sex);
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
  function computeProfile(answers, sex, method, keyVariant) {
    const m = method || T_METHOD;
    const extrapolated = {};
    const { raw, dontKnow, answered } = rawScores(answers, keyVariant);
    const add = kCorrection(raw.K, null, keyVariant);
    const corrected = {};
    const t = {};
    const level = {};
    for (const s of ORDER) {
      corrected[s] = raw[s] + (add[s] || 0);
      if (sex === "male" || sex === "female") {
        const r = tScore(s, corrected[s], sex, m);
        t[s] = r.t;
        extrapolated[s] = r.extrapolated;
        level[s] = levelOf(t[s]);
      } else {
        t[s] = null;
        extrapolated[s] = false;
        level[s] = null;
      }
    }
    return { sex: sex || null, method: m, raw, kAdd: add, corrected, t, extrapolated, level, dontKnow, answered, validity: validity(raw) };
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
    T_METHOD,
    T_DIGITS,
    KEY_VARIANT,
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
