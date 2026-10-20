/*
 * Только для показа на GitHub Pages (ветка pages-demo): там нет сервера, поэтому те же расчёты, что делает
 * server/api.ts, выполняются прямо в браузере. Ключи, нормы и формулы при этом попадают в файлы сайта —
 * в основной ветке так делать нельзя, там считает сервер.
 */
import { LUSCHER_VARIANTS, QUESTIONNAIRES } from "../../server/registry";
import { scoreLuscher } from "../../server/luscher/score";
import { computeProfile, publicKeys } from "../../server/questionnaire/engine";
import { decodeAnswers } from "../kinds/questionnaire/answers";
import type { Pick, Variant } from "../kinds/luscher/flow";

/** Ответ как у сервера: тот же путь api/…, то же тело запроса, тот же результат. */
export function localApi(path: string, body: unknown): unknown {
  const parts = path.split("/").filter(Boolean); // ["api", …]
  if (parts[1] === "questionnaire") {
    const def = Object.hasOwn(QUESTIONNAIRES, parts[2]) ? QUESTIONNAIRES[parts[2]] : undefined;
    if (!def) throw new Error("нет такого теста");
    if (parts[3] === "keys") return publicKeys(def);
    const answers = decodeAnswers(def, (body as { answers?: unknown } | null)?.answers);
    if (!answers) throw new Error("ответы не подходят к тесту");
    return { profile: computeProfile(def, answers) };
  }
  if (parts[1] === "luscher") {
    const variant = parts[2] as Variant;
    if (!LUSCHER_VARIANTS.includes(variant)) throw new Error("нет такого теста");
    return scoreLuscher(variant, (body as { log: Pick[] }).log);
  }
  throw new Error("нет такого адреса");
}
