/*
 * Экран опросника целиком: разметка, состояние, события. Работает с любым QuestionnaireSpec.
 *
 * Состояние и его изменения — в ../model.ts (без DOM), части экрана — в соседних файлах, здесь только связка:
 * событие → изменить модель → перерисовать то, что изменилось. Баллы считает сервер: ответ отмечается сразу,
 * а профиль обновляется, когда придёт расчёт (createSync). Всё подписанное живёт в Scope и снимается
 * при переходе на другой тест.
 */
import { api, createSync } from "../../../app/api";
import { byId } from "../../../app/html";
import { setPressed, bindHeader } from "../../../app/header";
import { reducedMotion, tween } from "../../../app/motion";
import { createScope } from "../../../app/scope";
import { createSaver, readJson } from "../../../app/storage";
import type { AppContext, Unmount } from "../../../app/types";
import { encodeAnswers } from "../answers";
import { applyAnswer, emptySession, lastAnswer, loadSaved, toSaved, type LastAnswer, type ProfileView, type Saved } from "../model";
import type { Answer, KeysResponse, Profile, QuestionnaireSpec, ScoreResponse } from "../types";
import { createViewCtx, setKeys } from "./context";
import { layoutHtml } from "./layout";
import { fitValidityBody, renderImpact, renderStrip, renderValidity, type ValidityEls } from "./panel";
import { renderTable } from "./profileTable";
import { renderBars, renderChart, type ProfileViewData } from "./profileViews";
import { applyKeys, buildQuestions, renderQuestion } from "./questions";
import { buildSheet, renderSheetCell } from "./sheet";

const KEY_ANSWER: Record<string, Answer> = { Digit1: "Y", Numpad1: "Y", KeyY: "Y", Digit2: "N", Numpad2: "N", KeyN: "N", Digit3: "?", Numpad3: "?", Slash: "?" };

