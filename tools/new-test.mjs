/*
 * Заготовка нового теста.
 *
 *   npm run new-test -- <id> "<Название>" "<подпись>"            опросник (Да / Нет / Не знаю, шкалы по ключу)
 *   npm run new-test -- <id> "<Название>" "<подпись>" --custom   тест со своим экраном (например, Люшер)
 *
 * Опросник: открытая часть (тексты, шкалы, экран) — src/tests/<id>/, подсчёт (ключ, нормы, подсказки) —
 * server/tests/<id>/; тест добавляется и в src/app/registry.ts, и в server/registry.ts.
 * Тест со своим экраном: только src/tests/<id>/ и строка в src/app/registry.ts.
 * Дальше: заполнить данные (места помечены TODO), `npm test`, `npm run dev`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const custom = args.includes("--custom");
const [id, title, subtitle = ""] = args.filter((a) => a !== "--custom");

if (!id || !title || !/^[a-z][a-z0-9-]*$/.test(id)) {
  console.error('Использование: npm run new-test -- <id> "<Название>" "<подпись>" [--custom]\n' +
    "id — латиницей в нижнем регистре: он станет адресом (#id) и именем папки.");
  process.exit(1);
}

const dir = path.join(root, "src", "tests", id);
if (fs.existsSync(dir)) {
  console.error(`Папка ${path.relative(root, dir)} уже есть.`);
  process.exit(1);
}
const registryFile = path.join(root, "src", "app", "registry.ts");
const registry = fs.readFileSync(registryFile, "utf8");
if (registry.includes(`id: "${id}"`)) {
  console.error(`Тест с id "${id}" уже есть в реестре.`);
  process.exit(1);
}

const files = custom ? customFiles() : questionnaireFiles();
for (const [name, text] of Object.entries(files)) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
if (!custom) addToServerRegistry();

const line = `  { id: "${id}", title: ${JSON.stringify(title)}, subtitle: ${JSON.stringify(subtitle)}, hint: ${JSON.stringify(title)}, ` +
  `load: () => import("../tests/${id}").then((m) => m.default) }`;
const updated = registry.replace(/\n\];\s*$/, `,\n${line}\n];\n`);
if (updated === registry) {
  console.error("Не нашёл конец списка TESTS в registry.ts — добавьте строку вручную:\n" + line);
} else {
  fs.writeFileSync(registryFile, updated);
}

console.log(`Готово: ${Object.keys(files).join(", ")}; тест добавлен в src/app/registry.ts${custom ? "" : " и server/registry.ts"}.`);
console.log(custom
  ? "Дальше: нарисовать экран в index.ts, затем npm run dev. Если подсчёт нужно скрыть — вынести его на сервер, как у Люшера (server/luscher)."
  : `Дальше: заполнить spec.ts, data.ts и definition.ts (места с TODO), снять эталон подсчёта (npm run fixture ${id}), затем npm test и npm run dev.`);

function addToServerRegistry() {
  const file = path.join(root, "server", "registry.ts");
  let text = fs.readFileSync(file, "utf8");
  const name = camel(id);
  const before = text;
  // Импорт — после последнего импорта описаний, имя — в конец списка QUESTIONNAIRES.
  const imports = [...text.matchAll(/^import \{ \w+ \} from "\.\/tests\/[^"]+";\n/gm)];
  const lastImport = imports[imports.length - 1];
  if (lastImport) {
    const at = lastImport.index + lastImport[0].length;
    text = text.slice(0, at) + `import { ${name} } from "./tests/${id}/definition";\n` + text.slice(at);
  }
  text = text.replace(/(QUESTIONNAIRES[^=]*= \{[^}]*?)( \};)/, `$1, ${name}$2`);
  if (text === before) console.error(`Не смог дописать server/registry.ts — добавьте ${name} вручную.`);
  else fs.writeFileSync(file, text);
}

function questionnaireFiles() {
  const name = camel(id);
  return {
    [`src/tests/${id}/spec.ts`]: `/*
 * «${title}»: открытая часть — тексты вопросов, шкалы и экран (поля — QuestionnaireSpec в
 * src/kinds/questionnaire/types.ts). Как считать — только на сервере: server/tests/${id}/.
 */
import type { QuestionnaireSpec } from "../../kinds/questionnaire/types";

