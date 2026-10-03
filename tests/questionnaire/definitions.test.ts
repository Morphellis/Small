/*
 * Проверка описаний всех опросников: ловит опечатки в данных нового теста до выкладки.
 * Открытая часть (src/tests/<id>/spec.ts, на сайте) и полная (server/tests/<id>/, на сервере) должны сходиться.
 */
import { describe, expect, test } from "vitest";
import { computeProfile } from "../../server/questionnaire/engine";
import { QUESTIONNAIRES } from "../../server/registry";
import { isQuestionnaireModule } from "../../src/kinds/questionnaire";
import { TESTS } from "../../src/app/registry";

const modules = await Promise.all(TESTS.map((t) => t.load()));
const SPECS = modules.filter(isQuestionnaireModule).map((m) => m.def);
const DEFS = Object.values(QUESTIONNAIRES);

test("у каждого опросника сайта есть подсчёт на сервере, и открытая часть та же самая", () => {
  expect(SPECS.map((s) => s.id).sort()).toEqual(DEFS.map((d) => d.id).sort());
  for (const spec of SPECS) {
    const def = QUESTIONNAIRES[spec.id];
    for (const [k, v] of Object.entries(spec)) expect((def as unknown as Record<string, unknown>)[k], `${spec.id}.${k}`).toEqual(v);
  }
});

test("опросники из реестра найдены", () => {
  expect(SPECS.map((d) => d.id)).toEqual(expect.arrayContaining(["smol", "smil"]));
});

test("у всех тестов в реестре разные id, и каждый загружается", async () => {
  const ids = TESTS.map((t) => t.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const t of TESTS) {
    const m = await t.load();
    expect(typeof m.mount, t.id).toBe("function");
  }
});

test("у опросников разные ключи хранения", () => {
  const keys = SPECS.map((d) => d.storageKey);
  expect(new Set(keys).size).toBe(keys.length);
});

for (const def of DEFS) {
  const N = def.questions.length;
  describe(`${def.title}: описание без ошибок`, () => {
    test("вопросы непустые", () => {
      expect(N).toBeGreaterThan(0);
      def.questions.forEach((q, i) => expect(q.trim().length, `вопрос ${i + 1}`).toBeGreaterThan(0));
    });

    test("у каждой шкалы есть описание и ключ, номера вопросов в ключе существуют и не повторяются", () => {
      expect(new Set(def.scaleOrder).size).toBe(def.scaleOrder.length);
      for (const s of def.scaleOrder) {
        expect(def.scaleInfo[s], `описание шкалы ${s}`).toBeDefined();
        const k = def.key[s];
        expect(k, `ключ шкалы ${s}`).toBeDefined();
        const all = [...k.yes, ...k.no];
        expect(new Set(all).size, `повторы в ключе шкалы ${s}`).toBe(all.length);
        for (const n of all) expect(Number.isInteger(n) && n >= 1 && n <= N, `шкала ${s}: вопрос ${n}`).toBe(true);
      }
    });

    test("Т считается для любого балла от 0 до длины шкалы с поправкой", () => {
      for (const s of def.scaleOrder) {
        const max = def.key[s].yes.length + def.key[s].no.length + 40;
        for (let x = 0; x <= max; x++) expect(Number.isFinite(def.tScore(s, x).t), `Т шкалы ${s} при ${x}`).toBe(true);
      }
    });

    test("поправка K только к шкалам теста", () => {
      for (const s of def.kCorrected) expect(def.scaleOrder, `шкала поправки ${s}`).toContain(s);
      for (let k = 0; k <= 40; k++) for (const s of Object.keys(def.kCorrection(k))) expect(def.kCorrected).toContain(s);
    });

    test("подсказки, контрольные пункты и шкалы упора ссылаются на существующее", () => {
      for (const [q, a] of Object.entries(def.hints)) {
        expect(Number(q) >= 1 && Number(q) <= N, `подсказка к вопросу ${q}`).toBe(true);
        expect(["Y", "N", "?"]).toContain(a);
      }
      for (const q of def.controlItems ?? []) expect(q >= 1 && q <= N, `контрольный пункт ${q}`).toBe(true);
      for (const s of def.ui.focus) expect(def.scaleOrder).toContain(s);
      expect(def.ui.bars.min).toBeLessThan(def.ui.bars.max);
      expect(def.thresholds.low).toBeLessThan(def.thresholds.high);
    });

    test("профиль считается и без ответов, и при всех ответах", () => {
      for (const fill of [null, "Y", "N", "?"] as const) {
        const p = computeProfile(def, new Array(N).fill(fill));
        for (const s of def.scaleOrder) expect(Number.isFinite(p.t[s]), `${fill}: Т ${s}`).toBe(true);
      }
    });
  });
}
