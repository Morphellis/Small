import { expect, test } from "vitest";
import { parseProgress } from "../../src/app/progressTransfer";
const key = "smol-trainer-v1";
const file = (entries: unknown) => JSON.stringify({ format: "trainer-progress", version: 1, entries });

test("перенос сохраняет ответы и курсор, допускает пустые тесты", () => {
  const saved = { answers: ["N", ...Array(70).fill(null)], currentQuestion: 10 };
  expect(parseProgress(file({ [key]: saved }), [key]))
    .toEqual({ [key]: JSON.stringify(saved) });
  expect(parseProgress(file({ [key]: null }), [key])).toEqual({ [key]: null });
});

test("повреждённые ответы и журналы не заменяют сохранение", () => {
  const mmil = "mmil-trainer-v1", luscher = "luscher8-trainer-v1";
  for (const [id, value] of [
    [key, {}], [key, { answers: ["N"] }],
    [key, { answers: Array(71).fill("bad") }],
    [key, { answers: Array(71).fill(null), currentQuestion: 71 }],
    [key, { answers: Array(71).fill(null), history: [[]] }],
    [mmil, { answers: Array(377).fill("?") }],
    [luscher, { log: [{ step: "wrong", value: 1 }] }],
    [luscher, { log: [], layouts: { rank1: Array(8).fill(1) } }]
  ] as const) expect(() => parseProgress(file({ [id]: value }), [id])).toThrow();
  expect(parseProgress(file({ [luscher]: { log: [], layouts: {}, keyMode: false } }), [luscher])).toHaveProperty(luscher);
});

test("посторонние ключи, неподдерживаемый формат и большой файл отклоняются до записи", () => {
  for (const text of [file({ "trainer-theme": "dark" }), file({ [key]: [] }), "null", file({}), " ".repeat(1_048_577)]) {
    expect(() => parseProgress(text, [key])).toThrow();
  }
});