export function mountQuestionnaire(def: QuestionnaireSpec, root: HTMLElement, ctx: AppContext): Unmount {
  const v = createViewCtx(def);
  const scope = createScope();
  const WIDE = window.matchMedia("(min-width: 1001px)");
  const NARROW = window.matchMedia("(max-width: 1000px)");

  root.innerHTML = layoutHtml(ctx, v.dk);
  const el = {
    panel: byId(root, "panel"),
    layout: byId(root, "layout"),
    impact: byId(root, "impact"),
    strip: byId(root, "strip"),
    chartWrap: byId(root, "chartWrap"),
    chart: byId<SVGSVGElement>(root, "chart"),
    bars: byId(root, "bars"),
    tableWrap: byId(root, "tableWrap"),
    scoreBody: byId(root, "scoreBody"),
    viewButtons: [...root.querySelectorAll<HTMLButtonElement>(".view-switch button")],
    keyBtn: byId(root, "keyBtn"),
    toggleProfile: byId(root, "toggleProfile"),
    side: byId(root, "side"),
    sideOpen: byId(root, "sideOpen"),
    toast: byId(root, "toast"),
    questions: byId(root, "questions"),
    sheetGrid: byId(root, "sheetGrid")
  };
  const validity: ValidityEls = { root: byId<HTMLDetailsElement>(root, "validity"), summary: byId(root, "validitySum"), body: byId(root, "validityBody") };

  // ---------- состояние ----------
  const loaded = loadSaved(def, readJson<Saved>(def.storageKey), WIDE.matches);
  let session = loaded.session;
  const prefs = loaded.prefs;
  /** Последний расчёт сервера; null — ещё не пришёл. */
  let profile: Profile | null = null;
  /** Что изменил последний ответ (по двум расчётам сервера). */
  let last: LastAnswer | null = null;
  /** На какой вопрос ответили последним — подсвечивается сразу, не дожидаясь сервера. */
  let lastQ: number | null = null;
  let cur = 0;
  /** Перешли к следующему вопросу клавишей — после расчёта проверить, что он не ушёл под выросшую шапку. */
  let followCur = false;

  const saver = createSaver(def.storageKey, () => toSaved(session, prefs, WIDE.matches));
  scope.add(saver.flush);
  scope.on(window, "pagehide", saver.flush);

  const questionEl = (i: number) => el.questions.children[i] as HTMLElement;
  const sheetCell = (i: number) => el.sheetGrid.children[i] as HTMLElement;

  // ---------- отрисовка ----------
  function renderRow(i: number) {
    const a = session.answers[i];
    const isLast = lastQ === i;
    renderQuestion(v, questionEl(i), i, a, { cur: i === cur, last: isLast });
    renderSheetCell(sheetCell(i), i, a, session.history[i], isLast);
  }

  /*
   * Подробный профиль рисуется только тот вид, который виден, и только если профиль поменялся с прошлого раза:
   * скрытые таблица, полосы и график не пересчитываются на каждый ответ.
   */
  let version = 0;
  const drawn: Record<ProfileView, number> = { table: -1, bars: -1, chart: -1 };
  let chartW = 0;
  const chartWidthFor = (w: number) => Math.round(Math.min(800, Math.max(300, w)));
  const viewData = (): ProfileViewData => ({ def, profile: profile!, changed: new Set(last ? last.changed : []), before: last ? last.before : null, focus: v.focus });

  /*
   * Точки графика не прыгают, а за 350 мс доезжают до нового профиля. chartT — что нарисовано сейчас
   * (в том числе посреди анимации), чтобы новый ответ во время анимации продолжил движение с того же места.
   */
  let chartT: Record<string, number> | null = null;
  let stopTween = () => {};
  scope.add(() => stopTween());

  function drawChart() {
    stopTween();
    const data = viewData();
    const from = chartT;
    const to = profile!.t;
    if (!from || drawn.chart === -1 || reducedMotion() || def.scaleOrder.every((s) => from[s] === to[s])) {
      chartT = { ...to };
      renderChart(el.chart, chartW, data);
      return;
    }
    stopTween = tween(350, (k) => {
      const t: Record<string, number> = {};
      for (const s of def.scaleOrder) t[s] = from[s] + (to[s] - from[s]) * k;
      chartT = t;
      renderChart(el.chart, chartW, data, t);
    });
  }

  function renderProfile(force = false) {
    if (!profile) return;
    if (!prefs.showProfile && !WIDE.matches) return; // шторка закрыта — нарисуем при открытии
    const view = prefs.profileView;
    if (view === "chart") {
      const w = el.chartWrap.clientWidth;
      const width = w > 0 ? chartWidthFor(w) : 600;
      if (!force && drawn.chart === version && width === chartW) return;
      const resized = width !== chartW;
      chartW = width;
      if (drawn.chart === version && resized) renderChart(el.chart, chartW, viewData(), chartT ?? profile.t);
      else drawChart();
    } else if (!force && drawn[view] === version) {
      return;
    } else if (view === "bars") {
      renderBars(el.bars, viewData());
    } else {
      renderTable(v, el.scoreBody, profile, last);
    }
    drawn[view] = version;
  }

  function renderScores() {
    if (!profile) {
      el.impact.className = "impact";
      el.impact.innerHTML = `<span class="impact-empty">Загружаю баллы…</span>`;
      return;
    }
    version++;
    renderValidity(v, validity, profile);
    renderStrip(v, el.strip, profile, last, prefs.stripAll);
    renderImpact(v, el.impact, last, last ? session.answers[last.q] : null);
    renderProfile();
  }

  function renderLayout() {
    el.layout.classList.toggle("no-side", !prefs.showProfile);
    el.sideOpen.hidden = prefs.showProfile;
    // Строка шкал в шапке дублирует профиль — нужна, только когда его колонки не видно (закрыта или на узком экране шторка).
    el.strip.hidden = WIDE.matches && prefs.showProfile;
    setPressed(el.toggleProfile, prefs.showProfile);
    el.toggleProfile.setAttribute("aria-expanded", String(prefs.showProfile));
    const view = prefs.profileView;
    el.chartWrap.hidden = view === "table";
    el.tableWrap.hidden = view !== "table";
    el.bars.hidden = view !== "bars";
    el.chart.style.display = view === "chart" ? "" : "none";
    for (const b of el.viewButtons) {
      const on = b.dataset.view === view;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", String(on));
    }
    setPressed(el.keyBtn, prefs.keyMode, { on: "Скрыть ключ", off: "Показать ключ" });
    document.body.classList.toggle("keymode", prefs.keyMode);
    for (const k of el.questions.querySelectorAll<HTMLElement>(".q-key")) k.hidden = !prefs.keyMode;
    updatePanelHeight();
    renderProfile();
    updateSheetHeight();
  }

  function renderAll() {
    for (let i = 0; i < v.n; i++) renderRow(i);
    renderScores();
    renderLayout();
  }

  // ---------- действия ----------
  function setAnswer(i: number, value: Answer, advance: boolean) {
    const prevLast = lastQ;
    const prevCur = cur;
    applyAnswer(session, i, value);
    lastQ = i;
    cur = advance && session.answers[i] !== null && i < v.n - 1 ? i + 1 : i;
    for (const q of new Set([i, prevCur, cur, ...(prevLast === null ? [] : [prevLast])])) renderRow(q);
    scoring.request();
    saver.schedule();
    followCur = advance;
    if (advance) scrollToQuestion(cur);
  }

  function setCur(i: number, scroll: boolean) {
    const prev = cur;
    cur = Math.max(0, Math.min(v.n - 1, i));
    renderRow(prev);
    renderRow(cur);
    if (scroll) scrollToQuestion(cur);
    else followCur = false; // выбрали вопрос мышью — прокрутку не трогаем
  }

  function scrollToQuestion(i: number, flash = false) {
    const li = questionEl(i);
    // Высота шапки только что могла измениться (строка «что изменил ответ»), а с ней — прилипает ли она.
    // Обновить это до расчёта, иначе вопрос окажется под снова прилипшей шапкой.
    updatePanelHeight();
    const r = li.getBoundingClientRect();
    const top = Math.max(8, el.panel.getBoundingClientRect().bottom + 8);
    // Видимая часть — между шапкой и открытой шторкой профиля (на узком экране), а не до низа окна.
    const bottom = window.innerHeight - sheetHeight();
    if (r.top < top || r.bottom > bottom - 8 || flash) {
      const target = top + Math.max(0, (bottom - top - r.height) / 3);
      window.scrollBy({ top: r.top - target, behavior: reducedMotion() ? "auto" : "smooth" });
    }
    if (flash) {
      li.classList.remove("flash");
      void li.offsetWidth; // перезапустить анимацию
      li.classList.add("flash");
    }
  }

  /** Высота открытой шторки профиля на узком экране (0, если она закрыта или профиль — колонка справа). */
  const sheetHeight = () => (NARROW.matches && prefs.showProfile ? el.side.getBoundingClientRect().height : 0);

  function updateSheetHeight() {
    document.documentElement.style.setProperty("--sheet-h", sheetHeight() + "px");
  }

  function updatePanelHeight() {
    // Высота липкой панели нужна боковой колонке (прилипает под ней) и отступу при прокрутке к вопросу.
    // На узком низком экране слишком высокая панель не прилипает, чтобы не закрывать вопросы.
    const h = el.panel.getBoundingClientRect().height;
    document.documentElement.style.setProperty("--panel-h", h + "px");
    el.panel.classList.toggle("unstick", NARROW.matches && h > window.innerHeight * 0.45);
  }

  function setPrefs(change: Partial<typeof prefs>) {
    Object.assign(prefs, change);
    renderLayout();
    saver.schedule();
  }

  function resetAll() {
    if (!window.confirm(`Сбросить все ответы и историю ${def.title}?`)) return;
    session = emptySession(def);
    last = null;
    lastQ = null;
    cur = 0;
    renderAll();
    scoring.request();
    saver.schedule();
    window.scrollTo({ top: 0 });
    toast("Результаты сброшены");
  }

  function toast(msg: string) {
    el.toast.textContent = msg;
    scope.timeout(() => { if (el.toast.textContent === msg) el.toast.textContent = ""; }, 3000);
  }

  // ---------- обмен с сервером ----------

  /** Профиль по текущим ответам. q — вопрос, ответ на который пересчитываем (null — загрузка или сброс). */
  const scoring = createSync(scope, {
    async send(signal) {
      const q = lastQ;
      const r = await api<ScoreResponse>(`api/questionnaire/${def.id}/score`, { body: { answers: encodeAnswers(session.answers) }, signal });
      return { next: r.profile, q };
    },
    onResult({ next, q }) {
      last = profile && q !== null ? lastAnswer(def, q, profile, next, v.focus) : null;
      profile = next;
      renderScores();
      // Строка «что изменил ответ» в шапке могла стать выше и закрыть вопрос, к которому только что перешли.
      if (followCur) scrollToQuestion(cur);
      followCur = false;
    },
    onBusy: (busy) => el.panel.setAttribute("aria-busy", String(busy)),
    onError() {
      el.impact.className = "impact miss";
      el.impact.innerHTML = `<span class="imp-note">Нет связи с сервером — баллы пересчитаются, как только она появится. Ответы сохранены.</span>`;
    }
  });

  /** Ключ по отслеживаемым шкалам и свой список ответов: строки ключа, подсветка, «что дал ответ». */
  const keys = createSync(scope, {
    send: (signal) => api<KeysResponse>(`api/questionnaire/${def.id}/keys`, { signal }),
    onResult(r) {
      setKeys(v, r);
      applyKeys(v, el.questions);
      for (let i = 0; i < v.n; i++) if (session.answers[i] !== null) renderRow(i);
      if (profile) renderImpact(v, el.impact, last, last ? session.answers[last.q] : null);
    }
  });

  // ---------- события ----------
  scope.on(el.questions, "click", (e) => {
    const t = e.target as Element;
    const li = t.closest<HTMLElement>(".q");
    if (!li) return;
    const i = Number(li.dataset.i);
    const b = t.closest<HTMLButtonElement>("button[data-a]");
    if (b) setAnswer(i, b.dataset.a as Answer, false);
    else setCur(i, false);
  });

  scope.on(el.sheetGrid, "click", (e) => {
    const c = (e.target as Element).closest<HTMLElement>(".cell");
    if (!c) return;
    const i = Number(c.dataset.i);
    setCur(i, false);
    scrollToQuestion(i, true);
  });

  scope.on(el.strip, "click", (e) => {
    if (!profile || !(e.target as Element).closest("[data-more]")) return;
    prefs.stripAll = !prefs.stripAll;
    renderStrip(v, el.strip, profile, last, prefs.stripAll);
    updatePanelHeight();
    saver.schedule();
  });

  bindHeader(root, ctx, scope);
  scope.on(el.keyBtn, "click", () => setPrefs({ keyMode: !prefs.keyMode }));
  for (const b of el.viewButtons) scope.on(b, "click", () => setPrefs({ profileView: b.dataset.view as ProfileView }));
  scope.on(el.toggleProfile, "click", () => setPrefs({ showProfile: !prefs.showProfile }));
  scope.on(el.sideOpen, "click", () => setPrefs({ showProfile: true }));
  scope.on(byId(root, "sideClose"), "click", () => setPrefs({ showProfile: false }));
  // При смене ширины (поворот телефона, окно) — к умолчанию: справа колонка, на узком экране шторка закрыта.
  scope.on(WIDE, "change", () => { prefs.showProfile = WIDE.matches; renderLayout(); });
  scope.on(byId(root, "resetBtn"), "click", resetAll);
  scope.on(validity.root, "toggle", () => fitValidityBody(validity));
  // Пояснение к достоверности открывается поверх вопросов — закрываем его кликом мимо.
  scope.on(document, "click", (e) => { if (validity.root.open && !validity.root.contains(e.target as Node)) validity.root.open = false; });

  scope.on(document, "keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "Escape") {
      if (validity.root.open) validity.root.open = false;
      else if (!WIDE.matches && prefs.showProfile) setPrefs({ showProfile: false });
      return;
    }
    const tag = ((e.target as Element).tagName || "").toLowerCase();
    if (tag === "select" || tag === "textarea" || tag === "input") return;
    const answer = KEY_ANSWER[e.code];
    if (answer && (answer !== "?" || v.dk)) {
      e.preventDefault();
      setAnswer(cur, answer, true);
    } else if (e.code === "Digit0" || e.code === "Numpad0" || e.code === "Backspace" || e.code === "Delete") {
      const current = session.answers[cur];
      if (current !== null) {
        e.preventDefault();
        setAnswer(cur, current, false); // повторный ответ снимает его
      }
    } else if (e.code === "ArrowDown" || e.code === "KeyJ") {
      e.preventDefault();
      setCur(cur + 1, true);
    } else if (e.code === "ArrowUp" || e.code === "KeyK") {
      e.preventDefault();
      setCur(cur - 1, true);
    }
  });

  scope.observeResize(el.panel, updatePanelHeight);
  scope.observeResize(el.side, updateSheetHeight);
  scope.add(() => document.documentElement.style.removeProperty("--sheet-h"));
  scope.observeResize(el.chartWrap, () => { if (prefs.profileView === "chart") renderProfile(); });
  scope.on(window, "resize", updatePanelHeight);

  // ---------- показ ----------
  buildQuestions(v, el.questions);
  buildSheet(el.sheetGrid, v.n);
  renderAll();
  keys.request();
  scoring.request();

  return () => {
    scope.dispose();
    document.body.classList.remove("keymode");
    root.innerHTML = "";
  };
}
