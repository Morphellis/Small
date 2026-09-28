/*
 * Экран теста Люшера: шапка (переключатель тестов, ключ, «Назад», тема, сброс), текущий шаг с карточками
 * и результат, который пересчитывается после каждого выбора. Работает с любым LuscherDef.
 */
import { escapeHtml } from "../../app/html";
import { readJson, readString, writeJson, writeString } from "../../app/storage";
import { bindTestSwitch, testSwitchHtml } from "../../app/testSwitch";
import { bindThemeButton } from "../../app/theme";
import type { AppContext, Unmount } from "../../app/types";
import {
  ACHROMATIC, ACHROMATIC_LAYOUT, COLOR, FIGURE_GRID, PAIR_LINES, PAIR_TABLES,
  achromaticOrder, currentStep, hintFor, isDislikePhase, need, pairWins, picksByStep,
  rankOrder, shuffledColors, steps, type Pick, type Step
} from "./flow";
import {
  ANXIETY_BANDS, MAX_ANXIETY_ORDER, anxiety, anxietyMarks, bandOf, deviation, vegetative, vegetativeBand, vegetativeText
} from "./scoring";
import type { LuscherDef } from "./types";

interface State {
  log: Pick[];
  /** Раскладка восьми цветов на шагах выбора (случайная, запоминается). */
  layouts: Record<string, number[]>;
  keyMode: boolean;
}

interface Saved {
  log?: unknown;
  layouts?: unknown;
  keyMode?: unknown;
}

const MARKS = ["", "!", "!!", "!!!"];
const GUIDE_KEY = "luscher-guide";

/** Фигуры 0–6: простые формы в оттенках серого. */
const FIGURES: Record<number, string> = {
  0: `<circle cx="50" cy="50" r="38"/>`,
  1: `<rect x="14" y="14" width="72" height="72"/>`,
  2: `<polygon points="50,10 90,84 10,84"/>`,
  3: `<polygon points="50,8 61,38 93,38 67,57 77,89 50,70 23,89 33,57 7,38 39,38"/>`,
  4: `<polygon points="50,8 88,50 50,92 12,50"/>`,
  5: `<polygon points="36,10 64,10 64,36 90,36 90,64 64,64 64,90 36,90 36,64 10,64 10,36 36,36"/>`,
  6: `<polygon points="27,12 73,12 94,50 73,88 27,88 6,50"/>`
};

function stepTitle(def: LuscherDef, step: Step): string {
  switch (step.kind) {
    case "achromatic": return "Ахроматические цвета";
    case "rank": return def.variant === "short" ? `Выбор ${step.n}` : `Восьмицветовой ряд, выбор ${step.n}`;
    case "pause": return "Перерыв";
    case "pairs": {
      const t = PAIR_TABLES.find((x) => x.table === step.table)!;
      return `Таблица ${step.table}: ${t.title}${step.round === 2 ? " (повтор)" : ""}`;
    }
    case "figures": return "Фигуры";
  }
}

function question(def: LuscherDef, step: Step, k: number): string {
  const dislike = isDislikePhase(def.variant, step, k);
  const word = dislike ? "<b>неприятен</b>" : "<b>симпатичен</b>";
  switch (step.kind) {
    case "achromatic":
      return k === 0 ? `Какой из этих пяти цветов вам наиболее ${word}?` : `Какой из оставшихся цветов вам наиболее ${word}?`;
    case "rank":
      return k === 0 ? `Какой из этих восьми цветов вам наиболее ${word}?` : `Какой из оставшихся цветов вам наиболее ${word}?`;
    case "pairs":
      return `Какой из этих двух цветов вам более <b>симпатичен</b>? <span class="lu-count">Пара ${k + 1} из 6</span>`;
    case "figures":
      return dislike ? `Выберите две <b>несимпатичные</b> вам фигуры (${k - 1} из 2).` : `Выберите две <b>симпатичные</b> вам фигуры (${k + 1} из 2).`;
    case "pause":
      return "";
  }
}

