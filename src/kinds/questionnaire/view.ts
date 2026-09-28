/*
 * Экран опросника: липкая панель (что изменил последний ответ, полоска шкал), вопросы, регистрационный лист
 * и подробный профиль (таблица, полосы, график). Работает с любым QuestionnaireDef.
 *
 * mount() рисует экран и возвращает функцию, которая всё убирает: обработчики снимаются через AbortController,
 * наблюдатели и таймеры останавливаются. Поэтому переход между тестами идёт без перезагрузки страницы.
 */
import { escapeHtml } from "../../app/html";
import { readJson, writeJson } from "../../app/storage";
import { bindTestSwitch, markTestSwitch, testSwitchHtml } from "../../app/testSwitch";
import { bindThemeButton } from "../../app/theme";
import type { AppContext, Unmount } from "../../app/types";
import { cellState, changedScales, computeProfile, normalizeAnswers, questionKeys } from "./engine";
import { renderBars, renderChart } from "./profileViews";
import type { Answer, MaybeAnswer, Profile, QuestionnaireDef } from "./types";

type ProfileView = "table" | "bars" | "chart";

interface LastAnswer {
  q: number;
  /** Изменившиеся шкалы из focus. */
  changed: string[];
  /** Все изменившиеся шкалы. */
  changedAll: string[];
  before: Profile;
  after: Profile;
}

interface State {
  answers: MaybeAnswer[];
  history: MaybeAnswer[][];
  keyMode: boolean;
  cur: number;
  last: LastAnswer | null;
  /** Боковая колонка (на узком экране — шторка снизу). */
  showProfile: boolean;
  profileView: ProfileView;
}

/** Что лежит в localStorage. Формат прежний: иначе у людей пропадут сохранённые ответы. */
interface Saved {
  answers?: unknown[];
  history?: unknown[];
  keyMode?: boolean;
  showProfile?: boolean;
  showProfileWide?: boolean;
  profileView?: string;
  viewV?: number;
}

const LETTER: Record<Answer, string> = { Y: "Д", N: "Н", "?": "?" };
const WORD: Record<Answer, string> = { Y: "Да", N: "Нет", "?": "Не знаю" };
const levelWord: Record<string, string> = { high: "высокое", low: "низкое" };
const isAnswer = (v: unknown): v is Answer => v === "Y" || v === "N" || v === "?";
const scalesWord = (list: string[]) => (list.length > 1 ? "шкалы " : "шкала ") + list.join(", ");

