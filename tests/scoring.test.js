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
  const p = S.computeProfile(fill(() => "Y"), "formula", "classic");
  check(p,
    [0, 12, 0, 9, 8, 9, 11, 10, 13, 18, 11],
    [0, 12, 0, 9, 8, 9, 11, 10, 13, 18, 11],
    [37.97, 88.7, 27.54, 55.87, 53.66, 47.49, 52.86, 84.31, 47.73, 65.27, 80.77]);
});

test("все «Не знаю», мужской", () => {
  const p = S.computeProfile(fill(() => "?"), "formula", "classic");
  check(p,
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [37.97, 36.52, 27.54, 25.87, 23.81, 16.56, 1.22, 26.84, -4.06, 1.66, 9.81]);
  assert.equal(p.dontKnow, 71);
});

test("поправка K = 9 даёт +5, +4, +9, +9, +2", () => {
  assert.deepEqual(S.kCorrection(9), { "1": 5, "4": 4, "7": 9, "8": 9, "9": 2 });
  // у psytests при K = 5 к шкале 1 прибавляется 2, по бланку — 3
  assert.equal(S.kCorrection(5)["1"], 2);
  assert.equal(S.kCorrection(5, "table", "classic")["1"], 3);
  assert.deepEqual(S.kCorrection(0), { "1": 0, "4": 0, "7": 0, "8": 0, "9": 0 });
});

test("таблица поправок совпадает с округлением k*K только там, где совпадает бланк", () => {
  // Контроль переключателя: при K = 1 бланк даёт +1 к шкале 4, формула round(0.4) = 0.
  assert.equal(S.kCorrection(1, "table")["4"], 1);
  assert.equal(S.kCorrection(1, "formula", "classic")["4"], 0);
});

test("пустые ответы не дают баллов, Т считаются и без ответов", () => {
  const p = S.computeProfile([]);
  ORDER.forEach((s) => assert.equal(p.raw[s], 0));
  assert.equal(Math.round(p.t.L), 40); // лист, мужской: L = 0 → 39.5
  assert.equal(p.answered, 0);
});

test("«Не знаю» не попадает ни в одну шкалу и увеличивает счётчик", () => {
  const a = new Array(71).fill(null);
  a[8] = "?"; // вопрос 9 входит в F, 1, 2, 3 по ответу «Да»
  const p = S.computeProfile(a);
  ORDER.forEach((s) => assert.equal(p.raw[s], 0));
  assert.equal(p.dontKnow, 1);
});

test("ответ, меняющий K, подсвечивает и шкалы с поправкой", () => {
  const before = S.computeProfile([]);
  const a = new Array(71).fill(null);
  a[22] = "N"; // вопрос 23: K «Нет», 3 «Нет»
  const after = S.computeProfile(a);
  assert.deepEqual(S.changedScales(before, after), ["K", "3", "1", "4", "7", "8"].sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y)));
});

test("ответ, не засчитанный ни в одну шкалу, ничего не меняет", () => {
  const before = S.computeProfile([]);
  const a = new Array(71).fill(null);
  a[19] = "Y"; // вопрос 20 у psytests входит только в F по ответу «Нет»
  assert.deepEqual(S.changedScales(before, S.computeProfile(a)), []);
  assert.deepEqual(S.QUESTION_KEYS[19], [{ scale: "F", answer: "N" }]);
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
  const allNo = S.computeProfile(fill(() => "N")); // L = 5, F = 3
  assert.equal(allNo.validity.valid, false);
  assert.deepEqual(allNo.validity.checks.filter((c) => c.exceeded).map((c) => c.scale), ["L"]);
  const allYes = S.computeProfile(fill(() => "Y")); // L = 0, F = 12
  assert.equal(allYes.validity.valid, false);
  assert.deepEqual(allYes.validity.checks.filter((c) => c.exceeded).map((c) => c.scale), ["F"]);
  assert.equal(S.validity({ L: 4, F: 6 }).valid, true); // ровно на границе — ещё достоверно
  assert.equal(S.validity({ L: 5, F: 7 }).checks.every((c) => c.exceeded && c.reason), true);
  assert.equal(S.computeProfile([]).validity.valid, true);
});

