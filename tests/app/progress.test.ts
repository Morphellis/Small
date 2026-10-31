import { expect, test } from "vitest";
import { parseProgress } from "../../src/app/progressTransfer";
const key = "smol-trainer-v1";
const file = (entries: unknown) => JSON.stringify({ format: "trainer-progress", version: 1, entries });

test("перенос сохраняет ответы и курсор, допускает пустые тесты", () => {
  expect(parseProgress(file({ [key]: { answers: ["N"], currentQuestion: 10 } }), [key]))
    .toEqual({ [key]: '{"answers":["N"],"currentQuestion":10}' });
  expect(parseProgress(file({ [key]: null }), [key])).toEqual({ [key]: null });
});

test("посторонние ключи, неподдерживаемый формат и большой файл отклоняются до записи", () => {
  for (const text of [file({ "trainer-theme": "dark" }), file({ [key]: [] }), "null", file({}), " ".repeat(1_048_577)]) {
    expect(() => parseProgress(text, [key])).toThrow();
  }
});
