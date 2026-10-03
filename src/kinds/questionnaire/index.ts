/*
 * Опросник как тест для оболочки: открытое описание (QuestionnaireSpec) + общий экран; считает сервер.
 * Стили опросника подключаются вместе с ним и не попадают на страницы тестов другого типа.
 */
import type { TestModule } from "../../app/types";
import type { QuestionnaireSpec } from "./types";
import { mountQuestionnaire } from "./view/mount";
import "./questionnaire.css";

export interface QuestionnaireModule extends TestModule {
  kind: "questionnaire";
  /** Описание — чтобы автопроверки (tests/questionnaire/definitions.test.ts) нашли все опросники сами. */
  def: QuestionnaireSpec;
}

export function questionnaireModule(def: QuestionnaireSpec): QuestionnaireModule {
  return { kind: "questionnaire", def, mount: (root, ctx) => mountQuestionnaire(def, root, ctx) };
}

export const isQuestionnaireModule = (m: TestModule): m is QuestionnaireModule => m.kind === "questionnaire";