test("по умолчанию Т считаются по профильному листу, как на psytests.org", () => {
  assert.equal(S.T_METHOD, "sheet");
  assert.equal(S.tScore("F", 10).t, 78);
  assert.equal(S.tScore("K", 0).t, 29);
});
test("профильный лист: за краем — продление по прямой с пометкой", () => {
  const inside = S.tScore("7", 20);
  assert.equal(inside.extrapolated, false);
  assert.equal(inside.t, 77);
  const out = S.tScore("7", 30); // лист кончается на 27
  assert.equal(out.extrapolated, true);
  assert.ok(out.t > 107.3 && out.t < 125);
  for (const s of Object.keys(D.profileSheet)) {
    const a = D.profileSheet[s].t;
    for (let i = 1; i < a.length; i++) assert.ok(a[i] > a[i - 1], `${s}[${i}]`);
  }
});

test("ключ psytests воспроизводит все 14 прогонов их теста (мужчина)", () => {
  const bit = (b) => { let p = ""; for (let q = 1; q <= 71; q++) p += (q >> b) & 1 ? "Y" : "N"; return p; };
  const conv = (p) => [...p].map((c) => (c === "1" || c === "Y" ? "Y" : "N"));
  // порядок: 1, 2, 3, 4, 6, 7, 8, 9, L, F, K — сырые баллы; затем Т-баллы psytests
  const runs = [
    ["N".repeat(71), [5,10,17,8,4,3,1,1,5,2,16], [66,61,74,67,47,73,56,35,78,46,73]],
    ["Y".repeat(71), [9,9,9,11,10,13,19,11,0,10,0], [51,58,44,53,82,48,63,80,40,78,29]],
    [bit(0), [5,9,9,8,5,9,8,5,1,7,5], [44,58,44,49,53,52,42,48,47,66,43]],
    [bit(1), [9,9,14,11,8,4,12,5,3,7,8], [66,58,63,67,70,44,66,55,63,66,51]],
    [bit(2), [7,11,16,14,7,9,11,9,2,3,10], [62,65,70,85,65,73,70,80,55,50,56]],
    [bit(3), [10,8,15,11,6,8,12,4,2,6,9], [73,54,67,70,58,65,70,48,55,62,54]],
    [bit(4), [10,11,16,11,3,9,7,6,3,5,11], [77,65,70,70,41,77,60,61,63,58,59]],
    [bit(5), [9,7,13,5,6,6,7,6,3,5,7], [66,50,59,40,58,48,46,55,63,58,48]],
    [bit(6), [5,9,17,8,6,5,3,1,5,4,12], [59,58,74,62,58,65,50,30,78,53,62]],
    ["21222212222121211222112111221121111221211221222121212111121112212111211", [8,10,13,10,6,9,11,9,4,6,8], [62,61,59,62,58,65,63,80,70,62,51]],
    ["22212122112122212212212211222221211121212111122222211122221222121211211", [8,14,16,9,6,7,7,4,4,7,9], [66,76,70,62,58,60,52,48,70,66,54]],
    ["11122222211112112111112221112112121122121212222211211111222111212221211", [7,7,10,10,8,6,8,4,3,6,7], [59,50,48,62,70,48,50,42,63,62,48]],
    ["22111111122221112222221112121112111112111212211122121111121122222121111", [6,10,10,9,9,11,11,9,1,7,4], [47,61,48,53,76,56,50,74,47,66,40]],
    ["12221222211121211111121111222221122121221221122222112212121111112111122", [10,10,17,11,9,12,12,5,2,4,7], [70,61,74,67,76,73,63,48,55,53,48]],
  ];
  const order = ["1","2","3","4","6","7","8","9","L","F","K"];
  for (const [p, raw, t] of runs) {
    const prof = S.computeProfile(conv(p));
    order.forEach((s, i) => {
      assert.equal(prof.raw[s], raw[i], `сырой ${s} для ${p.slice(0, 12)}…`);
      assert.equal(Math.round(prof.t[s]), t[i], `Т ${s} для ${p.slice(0, 12)}…`);
    });
  }
});

test("данные: 71 вопрос, вопрос 26 про мышцы, 27 про чувство вины", () => {
  assert.equal(D.questions.length, 71);
  assert.match(D.questions[25], /подергивания в мышцах/);
  assert.match(D.questions[26], /неправильное или нехорошее/);
});
