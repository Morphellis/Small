/*
 * Список вопросов: строка с кнопками ответа, строка ключа (видна при «Показать ключ») и строка
 * «что дал этот ответ». Вопросы строятся один раз, дальше обновляется только изменившийся вопрос.
 * Ключ приходит с сервера после показа вопросов — тогда его строки и подсветку дорисовывает applyKeys.
 */
import { escapeHtml } from "../../../app/html";
import { answerEffect } from "../model";
import type { Answer, MaybeAnswer } from "../types";
import { WORD, type ViewCtx } from "./context";

const scalesWord = (list: string[]) => (list.length > 1 ? "шкалы " : "шкала ") + list.join(", ");

/** Строка ключа: «Ответ: «Нет» · Ключ: «Да» → шкалы F, 1 · «Нет» → шкала 3». */
function keyLineHtml(v: ViewCtx, i: number): string {
  if (!v.keysReady) return `<span class="key-label">Ключ:</span><span class="none">загружается…</span>`;
  const keys = v.keys[i].filter((k) => v.focus.has(k.scale));
  const hint = v.useHints ? v.hints[i + 1] : undefined;
  const ans = hint ? `<span class="key-label">Ответ:</span><b class="ans-${hint === "?" ? "dk" : hint}">«${WORD[hint]}»</b><span class="sep">·</span>` : "";
  if (!keys.length) return `${ans}<span class="key-label">Ключ:</span><span class="none">не влияет на отслеживаемые шкалы</span>`;
  const parts = (["Y", "N"] as const).flatMap((a) => {
    const list = keys.filter((k) => k.answer === a).map((k) => k.scale);
    return list.length ? [`<span class="tag"><b class="ans-${a}">«${WORD[a]}»</b> → ${scalesWord(list)}</span>`] : [];
  });
  return `${ans}<span class="key-label">Ключ:</span>${parts.join(`<span class="sep">·</span>`)}`;
}

/** Какие кнопки подсвечивать в режиме ключа: свой «правильный» ответ или все ответы, дающие баллы. */
function keyAnswers(v: ViewCtx, i: number): Answer[] {
  if (v.useHints) return v.hints[i + 1] ? [v.hints[i + 1]] : [];
  if (!v.keyHighlight) return [];
  return [...new Set(v.keys[i].filter((k) => v.focus.has(k.scale)).map((k) => k.answer))];
}

export function buildQuestions(v: ViewCtx, list: HTMLElement): void {
  const buttons = `<button type="button" data-a="Y">Да</button><button type="button" data-a="N">Нет</button>` +
    (v.dk ? `<button type="button" data-a="?">Не знаю</button>` : "");
  const html = v.def.questions.map((text, i) =>
    `<li class="q" id="q-${i + 1}" data-i="${i}">` +
    `<span class="q-num">${i + 1}</span>` +
    `<div class="q-body"><p class="q-text">${escapeHtml(text)}</p><div class="q-key" hidden>${keyLineHtml(v, i)}</div><div class="q-impact" hidden></div></div>` +
    `<div class="q-btns" role="group" aria-label="Ответ на вопрос ${i + 1}">${buttons}</div></li>`
  );
  // Одна вставка целиком быстрее, чем сотни отдельных (566 вопросов СМИЛ).
  list.innerHTML = html.join("");
}

/** Ключ пришёл: строки ключа под вопросами и подсветка ответов, которые дают баллы. */
export function applyKeys(v: ViewCtx, list: HTMLElement): void {
  for (const li of list.children) {
    const i = Number((li as HTMLElement).dataset.i);
    li.querySelector(".q-key")!.innerHTML = keyLineHtml(v, i);
    for (const a of keyAnswers(v, i)) li.querySelector(`button[data-a="${a}"]`)!.classList.add("scores-key");
  }
}

/** Почему ответ не дал баллов (или что дал бы другой ответ). */
export function noScoreText(v: ViewCtx, i: number, a: Answer): string {
  if (a === "?") return "«Не знаю» баллов не даёт";
  if (!v.keysReady) return "";
  const { other, alt } = answerEffect(v.keys[i], v.focus, a);
  return other.length
    ? `«${WORD[a]}» баллов не даёт (даёт «${WORD[alt]}»: ${other.join(", ")})`
    : "на отслеживаемые шкалы не влияет";
}

/*
 * Влияние ответа по ключу теста (только шкалы из focus): в какие шкалы он засчитан, либо что баллов не даёт.
 * Не зависит от остальных ответов, поэтому строка остаётся под вопросом, пока ответ не сняли или не сменили.
 */
function impactHtml(v: ViewCtx, i: number, a: Answer): string {
  if (a !== "?") {
    const { mine } = answerEffect(v.keys[i], v.focus, a);
    if (mine.length) return `<span class="lead">«${WORD[a]}» дал:</span>` + mine.map((s) => `<span class="chip plus"><b>${s}</b><i>+1</i></span>`).join("");
  }
  return `<span class="quiet">${noScoreText(v, i, a)}</span>`;
}

export function renderQuestion(v: ViewCtx, li: HTMLElement, i: number, a: MaybeAnswer, state: { cur: boolean; last: boolean }): void {
  for (const b of li.querySelectorAll<HTMLButtonElement>("button")) {
    const on = b.dataset.a === a;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
  }
  const impact = li.querySelector<HTMLElement>(".q-impact")!;
  impact.hidden = a === null || !v.keysReady;
  if (!impact.hidden) impact.innerHTML = impactHtml(v, i, a!);
  li.classList.toggle("last", state.last && a !== null);
  li.classList.toggle("cur", state.cur);
}