const swatch = (c: number, extra = "") =>
  `<span class="lu-sw${COLOR[c].dark ? " lt" : ""}${extra}" style="--c:${COLOR[c].hex}" title="${escapeHtml(COLOR[c].name)}"></span>`;

const sws = (list: number[]) => `<span class="lu-sws">${list.map((c) => swatch(c, " sm")).join("")}</span>`;

/** Краткая логика: от чего растёт тревожность. Показывается над шагом, сворачивается. */
function guideHtml(def: LuscherDef): string {
  return `
    <summary><b>Как поднять тревожность</b> <span>— логика, а не заучивание</span></summary>
    <div class="lu-guide-body">
      <p>Показатель тревожности (0–12) — это восклицательные знаки за цвета «не на своём месте» в ряду из восьми:</p>
      <ul>
        <li><b>Основные цвета</b> ${sws([1, 2, 3, 4])} (синий, зелёный, красный, жёлтый) — это «здоровые» потребности. Отодвинули в конец — тревога:
          6-е место <b>+1</b>, 7-е <b>+2</b>, 8-е <b>+3</b>.</li>
        <li><b>Тёмные цвета</b> ${sws([7, 0, 6])} (чёрный, серый, коричневый) — отрицание, усталость, уход. Поставили в начало — тревога:
          1-е место <b>+3</b>, 2-е <b>+2</b>, 3-е <b>+1</b>.</li>
        <li><b>Фиолетовый</b> ${sws([5])} на тревожность не влияет — его место в середине (4–5-е).</li>
      </ul>
      <p><b>Максимум 12</b> = три тёмных в самом начале (3 + 2 + 1) и три основных в самом конце (1 + 2 + 3).
        Четвёртый основной цвет и фиолетовый — в середину. Снизить тревожность — наоборот: основные вперёд, тёмные назад.</p>
      <p>Какой именно тёмный первым, а какой основной последним, на тревожность не влияет, но ключ берёт порядок
        ${sws([7, 0, 6, 1, 5, 2, 4, 3])} — это перевёрнутая «норма спокойного человека» ${sws([3, 4, 2, 5, 1, 6, 0, 7])},
        поэтому заодно максимальны отклонение от нормы (32) и усталость по вегетативному коэффициенту.</p>
      <p>Итог считается <b>по второму выбору</b>, но первый лучше делать так же — два разных ряда выглядят как непоследовательность.</p>${def.variant === "full" ? `
      <p><b>В полном тесте</b> после пяти симпатичных цветов спрашивают <b>неприятные</b>: самый неприятный уходит на 8-е место, следующий — на 7-е.
        Значит, первым «неприятным» выбирайте красный ${sws([3])}, вторым — жёлтый ${sws([4])}; оставшийся зелёный встанет на 6-е.
        Ахроматические цвета, таблицы пар и фигуры на тревожность не влияют.</p>` : ""}
    </div>`;
}

function layoutHtml(ctx: AppContext): string {
  return `
  <header class="panel lu-panel"><div class="wrap">
    <div class="panel-head">
      ${testSwitchHtml(ctx)}
      <span class="spacer"></span>
      <button type="button" class="btn btn-key" id="luKey" aria-pressed="false"><span class="long">Показать ключ</span><span class="short">Ключ</span></button>
      <button type="button" class="btn btn-ghost" id="luUndo" title="Отменить последний выбор (Backspace)"><span class="long">← Назад</span><span class="short">←</span></button>
      <button type="button" class="btn btn-theme" id="luTheme" aria-label="Переключить тему"></button>
      <button type="button" class="btn btn-reset" id="luReset" title="Начать заново" aria-label="Начать заново"><span class="long">Сбросить</span><span class="short">↺</span></button>
    </div>
    <div class="lu-progress" id="luProgress"></div>
  </div></header>
  <main class="wrap lu-main">
    <div class="lu-left">
      <details class="lu-guide" id="luGuide"></details>
      <section class="lu-stage" id="luStage" aria-live="polite"></section>
    </div>
    <section class="lu-results" id="luResults" aria-label="Результат"></section>
  </main>`;
}

