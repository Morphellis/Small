const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../smil-scoring.js");
const D = require("../smil-data.js");

const ORDER = ["L", "F", "K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const N = 566;
const fill = (a) => new Array(N).fill(a);
const only = (base, set) => { const a = fill(base); for (const [q, v] of Object.entries(set)) a[q - 1] = v; return a; };
const kNo = (k) => Object.fromEntries(D.scales.K.no.slice(0, k).map((q) => [q, "N"]));

// Прогоны psytests.org (мужской вариант, сентябрь 2026): «сырой/с поправкой K/Т» в порядке L F K 1 2 3 4 5 6 7 8 9 0.
const R3 = "YNYYNYYYY?YNY?NYYYNYNNNNYNNYYYYYNYNNYNNNNYNNYNYY?YYYNNNNYNYYYYYYNNYYNYYNNYNNYYNYNYNNNYYNN?NYYNYNYYY??NNYNNYYYYYNYNYNYNYNNNYNYYNYNYYYNNN?NNNN?NNYNY?NYNNNYNYYYNNYNYNYNNYNNYY??YNNNYYNYYYNNYYYNNNNNYNNNNY?NYY?Y?NYYYNNY?YYNNYNNNYN?NNNY?YYYYNYNYNNNYNYY?YNYNNNYNYYNNNYYYYNNNNNNNNNYYNY?YNNYYYYNNNYYY?N?YYYNNYYYNYY?YNYYYN?NYYNYNYYYYYNYNYYNYNYNY?NYY?NYNYNYNNYN?YYNY?NNYNYYNY?NNNYNYNNNNNNYNNYNNNNNYNNN?NNY?N?NNNYYYN?YNNYYNY?YNYNNYNNYNYYYNYY?YYYNNYYYNNNYYYNNNYYY?YNNYYYNNY??YNNYNNNNNYNNNNNNNYNYYNNYNNNNNYY?NNNY?Y?NNNYNNNYYNYNNNNYNNYNYNNN?NN?NYYYYYN?NYNYYYNYYYYNNNNNNYNY?Y?YYNYNNY";
const runs = [
  ["все «Верно»", fill("Y"), "0/0/35 45/45/196 1/1/29 11/12/52 20/20/58 12/12/42 24/25/65 28/28/65 25/25/100 38/39/82 59/60/126 35/35/94 34/34/59", 0, 0],
  ["все «Неверно»", fill("N"), "15/15/87 20/20/105 29/29/81 22/37/116 40/40/107 47/47/106 26/38/97 31/31/71 15/15/71 9/38/80 19/48/102 11/17/50 36/36/61", 0, 0],
  ["случайные ответы", [...R3], "9/9/66 29/29/138 19/19/63 13/23/80 27/27/75 25/25/66 22/30/77 34/34/77 15/15/71 20/39/82 34/53/112 21/25/70 29/29/54", 45, 4],
  ["145, 233 «Нет», 358 «Да»", only("?", { 145: "N", 233: "N", 358: "Y" }), "0/0/35 0/0/33 0/0/27 0/0/21 0/0/10 0/0/19 0/0/4 0/0/9 0/0/27 0/0/4 0/0/6 0/0/8 0/0/25", 563, 27],
  ["45, 238 «Нет»", only("?", { 45: "N", 238: "N" }), "1/1/39 0/0/33 0/0/27 0/0/21 2/2/14 0/0/19 0/0/4 0/0/9 0/0/27 0/0/4 0/0/6 0/0/8 0/0/25", 564, 27],
  ["K = 2", only("?", kNo(2)), "1/1/39 0/0/33 2/2/31 0/1/24 2/2/14 1/1/21 0/1/7 0/0/9 0/0/27 0/2/8 0/2/10 0/0/8 0/0/25", 564, 27],
  ["K = 3", only("?", kNo(3)), "1/1/39 0/0/33 3/3/33 0/2/27 2/2/14 2/2/23 0/2/9 0/0/9 0/0/27 0/3/10 0/3/12 0/1/10 0/0/25", 563, 27],
  ["K = 6", only("?", kNo(6)), "1/1/39 0/0/33 6/6/39 0/3/29 3/3/17 5/5/29 0/2/9 1/1/11 1/1/30 0/6/16 0/6/18 0/1/10 0/0/25", 560, 27]
];

for (const [name, answers, expected, dk, qc] of runs) {
  test("psytests: " + name, () => {
    const p = S.computeProfile(answers);
    expected.split(" ").forEach((cell, i) => {
      const s = ORDER[i];
      const [raw, corr, t] = cell.split("/").map(Number);
      assert.equal(p.raw[s], raw, "сырой " + s);
      assert.equal(p.corrected[s], corr, "с поправкой " + s);
      assert.equal(p.t[s], t, "Т " + s);
    });
    assert.equal(p.dontKnow, dk, "шкала ?");
    assert.equal(p.controlCorrect, qc, "контрольные пункты");
  });
}

test("psytests: пример результата (женщина) — сырые баллы всех шкал, кроме 5", () => {
  const ex = [..."NNNNNNNYYYNYN?YNYYYYYYNNYNNNNNYN?NNYYYNNYNYNYYN?NNYNNYYYYNYNYN?NN?NN?NNNYYYNYYYYNNYYNNYYNYNNYNYYNYYNYYYYYNYNNYYNYNYNYNYN?Y?YNYNYNNYY?NNNYNNYNNYNNYNNYY?YYYNNNYNYNNYYYYN?YYNNYNNYYYNNY?Y?YNYYNNNYYNYY?YY?NNYY?NYYNNNNNNYNYNYYYYNNYNNNYYYNNNYYYYNNYYYNNNNNNYNYYYYNYYNNYYYYY?NNNYNYNY?YYNNYYNYNYNNNNNNN?NNYNYNNNYNNNNNYYYYNNYNYNYYNNNYNNYNNNNNYN?NNYNNNYNNNNNYN??NNYNNNYYYNNNNNNNYNYNYYNNN?NNYNNNNNNNNYNNYNNYNNNNYYYYYNYYYNYNNYNNYNNNNNYNNYYNNYYYYNNY?YYNNYYNNYNNNNYYYYNNNNNNNYY?Y?NYNNNNNNN?YYNNYYYNYNNYYYYNNNNYYNYYYNYYYNYNYYNNNNNNNYNNYYYNNYYNYNYNNYYYNNNYYYN?YYYYYNYN?YNYNNYNYNYYYNYY"];
  const p = S.computeProfile(ex);
  const raw = { L: 4, F: 7, K: 19, "1": 9, "2": 16, "3": 29, "4": 20, "6": 11, "7": 12, "8": 14, "9": 18, "0": 14 };
  for (const [s, v] of Object.entries(raw)) assert.equal(p.raw[s], v, "сырой " + s);
  assert.deepEqual(p.kAdd, { "1": 10, "4": 8, "7": 19, "8": 19, "9": 4 });
  assert.equal(p.dontKnow, 29);
  assert.equal(p.controlCorrect, 27);
});

test("поправка K: округление, половина вверх, исключения таблицы при K = 1 и 3", () => {
  assert.deepEqual(S.kCorrection(0), { "1": 0, "4": 0, "7": 0, "8": 0, "9": 0 });
  assert.deepEqual(S.kCorrection(1), { "1": 1, "4": 1, "7": 1, "8": 1, "9": 0 });
  assert.deepEqual(S.kCorrection(2), { "1": 1, "4": 1, "7": 2, "8": 2, "9": 0 });
  assert.deepEqual(S.kCorrection(3), { "1": 2, "4": 2, "7": 3, "8": 3, "9": 1 });
  assert.deepEqual(S.kCorrection(9), { "1": 5, "4": 4, "7": 9, "8": 9, "9": 2 });
  assert.deepEqual(S.kCorrection(19), { "1": 10, "4": 8, "7": 19, "8": 19, "9": 4 });
  assert.deepEqual(S.kCorrection(29), { "1": 15, "4": 12, "7": 29, "8": 29, "9": 6 });
});

test("Т: дробь от 0,6 округляется вверх, до 0,6 — вниз", () => {
  assert.equal(S.tScore("1", 18).t, 68); // 67,69
  assert.equal(S.tScore("4", 23).t, 60); // 60,51
  assert.equal(S.tScore("K", 0).t, 27); // 27,59
  assert.equal(S.tScore("2", 0).t, 10); // 9,61
});

test("достоверность: L или K выше 70 Т, F выше 80 Т", () => {
  assert.equal(S.computeProfile([]).validity.valid, true); // L 35, F 33, K 27
  const bad = (answers) => S.computeProfile(answers).validity.checks.filter((c) => c.exceeded).map((c) => c.scale);
  assert.deepEqual(bad(fill("N")), ["L", "F", "K"]); // L 87, F 105, K 81
  assert.deepEqual(bad(fill("Y")), ["F"]); // F 196
  assert.equal(S.validity({ L: 70, F: 80, K: 70 }).valid, true); // ровно на границе — ещё достоверно
  assert.equal(S.validity({ L: 71, F: 81, K: 71 }).checks.every((c) => c.exceeded && c.reason), true);
});

test("данные: 566 утверждений, 27 контрольных, пункт 26 не входит в шкалу 5", () => {
  assert.equal(D.questions.length, N);
  assert.equal(D.controlItems.length, 27);
  for (const q of D.controlItems) assert.match(D.questions[q - 1], /обвести кружочком/);
  assert.ok(!D.scales["5"].yes.includes(26) && !D.scales["5"].no.includes(26));
  assert.match(D.questions[1], /аппетит/);
  assert.match(D.questions[565], /любовные эпизоды/);
});

test("ключ вопроса 20: F «Нет», 4 «Нет», 8 «Нет»", () => {
  assert.deepEqual(S.QUESTION_KEYS[19], [{ scale: "F", answer: "N" }, { scale: "4", answer: "N" }, { scale: "8", answer: "N" }]);
});
