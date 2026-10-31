/*
 * Все тесты сайта. Порядок — как на переключателе. Первый — тест по умолчанию.
 *
 * Чтобы добавить тест: создать папку src/tests/<id>/ с index.ts, который экспортирует по умолчанию
 * TestModule (опросник — через questionnaireModule, тест другого типа — со своим mount), и дописать строку сюда.
 */
import type { TestEntry, TestModule } from "./types";

// Отдельный URL маленького входного модуля позволяет повторить импорт в WebKit,
// который кеширует неудачную загрузку. Спецификации и движки остаются общими.
const retryModules = import.meta.glob<TestModule>("../tests/*/index.ts", { query: "?retry", import: "default" });

export const TESTS: readonly TestEntry[] = [
  { id: "smol", storageKey: "smol-trainer-v1", title: "СМОЛ", subtitle: "71 вопрос", hint: "Мини-Мульт", load: () => import("../tests/smol").then((m) => m.default) },
  { id: "smil", storageKey: "smil-trainer-v1", title: "СМИЛ", subtitle: "566 утверждений", hint: "Л. Н. Собчик", load: () => import("../tests/smil").then((m) => m.default) },
  { id: "mmil", storageKey: "mmil-trainer-v1", title: "ММИЛ", subtitle: "377 утверждений", hint: "Ф. Б. Березин, М. П. Мирошников", load: () => import("../tests/mmil").then((m) => m.default) },
  { id: "luscher8", storageKey: "luscher8-trainer-v1", title: "Люшер", subtitle: "8 цветов", hint: "Восьмицветовой тест Люшера", load: () => import("../tests/luscher8").then((m) => m.default) },
  { id: "luscher", storageKey: "luscher-full-trainer-v1", title: "Люшер полный", subtitle: "7 таблиц", hint: "Полный цветовой тест Люшера (И. И. Цыганок)", load: () => import("../tests/luscher").then((m) => m.default) }
].map((entry) => ({
  ...entry,
  load: (retry = false) => retry ? retryModules[`../tests/${entry.id}/index.ts`]() : entry.load()
}));
