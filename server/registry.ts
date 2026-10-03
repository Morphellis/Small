/*
 * Что умеет считать сервер. Новый опросник: описание в server/tests/<id>/ и строка сюда
 * (открытая часть — src/tests/<id>/spec.ts и строка в src/app/registry.ts).
 */
import type { Variant } from "../src/kinds/luscher/flow";
import type { QuestionnaireDef } from "./questionnaire/types";
import { mmil } from "./tests/mmil/definition";
import { smil } from "./tests/smil/definition";
import { smol } from "./tests/smol/definition";

export const QUESTIONNAIRES: Readonly<Record<string, QuestionnaireDef>> = { smol, smil, mmil };

export const LUSCHER_VARIANTS: readonly Variant[] = ["short", "full"];