export function mountLuscher(def: LuscherDef, root: HTMLElement, ctx: AppContext): Unmount {
  const abort = new AbortController();
  const { signal } = abort;
  const V = def.variant;

  const saved = readJson<Saved>(def.storageKey) ?? {};
  const state: State = {
    log: Array.isArray(saved.log)
      ? (saved.log as Pick[]).filter((p) => p && typeof p.step === "string" && Number.isInteger(p.value))
      : [],
    layouts: saved.layouts && typeof saved.layouts === "object" ? (saved.layouts as Record<string, number[]>) : {},
    keyMode: saved.keyMode === true
  };
  // Журнал из старой версии мог не подойти к шагам — отбрасываем всё, что не ложится по порядку.
  state.log = replayValid(state.log);

  root.innerHTML = layoutHtml(ctx);
  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>("#" + id)!;
  const stageEl = $("luStage"), resultsEl = $("luResults"), progressEl = $("luProgress");
  const keyBtn = $("luKey"), undoBtn = $<HTMLButtonElement>("luUndo");

  bindTestSwitch(root, ctx, signal);
  bindThemeButton($("luTheme"), signal);

  // Логика теста: раскрыта, пока её не свернули (запоминается для обоих вариантов).
  const guide = $<HTMLDetailsElement>("luGuide");
  guide.innerHTML = guideHtml(def);
  guide.open = readString(GUIDE_KEY) !== "closed";
  guide.addEventListener("toggle", () => writeString(GUIDE_KEY, guide.open ? "open" : "closed"), { signal });

  function replayValid(log: Pick[]): Pick[] {
    const ok: Pick[] = [];
    for (const p of log) {
      const s = currentStep(V, ok);
      if (!s || s.id !== p.step) break;
      ok.push(p);
    }
    return ok;
  }

  const save = () => writeJson(def.storageKey, { log: state.log, layouts: state.layouts, keyMode: state.keyMode });

  function layoutFor(step: Step): number[] {
    if (!state.layouts[step.id] || state.layouts[step.id].length !== 8) {
      state.layouts[step.id] = shuffledColors();
      save();
    }
    return state.layouts[step.id];
  }

  function choose(step: Step, value: number) {
    state.log.push({ step: step.id, value });
    save();
    render();
  }

  function undo() {
    if (!state.log.length) return;
    state.log.pop();
    save();
    render();
  }

  /* ---------- текущий шаг ---------- */

  function renderStage() {
    const step = currentStep(V, state.log);
    const all = steps(V, state.log);
    if (!step) {
      stageEl.innerHTML = `<div class="lu-done"><b>Тест пройден.</b> Итог — в блоке «Результат». Чтобы пройти ещё раз, нажмите «Сбросить».</div>`;
      return;
    }
    const by = picksByStep(state.log);
    const picks = by[step.id] ?? [];
    const k = picks.length;
    const idx = all.findIndex((s) => s.id === step.id) + 1;
    const hint = state.keyMode ? hintFor(V, step, k) : null;

    let note = "";
    if (state.keyMode) {
      note = hint !== null
        ? `<p class="lu-note key">Ключ: выберите отмеченный цвет — <b>${escapeHtml(COLOR[hint].name)}</b>.</p>`
        : step.kind === "pause"
          ? ""
          : `<p class="lu-note">На тревожность этот шаг не влияет — выбирайте как угодно.</p>`;
    }

    let body = "";
    if (step.kind === "pause") {
      body = `
        <div class="lu-pause">
          <p>Методика предполагает два подхода с небольшим перерывом.</p>
          <p>Подождите пару минут и нажмите «Продолжить». Не старайтесь ни повторить первый порядок, ни специально его изменить — выбирайте так, будто видите цвета впервые.</p>
          <button type="button" class="btn lu-go" data-go>Продолжить тест</button>
        </div>`;
    } else if (step.kind === "rank") {
      body = cardsHtml(layoutFor(step).map((c) => ({ value: c, color: c, gone: picks.includes(c), hint: c === hint })), "lu-row8");
    } else if (step.kind === "achromatic") {
      body = cardsHtml(ACHROMATIC_LAYOUT.map((id) => ({ value: id, color: ACHROMATIC[id], gone: picks.includes(id), hint: false })), "lu-row5");
    } else if (step.kind === "pairs") {
      const t = PAIR_TABLES.find((x) => x.table === step.table)!;
      const [a, b] = PAIR_LINES[k];
      body = cardsHtml([a, b].map((n) => ({ value: n, color: t.colors[n - 1], gone: false, hint: false })), "lu-row2");
    } else if (step.kind === "figures") {
      body = `<div class="lu-figs">${FIGURE_GRID.map((row) => row.map((f) =>
        f === null ? `<span></span>` : picks.includes(f) ? `<span class="lu-fig gone"></span>` :
          `<button type="button" class="lu-fig" data-v="${f}" aria-label="Фигура ${f + 1}"><svg viewBox="0 0 100 100">${FIGURES[f]}</svg></button>`
      ).join("")).join("")}</div>`;
    }

    const chosen = step.kind === "rank" || step.kind === "achromatic"
      ? `<div class="lu-chosen">${picks.map((c, i) => `<span class="lu-chip${isDislikePhase(V, step, i) ? " dis" : ""}">${
          swatch(step.kind === "achromatic" ? ACHROMATIC[c] : c)}</span>`).join("")}</div>`
      : "";

    stageEl.innerHTML = `
      <div class="lu-step-head"><span class="lu-step-no">Шаг ${idx} из ${all.length}</span><h2>${escapeHtml(stepTitle(def, step))}</h2></div>
      ${step.kind === "pause" ? "" : `<p class="lu-ask${isDislikePhase(V, step, k) ? " dis" : ""}">${question(def, step, k)}</p>`}
      ${note}
      ${body}
      ${chosen}
      <p class="keys-hint">Клавиши: <kbd>1</kbd>, <kbd>2</kbd>… — карточка по порядку · <kbd>Backspace</kbd> отменить выбор${step.kind === "pause" ? " · <kbd>Enter</kbd> продолжить" : ""}</p>`;
  }

  function cardsHtml(cards: { value: number; color: number; gone: boolean; hint: boolean }[], cls: string): string {
    return `<div class="lu-cards ${cls}">${cards.map((c) =>
      c.gone
        ? `<span class="lu-card gone"></span>`
        : `<button type="button" class="lu-card${COLOR[c.color].dark ? " lt" : ""}${c.hint ? " hint" : ""}" data-v="${c.value}" style="--c:${COLOR[c.color].hex}" aria-label="${escapeHtml(COLOR[c.color].name)}"></button>`
    ).join("")}</div>`;
  }

  /* ---------- прогресс и результат ---------- */

  function renderProgress() {
    const by = picksByStep(state.log);
    const cur = currentStep(V, state.log);
    progressEl.innerHTML = steps(V, state.log).map((s) => {
      const n = by[s.id]?.length ?? 0;
      const done = n >= need(s);
      const cls = done ? "done" : s.id === cur?.id ? "cur" : "";
      const short = s.kind === "rank" ? `Выбор ${s.n}` : s.kind === "pairs" ? `Т${s.table}${s.round === 2 ? "′" : ""}` :
        s.kind === "achromatic" ? "Ахром." : s.kind === "figures" ? "Фигуры" : "Пауза";
      return `<span class="lu-pstep ${cls}" title="${escapeHtml(stepTitle(def, s))}">${short}</span>`;
    }).join("");
    const main = mainOrder();
    const a = main ? anxiety(main.order) : null;
    progressEl.innerHTML += `<span class="spacer"></span><span class="lu-anx-mini${a === null ? "" : " t-" + bandOf(ANXIETY_BANDS, a).tone}">Тревожность: <b>${a ?? "—"}</b>${a === null ? "" : "<small> / 12</small>"}</span>`;
    undoBtn.disabled = state.log.length === 0;
  }

  /** Раскладка, по которой считается итог: второй выбор (как у psytests), пока его нет — первый. */
  function mainOrder(): { order: string; n: 1 | 2 } | null {
    const by = picksByStep(state.log);
    const second = rankOrder(V, by.rank2 ?? []);
    if (second) return { order: second, n: 2 };
    const first = rankOrder(V, by.rank1 ?? []);
    return first ? { order: first, n: 1 } : null;
  }

  function orderRow(label: string, order: string | null): string {
    if (!order) return `<tr><th>${label}</th><td colspan="9" class="lu-empty">ещё не сделан</td></tr>`;
    const marks = anxietyMarks(order);
    return `<tr><th>${label}</th>${[...order].map((c, i) =>
      `<td><span class="lu-mark">${MARKS[marks[i]]}</span>${swatch(Number(c))}</td>`
    ).join("")}<td class="lu-sum">${anxiety(order)}</td></tr>`;
  }

  function renderResults() {
    const by = picksByStep(state.log);
    const o1 = rankOrder(V, by.rank1 ?? []), o2 = rankOrder(V, by.rank2 ?? []);
    const main = mainOrder();
    let html = `<h2>Результат</h2>`;

    if (main) {
      const a = anxiety(main.order);
      const band = bandOf(ANXIETY_BANDS, a);
      const co = deviation(main.order);
      const vk = vegetative(main.order);
      const vb = vegetativeBand(vk);
      html += `
        <div class="lu-score t-${band.tone}">
          <div class="lu-score-head"><span>Показатель тревожности</span><b>${a}</b><small>из 12</small></div>
          <div class="lu-gauge">${ANXIETY_BANDS.map((b) =>
            `<span class="g-${b.tone}" style="flex:${b.to - b.from + 1}"></span>`).join("")}<i style="left:${(a / 12) * 100}%"></i></div>
          <div class="lu-gauge-lbl"><span>0</span><span>3</span><span>7</span><span>11</span><span>12</span></div>
          <p class="lu-band">${escapeHtml(band.label)}${main.n === 1 ? " · <small>предварительно, по первому выбору; итог считается по второму</small>" : ""}</p>
        </div>
        <div class="lu-extra">
          <div><span>Совокупное отклонение от аутогенной нормы</span><b>${co}</b><small>из 32 — чем больше, тем выше непродуктивная напряжённость</small></div>
          <div><span>Вегетативный коэффициент</span><b>${vegetativeText(main.order)}</b><small>${escapeHtml(vb.label)}</small></div>
        </div>`;
    } else {
      html += `<p class="lu-empty">Показатель тревожности появится после первого восьмицветового выбора.</p>`;
    }

    html += `
      <h3>Разметка выборов</h3>
      <div class="lu-scroll"><table class="lu-marks">
        <thead><tr><th></th>${[1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<th>${i}</th>`).join("")}<th title="Тревожность">!</th></tr></thead>
        <tbody>${orderRow("Выбор 1", o1)}${orderRow("Выбор 2", o2)}</tbody>
      </table></div>
      <p class="lu-small">«!» — тревожность: основной цвет (синий, зелёный, красный, жёлтый) на 6–8-м месте или серый, коричневый, чёрный на 1–3-м.
      Итоговый показатель — по второму выбору. Наибольшая тревожность (12) — у раскладки ${[...MAX_ANXIETY_ORDER].map((c) => swatch(Number(c), " sm")).join("")}.</p>`;

    if (V === "full") html += protocolHtml(by);

    resultsEl.innerHTML = html;
  }

  function protocolHtml(by: Record<string, number[]>): string {
    const rows: string[] = [];
    const ach = achromaticOrder(by.achromatic ?? []);
    if (ach) rows.push(`<tr><th>Ахроматические</th><td>${ach.map((id, i) => swatch(ACHROMATIC[id], i < 2 ? " plus" : i > 2 ? " minus" : "")).join("")}</td></tr>`);
    for (const s of steps(V, state.log)) {
      if (s.kind !== "pairs" || (by[s.id]?.length ?? 0) < 6) continue;
      const t = PAIR_TABLES.find((x) => x.table === s.table)!;
      const wins = pairWins(by[s.id]);
      const ranked = [0, 1, 2, 3].sort((a, b) => Number(wins[b]) - Number(wins[a]));
      rows.push(`<tr><th>Таблица ${s.table}${s.round === 2 ? " (повтор)" : ""}</th><td>${ranked.map((i) =>
        `<span class="lu-win">${swatch(t.colors[i])}<small>${wins[i]}</small></span>`).join("")}</td></tr>`);
    }
    const f = by.figures ?? [];
    if (f.length === 4) {
      const fig = (n: number, cls: string) => `<span class="lu-fig-sm ${cls}"><svg viewBox="0 0 100 100">${FIGURES[n]}</svg></span>`;
      rows.push(`<tr><th>Фигуры</th><td>${fig(f[0], "plus")}${fig(f[1], "plus")}<span class="lu-sep"></span>${fig(f[2], "minus")}${fig(f[3], "minus")}</td></tr>`);
    }
    if (!rows.length) return "";
    return `<h3>Протокол</h3><table class="lu-proto"><tbody>${rows.join("")}</tbody></table>
      <p class="lu-small">Эти шаги на показатель тревожности не влияют; в таблицах рядом с цветом — число его побед в парах.</p>`;
  }

  function render() {
    keyBtn.setAttribute("aria-pressed", String(state.keyMode));
    renderProgress();
    renderStage();
    renderResults();
  }

  /* ---------- события ---------- */

  stageEl.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-v], [data-go]");
    const step = currentStep(V, state.log);
    if (!el || !step) return;
    if (el.hasAttribute("data-go")) choose(step, 0);
    else choose(step, Number(el.dataset.v));
  }, { signal });

  keyBtn.addEventListener("click", () => {
    state.keyMode = !state.keyMode;
    save();
    render();
  }, { signal });

  undoBtn.addEventListener("click", undo, { signal });

  $("luReset").addEventListener("click", () => {
    if (state.log.length && !confirm("Начать тест заново? Все выборы будут удалены.")) return;
    state.log = [];
    state.layouts = {};
    save();
    render();
  }, { signal });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (e.key === "Backspace") {
      e.preventDefault();
      undo();
      return;
    }
    const step = currentStep(V, state.log);
    if (!step) return;
    if (step.kind === "pause" && e.key === "Enter") {
      e.preventDefault();
      choose(step, 0);
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
      const buttons = [...stageEl.querySelectorAll<HTMLElement>(".lu-cards [data-v], .lu-figs [data-v]")];
      // Номер — место карточки в ряду, включая уже выбранные (они остаются пустыми местами).
      const slots = [...stageEl.querySelectorAll<HTMLElement>(".lu-cards > *, .lu-figs > .lu-fig")];
      const el = slots[Number(e.key) - 1];
      if (el && buttons.includes(el)) {
        e.preventDefault();
        choose(step, Number(el.dataset.v));
      }
    }
  }, { signal });

  render();

  return () => {
    abort.abort();
    root.innerHTML = "";
  };
}
