/*
 * Заготовка нового теста.
 *
 *   npm run new-test -- <id> "<Название>" "<подпись>"            опросник (Да / Нет / Не знаю, шкалы по ключу)
 *   npm run new-test -- <id> "<Название>" "<подпись>" --custom   тест со своим экраном (например, Люшер)
 *
 * Создаёт папку src/tests/<id>/ с файлами-заготовками и добавляет тест в src/app/registry.ts.
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
fs.mkdirSync(dir, { recursive: true });
for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);

const line = `  { id: "${id}", title: ${JSON.stringify(title)}, subtitle: ${JSON.stringify(subtitle)}, hint: ${JSON.stringify(title)}, ` +
  `load: () => import("../tests/${id}").then((m) => m.default) }`;
const updated = registry.replace(/\n\];\s*$/, `,\n${line}\n];\n`);
if (updated === registry) {
  console.error("Не нашёл конец списка TESTS в registry.ts — добавьте строку вручную:\n" + line);
} else {
  fs.writeFileSync(registryFile, updated);
}

console.log(`Готово: src/tests/${id}/ (${Object.keys(files).join(", ")}), тест добавлен в src/app/registry.ts.`);
console.log(custom
  ? "Дальше: нарисовать экран в index.ts, затем npm run dev."
  : `Дальше: заполнить data.ts и definition.ts (места с TODO), снять эталон подсчёта (npm run fixture ${id}), затем npm test и npm run dev.`);

function questionnaireFiles() {
  return {
    "data.ts": `/*
 * Данные теста «${title}»: вопросы, шкалы, ключ, нормы. Источник: TODO (откуда взяты ключ и нормы).
 */
import type { ScaleInfo, ScaleKey } from "../../kinds/questionnaire/types";

// TODO: тексты вопросов по порядку (номер вопроса = индекс + 1).
export const questions: string[] = [
  "Первый вопрос.",
  "Второй вопрос."
];

// TODO: шкалы в порядке показа. Контрольные (group: "control") — первыми.
export const scaleOrder = ["A"];

export const scaleInfo: Record<string, ScaleInfo> = {
  A: { code: "A", name: "Примерной шкалы", title: "Примерная шкала", group: "clinical" }
};

// TODO: ключ — какие вопросы (номера с 1) засчитываются ответом «Да» (yes) и ответом «Нет» (no).
export const key: Record<string, ScaleKey> = {
  A: { yes: [1], no: [2] }
};

// TODO: нормы для перевода в Т: [среднее, стандартное отклонение].
export const norms: Record<string, [number, number]> = {
  A: [1, 0.5]
};
`,
    "definition.ts": `/*
 * «${title}»: как считать. Поля описаны в src/kinds/questionnaire/types.ts (QuestionnaireDef).
 */
import { tFormula, validityByLimits } from "../../kinds/questionnaire/engine";
import type { QuestionnaireDef } from "../../kinds/questionnaire/types";
import { key, norms, questions, scaleInfo, scaleOrder } from "./data";
import { HINTS } from "./hints";

export const ${camel(id)}: QuestionnaireDef = {
  id: "${id}",
  title: ${JSON.stringify(title)},
  storageKey: "${id}-trainer-v1",
  questions,
  scaleOrder,
  scaleInfo,
  key,
  // TODO: поправка K, если есть (см. kCorrectionByFactors в engine.ts и СМИЛ).
  kCorrected: [],
  kCorrection: () => ({}),
  tScore: (scale, x) => ({ t: Math.round(tFormula(x, norms[scale][0], norms[scale][1])), extrapolated: false }),
  tDigits: 0,
  thresholds: { high: 70, low: 30 },
  // TODO: правило достоверности: какие шкалы и с какими пределами (by: "raw" — по сырым баллам, "t" — по Т).
  validity: validityByLimits({}, {}, "t"),
  validityRule: "TODO: правило достоверности одной фразой.",
  ui: {
    focus: scaleOrder,
    hints: HINTS,
    keyHighlight: true,
    bars: { min: 0, max: 120 },
    band: [30, 70]
  }
};
`,
    "hints.ts": `/*
 * Свои «правильные» ответы для режима «Показать ключ»: номер вопроса → "Y" (Да), "N" (Нет) или "?" (Не знаю).
 * Пока список пуст, подсвечиваются ответы по ключу (ui.keyHighlight).
 */
import type { Hints } from "../../kinds/questionnaire/types";

export const HINTS: Hints = {};
`,
    "index.ts": `import { questionnaireModule } from "../../kinds/questionnaire";
import { ${camel(id)} } from "./definition";

export default questionnaireModule(${camel(id)});
`
  };
}

function customFiles() {
  return {
    "index.ts": `/*
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
    [`${id}.css`]: `/* Стили теста «${title}». Классы с префиксом ${id}-, чтобы не пересекаться с другими тестами. */
.${id}-main { padding-top: 16px; padding-bottom: 40px; }
`
  };
}

function camel(s) {
  return s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}
