/*
 * Экран теста Люшера целиком: шапка, блок логики, текущий шаг и результат. Работает с любым LuscherDef.
 * Модель — ../model.ts, части экрана — соседние файлы; здесь связка «событие → модель → перерисовка».
 */
import { bindHeader, buttonHtml, headerHtml, keyButton, setPressed } from "../../../app/header";
import { byId } from "../../../app/html";
import { createScope } from "../../../app/scope";
import { createSaver, readJson, readString, writeString } from "../../../app/storage";
import type { AppContext, Unmount } from "../../../app/types";
import { currentStep } from "../flow";
import { derive, emptySession, layoutFor, loadSaved, toSaved, type Saved } from "../model";
import type { LuscherDef } from "../types";
import { guideHtml } from "./guide";
import { progressHtml, resultsHtml } from "./results";
import { stageHtml } from "./stage";

/** Раскрыт ли блок логики — общий для обоих вариантов теста. */
const GUIDE_KEY = "luscher-guide";

function layoutHtml(ctx: AppContext): string {
  const header = headerHtml(ctx, {
    cls: "lu-panel",
    actions: [
      buttonHtml(keyButton()),
      buttonHtml({ id: "undoBtn", label: "← Назад", short: "←", cls: "btn-ghost", title: "Отменить последний выбор (Backspace)" })
    ],
    resetTitle: "Начать заново",
    below: `<div class="lu-progress" id="luProgress"></div>`
  });
  return `${header}
  <main class="wrap lu-main">
    <div class="lu-left">
      <details class="lu-guide" id="luGuide"></details>
      <section class="lu-stage" id="luStage" aria-live="polite"></section>
    </div>
    <section class="lu-results" id="luResults" aria-label="Результат"></section>
  </main>`;
}

export function mountLuscher(def: LuscherDef, root: HTMLElement, ctx: AppContext): Unmount {
  const V = def.variant;
  const scope = createScope();
  let session = loadSaved(V, readJson<Saved>(def.storageKey));
  const saver = createSaver(def.storageKey, () => toSaved(session));
  scope.add(saver.flush);
  scope.on(window, "pagehide", saver.flush);

  root.innerHTML = layoutHtml(ctx);
  const stageEl = byId(root, "luStage"), resultsEl = byId(root, "luResults"), progressEl = byId(root, "luProgress");
  const keyBtn = byId(root, "keyBtn"), undoBtn = byId<HTMLButtonElement>(root, "undoBtn");
  bindHeader(root, ctx, scope);

  // Логика теста: свёрнута, пока её не раскрыли.
  const guide = byId<HTMLDetailsElement>(root, "luGuide");
  guide.innerHTML = guideHtml(def);
  guide.open = readString(GUIDE_KEY) === "open";
  scope.on(guide, "toggle", () => writeString(GUIDE_KEY, guide.open ? "open" : "closed"));

  function render() {
    const d = derive(V, session.log);
    const hadLayout = d.step ? d.step.id in session.layouts : true;
    const layout = d.step?.kind === "rank" ? layoutFor(session, d.step) : null;
    if (!hadLayout && layout) saver.schedule(); // новая случайная раскладка — запомнить
    setPressed(keyBtn, session.keyMode, { on: "Скрыть ключ", off: "Показать ключ" });
    undoBtn.disabled = session.log.length === 0;
    progressEl.innerHTML = progressHtml(def, d);
    stageEl.innerHTML = stageHtml(def, d, session.keyMode, layout);
    resultsEl.innerHTML = resultsHtml(def, d);
  }

  function choose(value: number) {
    const step = currentStep(V, session.log);
    if (!step) return;
    session.log.push({ step: step.id, value });
    saver.schedule();
    render();
  }

  function undo() {
    if (!session.log.length) return;
    session.log.pop();
    saver.schedule();
    render();
  }

  scope.on(stageEl, "click", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-v], [data-go]");
    if (el) choose(el.hasAttribute("data-go") ? 0 : Number(el.dataset.v));
  });
  scope.on(keyBtn, "click", () => {
    session.keyMode = !session.keyMode;
    saver.schedule();
    render();
  });
  scope.on(undoBtn, "click", undo);
  scope.on(byId(root, "resetBtn"), "click", () => {
    if (session.log.length && !window.confirm("Начать тест заново? Все выборы будут удалены.")) return;
    session = emptySession(session.keyMode);
    saver.schedule();
    render();
  });

  scope.on(document, "keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (e.key === "Backspace") {
      e.preventDefault();
      undo();
      return;
    }
    const step = currentStep(V, session.log);
    if (!step) return;
    if (step.kind === "pause" && e.key === "Enter") {
      e.preventDefault();
      choose(0);
    } else if (/^[1-9]$/.test(e.key)) {
      // Номер — место карточки в ряду, включая уже выбранные (они остаются пустыми местами).
      const slots = [...stageEl.querySelectorAll<HTMLElement>(".lu-cards > *, .lu-figs > .lu-fig")];
      const el = slots[Number(e.key) - 1];
      if (el?.dataset.v !== undefined) {
        e.preventDefault();
        choose(Number(el.dataset.v));
      }
    }
  });

  render();

  return () => {
    scope.dispose();
    root.innerHTML = "";
  };
}