export const ${name}: QuestionnaireSpec = {
  id: "${id}",
  title: ${JSON.stringify(title)},
  storageKey: "${id}-trainer-v1",
  // TODO: шкалы в порядке показа. Контрольные (group: "control") — первыми.
  scaleOrder: ["A"],
  scaleInfo: {
    A: { code: "A", name: "Примерной шкалы", title: "Примерная шкала", group: "clinical" }
  },
  // TODO: шкалы, к которым прибавляется поправка K (если она есть).
  kCorrected: [],
  tDigits: 0,
  thresholds: { high: 70, low: 30 },
  validityRule: "TODO: правило достоверности одной фразой.",
  ui: {
    focus: ["A"],
    keyHighlight: true,
    bars: { min: 0, max: 120 },
    band: [30, 70]
  },
  // TODO: тексты вопросов по порядку (номер вопроса = индекс + 1).
  questions: [
    "Первый вопрос.",
    "Второй вопрос."
  ]
};
`,
    [`src/tests/${id}/index.ts`]: `import { questionnaireModule } from "../../kinds/questionnaire";
import { ${name} } from "./spec";

export default questionnaireModule(${name});
`,
    [`server/tests/${id}/data.ts`]: `/*
 * «${title}»: ключ и нормы — только на сервере. Источник: TODO (откуда взяты ключ и нормы).
 */
import type { ScaleKey } from "../../questionnaire/types";

// TODO: ключ — какие вопросы (номера с 1) засчитываются ответом «Да» (yes) и ответом «Нет» (no).
export const key: Record<string, ScaleKey> = {
  A: { yes: [1], no: [2] }
};

// TODO: нормы для перевода в Т: [среднее, стандартное отклонение].
export const norms: Record<string, [number, number]> = {
  A: [1, 0.5]
};
`,
    [`server/tests/${id}/definition.ts`]: `/*
 * «${title}»: как считать. Поля — QuestionnaireDef в server/questionnaire/types.ts.
 */
import { ${name} as SPEC } from "../../../src/tests/${id}/spec";
import { tFormula, validityByLimits } from "../../questionnaire/engine";
import type { QuestionnaireDef } from "../../questionnaire/types";
import { key, norms } from "./data";
import { HINTS } from "./hints";

export const ${name}: QuestionnaireDef = {
  ...SPEC,
  key,
  // TODO: поправка K, если есть (см. kCorrectionByFactors в engine.ts и СМИЛ).
  kCorrection: () => ({}),
  tScore: (scale, x) => ({ t: Math.round(tFormula(x, norms[scale][0], norms[scale][1])), extrapolated: false }),
  // TODO: правило достоверности: какие шкалы и с какими пределами (by: "raw" — по сырым баллам, "t" — по Т).
  validity: validityByLimits({}, {}, "t"),
  hints: HINTS
};
`,
    [`server/tests/${id}/hints.ts`]: `/*
 * Свои «правильные» ответы для режима «Показать ключ»: номер вопроса → "Y" (Да), "N" (Нет) или "?" (Не знаю).
 * Пока список пуст, подсвечиваются ответы по ключу (ui.keyHighlight).
 */
import type { Hints } from "../../../src/kinds/questionnaire/types";

export const HINTS: Hints = {};
`
  };
}

function customFiles() {
  return {
    [`src/tests/${id}/index.ts`]: `/*
 * «${title}»: тест со своим экраном и своим подсчётом. От оболочки берёт шапку (переключатель тестов,
 * «Показать ключ», тему, «Сбросить») и Scope — всё, что подписано через scope, снимется при переходе на другой тест.
 * Как устроен вид теста целиком, смотрите на примере src/kinds/luscher: модель без DOM (model.ts, проверяется
 * тестами в tests/), части экрана в view/, связка «событие → модель → перерисовка» в view/mount.ts.
 */
import { bindHeader, buttonHtml, headerHtml, keyButton } from "../../app/header";
import { byId } from "../../app/html";
import { createScope } from "../../app/scope";
import type { TestModule } from "../../app/types";
import "./${id}.css";

const mod: TestModule = {
  kind: "${id}",
  mount(root, ctx) {
    const scope = createScope();
    root.innerHTML = headerHtml(ctx, { actions: [buttonHtml(keyButton())] }) + \`
      <main class="wrap ${id}-main">
        <p>TODO: экран теста «${title}».</p>
      </main>\`;
    bindHeader(root, ctx, scope);
    scope.on(byId(root, "resetBtn"), "click", () => { /* TODO: начать заново */ });
    return () => {
      scope.dispose();
      root.innerHTML = "";
    };
  }
};

export default mod;
`,
    [`src/tests/${id}/${id}.css`]: `/* Стили теста «${title}». Классы с префиксом ${id}-, чтобы не пересекаться с другими тестами. */
.${id}-main { padding-top: 16px; padding-bottom: 40px; }
`
  };
}

function camel(s) {
  return s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}