function layoutHtml(ctx: AppContext, dk: boolean): string {
  return `
  <!-- Верх (липкий): управление, что изменил последний ответ, все шкалы одной полоской -->
  <header class="panel" id="panel" aria-label="Баллы">
    <div class="wrap">
      <div class="panel-head">
        ${testSwitchHtml(ctx)}
        <details class="validity" id="validity"><summary id="validitySum"></summary><div class="validity-body" id="validityBody"></div></details>
        <span class="spacer"></span>
        <span class="toast" id="toast" role="status" aria-live="polite"></span>
        <button type="button" class="btn btn-key" id="keyBtn" aria-pressed="false"><span class="long">Показать ключ</span><span class="short">Ключ</span></button>
        <button type="button" class="btn btn-ghost" id="toggleProfile" aria-pressed="true"><span class="long">Профиль</span><span class="short">Профиль</span></button>
        <button type="button" class="btn btn-theme" id="themeBtn" aria-label="Переключить тему" title="Тёмная / светлая тема"></button>
        <button type="button" class="btn btn-reset" id="resetBtn" title="Сбросить результаты" aria-label="Сбросить результаты"><span class="long">Сбросить</span><span class="short">↺</span></button>
      </div>
      <div class="impact" id="impact" aria-live="polite"></div>
      <div class="strip" id="strip"></div>
    </div>
  </header>

  <div class="wrap layout" id="layout">
    <main class="main">
      <p class="keys-hint" id="hint">Клавиши: <kbd>1</kbd> Да · <kbd>2</kbd> Нет · ${dk ? "<kbd>3</kbd> Не знаю · " : ""}<kbd>0</kbd> снять ответ · <kbd>↑</kbd><kbd>↓</kbd> другой вопрос</p>
      <ol class="questions" id="questions"></ol>

      <section class="sheet" aria-labelledby="sheetTitle">
        <h2 id="sheetTitle">Регистрационный лист</h2>
        <div class="sheet-scroll"><div class="sheet-grid" id="sheetGrid"></div></div>
        <ul class="legend">
          <li><span class="cell st-empty"></span>нет ответа</li>
          <li><span class="cell st-first a-Y">Д</span><span class="cell st-first a-N">Н</span>«Да» или «Нет» с первого раза</li>
          <li><span class="cell st-changed a-N">Н</span>ответ менялся (Да ↔ Нет${dk ? " или после «Не знаю»" : ""})</li>${dk ? `
          <li><span class="cell st-dk a-dk">?</span>«Не знаю»</li>
          <li><span class="cell st-dkAfter a-dk">?</span>сначала «Да»/«Нет», затем «Не знаю»</li>` : ""}
        </ul>
      </section>
    </main>

    <!-- Подробный профиль: колонка справа на широком экране, выезжающая снизу шторка на телефоне и планшете (кнопка «Профиль») -->
    <aside class="side" id="side" aria-label="Подробный профиль">
      <div class="side-top">
        <div class="side-head"><b>Профиль</b><button type="button" class="side-close" id="sideClose" aria-label="Закрыть профиль">✕</button></div>
        <div class="view-switch" role="tablist" aria-label="Вид профиля">
          <button type="button" role="tab" data-view="table">Таблица</button>
          <button type="button" role="tab" data-view="bars">Шкалы</button>
          <button type="button" role="tab" data-view="chart">График</button>
        </div>
      </div>
      <div class="chart-wrap" id="chartWrap">
        <div class="bars" id="bars"></div>
        <svg id="chart" viewBox="0 0 600 290" role="img" aria-label="Профиль Т-баллов"></svg>
      </div>
      <div class="table-wrap" id="tableWrap">
        <table class="scores" id="scoreTable">
          <thead>
            <tr><th class="num">Т-баллы</th><th class="num">Сырые</th><th>Шкалы</th><th class="num" title="Изменение Т после последнего ответа">Δ Т</th></tr>
          </thead>
          <tbody id="scoreBody"></tbody>
        </table>
      </div>
    </aside>
  </div>

  <button type="button" class="side-open" id="sideOpen" aria-controls="side">▲ Профиль: таблица · шкалы · график</button>`;
}

