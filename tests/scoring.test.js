const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../scoring.js");
const D = require("../data.js");

const ORDER = ["L", "F", "K", "1", "2", "3", "4", "6", "7", "8", "9"];
const fill = (fn) => Array.from({ length: 71 }, (_, i) => fn(i + 1));

function check(p, raw, corrected, t) {
  ORDER.forEach((s, i) => {
    assert.equal(p.raw[s], raw[i], `сырой ${s}`);
    assert.equal(p.corrected[s], corrected[i], `с поправкой ${s}`);
    assert.equal(p.t[s].toFixed(2), t[i].toFixed(2), `Т ${s}`);
  });
}

test("все «Верно», мужской", () => {
  const p = S.computeProfile(fill(() => "Y"), "male");
  check(p,
    [0, 12, 0, 9, 8, 9, 11, 10, 13, 18, 11],
    [0, 12, 0, 9, 8, 9, 11, 10, 13, 18, 11],
    [37.97, 88.7, 27.54, 55.87, 53.66, 47.49, 52.86, 84.31, 47.73, 65.27, 80.77]);
});

test("все «Неверно», женский", () => {
  const p = S.computeProfile(fill(() => "N"), "female");
  check(p,
    [5, 3, 16, 5, 11, 17, 8, 4, 3, 2, 1],
    [5, 3, 16, 13, 11, 17, 14, 4, 19, 18, 4],
    [79.33, 52.11, 81.36, 65.51, 60.13, 66.18, 72.32, 46.15, 69.91, 66.0, 37.7]);
});

test("все «Не знаю», мужской", () => {
  const p = S.computeProfile(fill(() => "?"), "male");
  check(p,
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [37.97, 36.52, 27.54, 25.87, 23.81, 16.56, 1.22, 26.84, -4.06, 1.66, 9.81]);
  assert.equal(p.dontKnow, 71);
});

test("нечётные «Верно», чётные «Неверно», женский", () => {
  const p = S.computeProfile(fill((n) => (n % 2 ? "Y" : "N")), "female");
  check(p,
    [1, 8, 5, 5, 9, 9, 8, 5, 9, 9, 5],
    [1, 8, 5, 8, 9, 9, 10, 5, 14, 14, 6],
    [45.71, 81.35, 39.7, 48.39, 53.47, 42.51, 51.26, 51.15, 47.89, 51.71, 48.17]);
});

test("поправка K = 9 даёт +5, +4, +9, +9, +2", () => {
  assert.deepEqual(S.kCorrection(9), { "1": 5, "4": 4, "7": 9, "8": 9, "9": 2 });
  assert.deepEqual(S.kCorrection(0), { "1": 0, "4": 0, "7": 0, "8": 0, "9": 0 });
});

test("таблица поправок совпадает с округлением k*K только там, где совпадает бланк", () => {
  // Контроль переключателя: при K = 1 бланк даёт +1 к шкале 4, формула round(0.4) = 0.
  assert.equal(S.kCorrection(1, "table")["4"], 1);
  assert.equal(S.kCorrection(1, "formula")["4"], 0);
});

test("пустые ответы не дают баллов, Т считаются и без ответов", () => {
  const p = S.computeProfile([], "male");
  ORDER.forEach((s) => assert.equal(p.raw[s], 0));
  assert.equal(p.t.L.toFixed(2), "37.97");
  assert.equal(p.answered, 0);
});

test("«Не знаю» не попадает ни в одну шкалу и увеличивает счётчик", () => {
  const a = new Array(71).fill(null);
  a[8] = "?"; // вопрос 9 входит в F, 1, 2, 3 по ответу «Да»
  const p = S.computeProfile(a, "male");
  ORDER.forEach((s) => assert.equal(p.raw[s], 0));
  assert.equal(p.dontKnow, 1);
});

test("смена пола меняет Т, но не сырые", () => {
  const a = fill((n) => (n % 3 ? "Y" : "N"));
  const m = S.computeProfile(a, "male");
  const f = S.computeProfile(a, "female");
  assert.deepEqual(m.raw, f.raw);
  assert.deepEqual(m.corrected, f.corrected);
  assert.notEqual(m.t.F, f.t.F);
});

test("ответ, меняющий K, подсвечивает и шкалы с поправкой", () => {
  const before = S.computeProfile([], "male");
  const a = new Array(71).fill(null);
  a[22] = "N"; // вопрос 23: K «Нет», 3 «Нет»
  const after = S.computeProfile(a, "male");
  assert.deepEqual(S.changedScales(before, after), ["K", "3", "1", "4", "7", "8"].sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y)));
});

test("ответ вне ключа ничего не меняет", () => {
  const before = S.computeProfile([], "female");
  const a = new Array(71).fill(null);
  a[19] = "Y"; // вопрос 20 не входит ни в одну шкалу
  assert.deepEqual(S.changedScales(before, S.computeProfile(a, "female")), []);
  assert.deepEqual(S.QUESTION_KEYS[19], []);
});

test("ключ вопроса 9: F, 1, 2, 3 — все по «Да»", () => {
  assert.deepEqual(S.QUESTION_KEYS[8], [
    { scale: "F", answer: "Y" }, { scale: "1", answer: "Y" }, { scale: "2", answer: "Y" }, { scale: "3", answer: "Y" }
  ]);
});

test("состояния регистрационного листа", () => {
  assert.equal(S.cellState([], null), "empty");
  assert.equal(S.cellState(["Y"], "Y"), "first");
  assert.equal(S.cellState(["Y", "N"], "N"), "changed");
  assert.equal(S.cellState(["Y", null, "Y"], "Y"), "first");
  assert.equal(S.cellState(["?"], "?"), "dk");
  assert.equal(S.cellState(["N", "?"], "?"), "dkAfter");
  assert.equal(S.cellState(["Y", null], null), "empty");
});

test("достоверность: L > 4 или F > 6 — недостоверно", () => {
  const allNo = S.computeProfile(fill(() => "N"), "female"); // L = 5, F = 3
  assert.equal(allNo.validity.valid, false);
  assert.deepEqual(allNo.validity.checks.filter((c) => c.exceeded).map((c) => c.scale), ["L"]);
  const allYes = S.computeProfile(fill(() => "Y"), "male"); // L = 0, F = 12
  assert.equal(allYes.validity.valid, false);
  assert.deepEqual(allYes.validity.checks.filter((c) => c.exceeded).map((c) => c.scale), ["F"]);
  assert.equal(S.validity({ L: 4, F: 6 }).valid, true); // ровно на границе — ещё достоверно
  assert.equal(S.validity({ L: 5, F: 7 }).checks.every((c) => c.exceeded && c.reason), true);
  assert.equal(S.computeProfile([], "male").validity.valid, true);
});

test("данные: 71 вопрос, вопрос 26 про мышцы, 27 про чувство вины", () => {
  assert.equal(D.questions.length, 71);
  assert.match(D.questions[25], /подергивания в мышцах/);
  assert.match(D.questions[26], /неправильное или нехорошее/);
});
