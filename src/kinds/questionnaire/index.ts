/*
 * Опросник как тест для оболочки: описание (QuestionnaireDef) + общий экран.
 * Стили опросника подключаются вместе с ним и не попадают на страницы тестов другого типа.
 */
import type { TestModule } from "../../app/types";
import type { QuestionnaireDef } from "./types";
import { mountQuestionnaire } from "./view";
import "./questionnaire.css";

export interface QuestionnaireModule extends TestModule {
  /** Описание — чтобы автопроверки (tests/questionnaire/definitions.test.ts) нашли все опросники сами. */
  def: QuestionnaireDef;
}

export function questionnaireModule(def: QuestionnaireDef): QuestionnaireModule {
  return { def, mount: (root, ctx) => mountQuestionnaire(def, root, ctx) };
}

export const isQuestionnaireModule = (m: TestModule): m is QuestionnaireModule => "def" in m;
