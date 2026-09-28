/*
 * Все тесты сайта. Порядок — как на переключателе. Первый — тест по умолчанию.
 *
 * Чтобы добавить тест: создать папку src/tests/<id>/ с index.ts, который экспортирует по умолчанию
 * TestModule (опросник — через questionnaireModule, тест другого типа — со своим mount), и дописать строку сюда.
 */
import type { TestEntry } from "./types";

export const TESTS: readonly TestEntry[] = [
  { id: "smol", title: "СМОЛ", subtitle: "71 вопрос", hint: "Мини-Мульт", load: () => import("../tests/smol").then((m) => m.default) },
  { id: "smil", title: "СМИЛ", subtitle: "566 утверждений", hint: "Л. Н. Собчик", load: () => import("../tests/smil").then((m) => m.default) },
  { id: "mmil", title: "ММИЛ", subtitle: "377 утверждений", hint: "Ф. Б. Березин, М. П. Мирошников", load: () => import("../tests/mmil").then((m) => m.default) }
];