export function mountQuestionnaire(def: QuestionnaireDef, root: HTMLElement, ctx: AppContext): Unmount {
  const N = def.questions.length;
  const ORDER = def.scaleOrder;
  const FOCUS = new Set(def.ui.focus);
  const HINTS = def.ui.hints;
  const USE_HINTS = Object.keys(HINTS).length > 0;
  const KEY_HIGHLIGHT = !USE_HINTS && def.ui.keyHighlight;
  const KEYS = questionKeys(def);
  // Есть ли ответ «Не знаю» (в ММИЛ выбор обязательный: только «Да» или «Нет»).
  const DK = def.allowDontKnow !== false;
  const scaleLabel = (s: string) => `${def.scaleInfo[s].code}: ${def.scaleInfo[s].name}`;
  const profileOf = (answers: MaybeAnswer[]) => computeProfile(def, answers);

  const abort = new AbortController();
  const { signal } = abort;
  const cleanups: (() => void)[] = [];

  root.innerHTML = layoutHtml(ctx, DK);
  const $ = <T extends Element = HTMLElement>(id: string) => root.querySelector<T>("#" + id)!;
  const el = {
    panel: $("panel"),
    layout: $("layout"),
    impact: $("impact"),
    chartWrap: $("chartWrap"),
    chart: $<SVGSVGElement>("chart"),
    bars: $("bars"),
    viewButtons: root.querySelectorAll<HTMLButtonElement>(".view-switch button"),
    tableWrap: $("tableWrap"),
    scoreBody: $("scoreBody"),
    validity: $<HTMLDetailsElement>("validity"),
    validitySum: $("validitySum"),
    validityBody: $("validityBody"),
    strip: $("strip"),
    keyBtn: $("keyBtn"),
    toggleProfile: $("toggleProfile"),
    resetBtn: $("resetBtn"),
    themeBtn: $("themeBtn"),
    sideClose: $("sideClose"),
    sideOpen: $("sideOpen"),
    toast: $("toast"),
    questions: $("questions"),
    sheetGrid: $("sheetGrid")
  };

  const WIDE = window.matchMedia("(min-width: 1001px)");

  const state: State = {
    answers: new Array<MaybeAnswer>(N).fill(null),
    history: Array.from({ length: N }, () => []),
    keyMode: false,
    cur: 0,
    last: null,
    showProfile: true,
    profileView: "table"
  };
  let profile: Profile = profileOf(state.answers);

  // ---------- хранение (только удобство: переживает перезагрузку страницы) ----------
  function persist() {
    const saved: Saved = {
      answers: state.answers, history: state.history,
      keyMode: state.keyMode, showProfile: state.showProfile, showProfileWide: WIDE.matches, profileView: state.profileView, viewV: 2
    };
    writeJson(def.storageKey, saved);
  }

  function restore() {
    // На широком экране профиль всегда рядом с вопросами; на узком по умолчанию свёрнут (остаётся полоска шкал сверху).
    state.showProfile = WIDE.matches;
    const saved = readJson<Saved>(def.storageKey);
    if (!saved) return;
    state.answers = normalizeAnswers(def, saved.answers);
    state.history = Array.from({ length: N }, (_, i) => {
      const h = Array.isArray(saved.history) && Array.isArray(saved.history[i]) ? (saved.history[i] as unknown[]) : [];
      return h.filter((v): v is MaybeAnswer => v === null || isAnswer(v));
    });
    // История без текущего ответа (например, из старого сохранения) — дополнить.
    state.answers.forEach((a, i) => {
      const h = state.history[i];
      if (a !== null && h[h.length - 1] !== a) h.push(a);
    });
    state.last = null;
    if (typeof saved.keyMode === "boolean") state.keyMode = saved.keyMode;
    if (typeof saved.showProfile === "boolean" && WIDE.matches === (saved.showProfileWide !== false)) state.showProfile = saved.showProfile;
    if (saved.viewV === 2 && (saved.profileView === "bars" || saved.profileView === "chart" || saved.profileView === "table")) state.profileView = saved.profileView;
  }

  // ---------- форматирование ----------
  function fmtT(t: number | null, extrapolated?: boolean) {
    if (t === null) return "—";
    return (extrapolated ? "≈" : "") + t.toFixed(def.tDigits).replace("-", "−");
  }
  function signed(v: number, digits: number) {
    const s = Math.abs(v).toFixed(digits);
    return (v > 0 ? "+" : v < 0 ? "−" : "±") + s;
  }

  // ---------- построение вопросов ----------
  function buildQuestions() {
    const frag = document.createDocumentFragment();
    def.questions.forEach((text, i) => {
      const li = document.createElement("li");
      li.className = "q";
      li.id = "q-" + (i + 1);
      li.dataset.i = String(i);
      li.innerHTML =
        `<span class="q-num">${i + 1}</span>` +
        `<div class="q-body"><p class="q-text"></p><div class="q-key" hidden></div><div class="q-impact" hidden></div></div>` +
        `<div class="q-btns" role="group" aria-label="Ответ на вопрос ${i + 1}">` +
        `<button type="button" data-a="Y">Да</button><button type="button" data-a="N">Нет</button>` +
        (DK ? `<button type="button" data-a="?">Не знаю</button>` : "") + `</div>`;
      li.querySelector(".q-text")!.textContent = text;
      const keys = KEYS[i].filter((k) => FOCUS.has(k.scale));
      const keyBox = li.querySelector(".q-key")!;
      if (keys.length) {
        // «Ключ: «Да» → шкалы F, 1 · «Нет» → шкалы 3, 6»
        const parts = (["Y", "N"] as const).map((a) => {
          const list = keys.filter((k) => k.answer === a).map((k) => k.scale);
          if (!list.length) return "";
          return `<span class="tag"><b class="ans-${a}">«${WORD[a]}»</b> → ${scalesWord(list)}</span>`;
        }).filter(Boolean);
        keyBox.innerHTML = `<span class="key-label">Ключ:</span>` + parts.join(`<span class="sep">·</span>`);
        if (KEY_HIGHLIGHT) for (const a of new Set(keys.map((k) => k.answer))) li.querySelector(`button[data-a="${a}"]`)!.classList.add("scores-key");
      } else {
        keyBox.innerHTML = `<span class="key-label">Ключ:</span><span class="none">не влияет на отслеживаемые шкалы</span>`;
      }
      // Свой список «правильных» ответов (hints): подсвечивается только он.
      const hint = HINTS[i + 1];
      if (USE_HINTS && hint) {
        keyBox.insertAdjacentHTML("afterbegin", `<span class="key-label">Ответ:</span><b class="ans-${hint === "?" ? "dk" : hint}">«${WORD[hint]}»</b><span class="sep">·</span>`);
        li.querySelector(`button[data-a="${hint}"]`)!.classList.add("scores-key");
      }
      frag.appendChild(li);
    });
    el.questions.appendChild(frag);
  }

  function buildSheet() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < N; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cell st-empty";
      b.dataset.i = String(i);
      b.innerHTML = `<i>${i + 1}</i><span></span>`;
      frag.appendChild(b);
    }
    el.sheetGrid.appendChild(frag);
  }

  // ---------- отрисовка ----------
  const questionEl = (i: number) => el.questions.children[i] as HTMLElement;

  function renderQuestion(i: number) {
    const li = questionEl(i);
    const a = state.answers[i];
    for (const b of li.querySelectorAll<HTMLButtonElement>("button")) {
      const on = b.dataset.a === a;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
    // Под каждым отвеченным вопросом остаётся строка «на какие шкалы он повлиял».
    const impact = li.querySelector<HTMLElement>(".q-impact")!;
    if (a === null) {
      impact.hidden = true;
    } else {
      impact.hidden = false;
      impact.innerHTML = questionImpactHtml(i);
    }
    li.classList.toggle("last", !!state.last && state.last.q === i && a !== null);
    li.classList.toggle("cur", i === state.cur);
  }

  /*
   * Влияние ответа на вопрос по ключу теста (только шкалы из focus): в какие шкалы он засчитан,
   * либо что баллов не даёт и какой ответ дал бы. Не зависит от остальных ответов, поэтому
   * строка остаётся под вопросом, пока ответ не сняли или не сменили.
   */
  function keyEffect(i: number, a: Answer) {
    const keys = KEYS[i].filter((k) => FOCUS.has(k.scale));
    const mine = keys.filter((k) => k.answer === a).map((k) => k.scale);
    const other = keys.filter((k) => k.answer !== a).map((k) => k.scale);
    return { mine, other, alt: (a === "Y" ? "N" : "Y") as Answer };
  }

  function noScoreText(i: number, a: Answer) {
    if (a === "?") return "«Не знаю» баллов не даёт";
    const { other, alt } = keyEffect(i, a);
    return other.length
      ? `«${WORD[a]}» баллов не даёт (даёт «${WORD[alt]}»: ${other.join(", ")})`
      : "на отслеживаемые шкалы не влияет";
  }

  function questionImpactHtml(i: number) {
    const a = state.answers[i]!;
    if (a === "Y" || a === "N") {
      const { mine } = keyEffect(i, a);
      if (mine.length) {
        return `<span class="lead">«${WORD[a]}» дал:</span>` + mine.map((s) => `<span class="chip plus"><b>${s}</b><i>+1</i></span>`).join("");
      }
    }
    return `<span class="quiet">${noScoreText(i, a)}</span>`;
  }

  /*
   * Верхняя карточка: что сделал именно последний ответ. По каждой затронутой шкале — на сколько
   * изменились сырые баллы (или поправка K) и как сдвинулся Т-балл. Только шкалы из focus,
   * остальные затронутые шкалы перечислены мелко в конце.
   */
  function renderImpact() {
    const last = state.last;
    if (!last) {
      el.impact.className = "impact";
      el.impact.innerHTML = `<span class="impact-empty">Отметьте ответ: здесь покажется, какие шкалы он изменил и насколько.</span>`;
      return;
    }
    const i = last.q;
    const a = state.answers[i];
    const { before, after } = last;
    const ansBadge = a === null ? `<span class="ans none">снят</span>` : `<span class="ans ${a === "?" ? "dk" : a}">${WORD[a]}</span>`;

    const chips = last.changed.map((s) => {
      const dRaw = after.raw[s] - before.raw[s];
      const dT = after.t[s] - before.t[s];
      const down = dRaw < 0 || (dRaw === 0 && dT < 0);
      const what = dRaw !== 0 ? `${signed(dRaw, 0)} <small>сырых</small>` : "поправка K";
      return `<span class="imp-chip${down ? " minus" : ""}" title="${scaleLabel(s)}"><b>${s}</b>` +
        `<span class="d">${what}</span><span class="t">Т ${fmtT(before.t[s], before.extrapolated[s])} → ${fmtT(after.t[s], after.extrapolated[s])}</span></span>`;
    });

    const others = last.changedAll.filter((s) => !FOCUS.has(s));
    const more = others.length ? `<span class="imp-more">и ещё: ${others.join(", ")}</span>` : "";

    let body;
    if (chips.length) {
      body = `<span class="imp-label">Изменились:</span>${chips.join("")}${more}`;
    } else {
      const note = a === null ? "ответ снят, отслеживаемые шкалы не менялись" : noScoreText(i, a);
      body = `<span class="imp-note">Шкалы не изменились: ${note}</span>${more}`;
    }

    el.impact.className = "impact " + (chips.length ? "hit" : "miss");
    el.impact.innerHTML =
      `<div class="imp-q"><div class="imp-q-head">Вопрос ${i + 1} ${ansBadge}</div><div class="imp-q-text">${escapeHtml(def.questions[i])}</div></div>` +
      `<div class="imp-body">${body}</div>`;
  }

  function renderSheetCell(i: number) {
    const cell = el.sheetGrid.children[i] as HTMLElement;
    const a = state.answers[i];
    const st = cellState(state.history[i], a);
    cell.className = "cell st-" + st + (a === "Y" ? " a-Y" : a === "N" ? " a-N" : a === "?" ? " a-dk" : "");
    if (state.last && state.last.q === i) cell.classList.add("last");
    cell.querySelector("span")!.textContent = a ? LETTER[a] : "";
    const hist = state.history[i].map((v) => (v === null ? "снят" : LETTER[v])).join(" → ");
    cell.title = `Вопрос ${i + 1}` + (hist ? `: ${hist}` : ": без ответа");
  }

  function renderTable() {
    const changed = new Set(state.last ? state.last.changed : []);
    const rows = ORDER.map((s, idx) => {
      const t = profile.t[s];
      const lvl = profile.level[s];
      const corr = profile.corrected[s] !== profile.raw[s] || def.kCorrected.includes(s)
        ? ` <small title="с поправкой K">(${profile.corrected[s]})</small>` : "";
      let d = "";
      if (changed.has(s)) d = signed(t - state.last!.before.t[s], def.tDigits);
      const over = profile.validity.checks.some((c) => c.scale === s && c.exceeded);
      const cls = [changed.has(s) ? "changed" : "", idx === 3 ? "grp" : "", over ? "invalid" : "", FOCUS.has(s) ? "" : "other"].join(" ").trim();
      const lvlTxt = lvl && lvl !== "norm" ? `<span class="lvl">${levelWord[lvl]}</span>` : "";
      return `<tr class="${cls}" data-s="${s}"><td class="num t ${lvl ? "lv-" + lvl : ""}">${fmtT(t, profile.extrapolated[s])}${lvlTxt}</td>` +
        `<td class="num">${profile.raw[s]}${corr}</td><td class="name" title="${scaleLabel(s)}">${scaleLabel(s)}</td><td class="num d">${d}</td></tr>`;
    });
    if (DK) rows.push(`<tr class="dk grp"><td class="num t">—</td><td class="num">${profile.dontKnow}</td><td class="name">?: Ответ «Не знаю»</td><td></td></tr>`);
    if (profile.controlTotal) {
      rows.push(`<tr class="dk"><td class="num t">—</td><td class="num">${profile.controlCorrect}<small> из ${profile.controlTotal}</small></td>` +
        `<td class="name" title="Пункты «Номер данного пункта следует обвести кружочком»: правильно отвечать «Не знаю»">Контрольные пункты</td><td></td></tr>`);
    }
    el.scoreBody.innerHTML = rows.join("");
  }

  function renderValidity() {
    const v = profile.validity;
    const u = (c: { unit: string }) => (c.unit ? " " + c.unit : "");
    // По сырым баллам: «L 2 из 4»; по Т-баллам: «L 49 Т, до 70».
    const counts = v.checks.map((c) => (c.unit ? `${c.scale} ${c.value}${u(c)}, до ${c.limit}` : `${c.scale} ${c.value} из ${c.limit}`)).join(" · ");
    el.validity.classList.toggle("bad", !v.valid);
    if (v.valid) {
      el.validitySum.innerHTML = `<b>✓<span class="vt"> Достоверен</span></b><span class="v-counts">${counts}</span>`;
      el.validityBody.innerHTML = `<p>${def.validityRule} Сейчас ${v.checks.length > 2 ? "все" : "оба"} в пределах.</p>`;
      el.validity.open = false;
    } else {
      const bad = v.checks.filter((c) => c.exceeded);
      el.validitySum.innerHTML = `<b>✗<span class="vt"> Недостоверен</span></b><span class="v-counts">${bad.map((c) => `${c.scale} = ${c.value}${u(c)}, допустимо до ${c.limit}`).join(" · ")}</span>`;
      el.validityBody.innerHTML =
        bad.map((c) => `<p><b>${c.scale} = ${c.value}${u(c)}</b> (${def.scaleInfo[c.scale].name.toLowerCase()}, допустимо не больше ${c.limit}${u(c)}): ${c.reason}.</p>`).join("") +
        `<p>По методике ${def.title} при таком результате шкалы не интерпретируют, а тест проходят заново.</p>`;
    }
  }

  function renderStrip() {
    const changed = new Set(state.last ? state.last.changed : []);
    const cells = ORDER.map((s) => {
      const g = def.scaleInfo[s].group === "control" ? "ctrl" : "clin";
      const lvl = profile.level[s] ? "lv-" + profile.level[s] : "";
      const t = (profile.extrapolated[s] ? "≈" : "") + Math.round(profile.t[s]);
      const over = profile.validity.checks.some((c) => c.scale === s && c.exceeded) ? "invalid" : "";
      // Сдвиг Т после последнего ответа: красный — вверх, синий — вниз.
      let dt = "", dn = "";
      if (changed.has(s)) {
        const diff = profile.t[s] - state.last!.before.t[s];
        dt = `<em>${signed(diff, Math.min(def.tDigits, 1))}</em>`;
        if (diff < 0) dn = "dn";
      }
      return `<div class="sc ${g} ${lvl} ${over} ${dn} ${changed.has(s) ? "changed" : ""} ${FOCUS.has(s) ? "" : "other"}" title="${scaleLabel(s)}: Т ${t}, сырые с поправкой ${profile.corrected[s]}"><b>${s}</b>${dt}<span>${t}</span><small>${profile.corrected[s]}</small></div>`;
    });
    if (DK) cells.push(`<div class="sc other" title="Ответов «Не знаю»"><b>?</b><span>${profile.dontKnow}</span><small>&nbsp;</small></div>`);
    el.strip.style.setProperty("--n", String(cells.length));
    el.strip.innerHTML = cells.join("");
  }

  const viewData = () => ({ def, profile, changed: new Set(state.last ? state.last.changed : []), before: state.last ? state.last.before : null, focus: FOCUS });

  // Ширина графика в координатах SVG равна ширине колонки в пикселях: так подписи не сжимаются на узком экране.
  let chartW = 0;
  const chartWidthFor = (w: number) => Math.round(Math.min(800, Math.max(300, w)));
  function drawChart() {
    const w = el.chartWrap.clientWidth;
    chartW = w > 0 ? chartWidthFor(w) : 600;
    renderChart(el.chart, chartW, viewData());
  }

  function renderLayout() {
    el.layout.classList.toggle("no-side", !state.showProfile);
    el.sideOpen.hidden = state.showProfile;
    el.toggleProfile.setAttribute("aria-pressed", String(state.showProfile));
    el.toggleProfile.setAttribute("aria-expanded", String(state.showProfile));
    el.chartWrap.hidden = state.profileView === "table";
    el.tableWrap.hidden = state.profileView !== "table";
    el.bars.hidden = state.profileView !== "bars";
    el.chart.style.display = state.profileView === "chart" ? "" : "none";
    for (const b of el.viewButtons) {
      const on = b.dataset.view === state.profileView;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", String(on));
    }
    markTestSwitch(root, ctx.currentId);
    el.keyBtn.setAttribute("aria-pressed", String(state.keyMode));
    el.keyBtn.querySelector(".long")!.textContent = state.keyMode ? "Скрыть ключ" : "Показать ключ";
    el.keyBtn.querySelector(".short")!.textContent = "Ключ";
    document.body.classList.toggle("keymode", state.keyMode);
    for (const k of el.questions.querySelectorAll<HTMLElement>(".q-key")) k.hidden = !state.keyMode;
    updatePanelHeight();
    // Пока график был скрыт, его ширина была неизвестна: перерисовать сразу, не дожидаясь ResizeObserver.
    if (state.profileView === "chart" && el.chartWrap.clientWidth > 0 && chartWidthFor(el.chartWrap.clientWidth) !== chartW) drawChart();
  }

  function renderScores() {
    profile = profileOf(state.answers);
    renderTable();
    renderValidity();
    renderStrip();
    renderImpact();
    drawChart();
    renderBars(el.bars, viewData());
  }

  function renderAll() {
    for (let i = 0; i < N; i++) { renderQuestion(i); renderSheetCell(i); }
    renderScores();
    renderLayout();
  }

  // ---------- действия ----------
  function setAnswer(i: number, value: Answer, opts: { advance: boolean }) {
    const prev = state.answers[i];
    const next = prev === value ? null : value; // повторный клик снимает ответ
    const before = profileOf(state.answers);
    state.answers[i] = next;
    state.history[i].push(next);
    const after = profileOf(state.answers);
    const prevLast = state.last ? state.last.q : null;
    const changedAll = changedScales(def, before, after);
    state.last = { q: i, changed: changedAll.filter((s) => FOCUS.has(s)), changedAll, before, after };
    const prevCur = state.cur;
    state.cur = i;

    const toRender = new Set([i, prevCur]);
    if (prevLast !== null) toRender.add(prevLast);
    if (opts.advance && next !== null && i < N - 1) {
      state.cur = i + 1;
      toRender.add(i + 1);
    }
    for (const q of toRender) { renderQuestion(q); renderSheetCell(q); }
    renderScores();
    persist();
    if (opts.advance) scrollToQuestion(state.cur);
  }

  function setCur(i: number, scroll: boolean) {
    const prev = state.cur;
    state.cur = Math.max(0, Math.min(N - 1, i));
    renderQuestion(prev);
    renderQuestion(state.cur);
    if (scroll) scrollToQuestion(state.cur);
  }

  function scrollToQuestion(i: number, flash?: boolean) {
    const li = questionEl(i);
    const r = li.getBoundingClientRect();
    const top = Math.max(8, el.panel.getBoundingClientRect().bottom + 8);
    const room = window.innerHeight - top;
    if (r.top < top || r.bottom > window.innerHeight - 8 || flash) {
      const target = top + Math.max(0, (room - r.height) / 3);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollBy({ top: r.top - target, behavior: reduce ? "auto" : "smooth" });
    }
    if (flash) {
      li.classList.remove("flash");
      void li.offsetWidth;
      li.classList.add("flash");
    }
  }

  function updatePanelHeight() {
    const h = el.panel.getBoundingClientRect().height;
    // Высота липкой панели нужна боковой колонке (прилипает под ней) и отступу при прокрутке к вопросу.
    // На узком низком экране слишком высокая панель не прилипает, чтобы не закрывать вопросы.
    document.documentElement.style.setProperty("--panel-h", h + "px");
    const narrow = window.matchMedia("(max-width: 1000px)").matches;
    el.panel.classList.toggle("unstick", narrow && h > window.innerHeight * 0.45);
  }

  function resetAll() {
    if (!window.confirm(`Сбросить все ответы и историю ${def.title}?`)) return;
    state.answers = new Array<MaybeAnswer>(N).fill(null);
    state.history = Array.from({ length: N }, () => []);
    state.last = null;
    state.cur = 0;
    renderAll();
    persist();
    window.scrollTo({ top: 0 });
    toast("Результаты сброшены");
  }

  let toastTimer = 0;
  function toast(msg: string) {
    el.toast.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { el.toast.textContent = ""; }, 3000);
  }
  cleanups.push(() => clearTimeout(toastTimer));

  // ---------- события ----------
  function bind() {
    const on = <K extends keyof HTMLElementEventMap>(target: EventTarget, type: K | string, fn: (e: Event) => void) =>
      target.addEventListener(type, fn, { signal });

    on(el.questions, "click", (e) => {
      const t = e.target as Element;
      const li = t.closest<HTMLElement>(".q");
      if (!li) return;
      const i = Number(li.dataset.i);
      const b = t.closest<HTMLButtonElement>("button[data-a]");
      if (b) setAnswer(i, b.dataset.a as Answer, { advance: false });
      else setCur(i, false);
    });

    on(el.sheetGrid, "click", (e) => {
      const c = (e.target as Element).closest<HTMLElement>(".cell");
      if (!c) return;
      const i = Number(c.dataset.i);
      setCur(i, false);
      scrollToQuestion(i, true);
    });

    bindTestSwitch(root, ctx, signal);
    bindThemeButton(el.themeBtn, signal);
    on(el.keyBtn, "click", () => { state.keyMode = !state.keyMode; renderLayout(); persist(); });
    for (const b of el.viewButtons) on(b, "click", () => { state.profileView = b.dataset.view as ProfileView; renderLayout(); persist(); });
    on(el.toggleProfile, "click", () => { state.showProfile = !state.showProfile; renderLayout(); persist(); });
    on(el.sideOpen, "click", () => { state.showProfile = true; renderLayout(); persist(); });
    on(el.sideClose, "click", () => { state.showProfile = false; renderLayout(); persist(); });
    // При смене ширины (поворот телефона, окно) возвращаемся к умолчанию: справа колонка, на узком экране шторка закрыта.
    on(WIDE, "change", () => { state.showProfile = WIDE.matches; renderLayout(); });
    on(el.resetBtn, "click", resetAll);
    // Пояснение к достоверности открывается поверх вопросов — закрываем его кликом мимо.
    on(document, "click", (e) => { if (el.validity.open && !el.validity.contains(e.target as Node)) el.validity.open = false; });

    on(document, "keydown", (ev) => {
      const e = ev as KeyboardEvent;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "Escape" && el.validity.open) { el.validity.open = false; return; }
      if (e.code === "Escape" && !WIDE.matches && state.showProfile) { state.showProfile = false; renderLayout(); return; }
      const tag = ((e.target as Element).tagName || "").toLowerCase();
      if (tag === "select" || tag === "textarea" || tag === "input") return;
      const code = e.code;
      let answer: Answer | null = null;
      if (code === "Digit1" || code === "Numpad1" || code === "KeyY") answer = "Y";
      else if (code === "Digit2" || code === "Numpad2" || code === "KeyN") answer = "N";
      else if (DK && (code === "Digit3" || code === "Numpad3" || code === "Slash")) answer = "?";
      if (answer) {
        e.preventDefault();
        setAnswer(state.cur, answer, { advance: true });
        return;
      }
      if (code === "Digit0" || code === "Numpad0" || code === "Backspace" || code === "Delete") {
        const current = state.answers[state.cur];
        if (current !== null) {
          e.preventDefault();
          setAnswer(state.cur, current, { advance: false });
        }
        return;
      }
      if (code === "ArrowDown" || code === "KeyJ") { e.preventDefault(); setCur(state.cur + 1, true); }
      else if (code === "ArrowUp" || code === "KeyK") { e.preventDefault(); setCur(state.cur - 1, true); }
    });

    if ("ResizeObserver" in window) {
      const panelObserver = new ResizeObserver(updatePanelHeight);
      panelObserver.observe(el.panel);
      const chartObserver = new ResizeObserver(() => {
        const w = el.chartWrap.clientWidth;
        if (w > 0 && chartWidthFor(w) !== chartW) drawChart();
      });
      chartObserver.observe(el.chartWrap);
      cleanups.push(() => { panelObserver.disconnect(); chartObserver.disconnect(); });
    }
    on(window, "resize", updatePanelHeight);
  }

  buildQuestions();
  buildSheet();
  restore();
  bind();
  renderAll();

  return () => {
    abort.abort();
    for (const fn of cleanups) fn();
    document.body.classList.remove("keymode");
    root.innerHTML = "";
  };
}
