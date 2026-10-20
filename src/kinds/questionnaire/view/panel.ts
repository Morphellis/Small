/*
 * Липкая панель опросника: плашка достоверности, «что изменил последний ответ» и полоска шкал.
 */
import { escapeHtml, plural } from "../../../app/html";
import { ICON } from "../../../app/icons";
import type { LastAnswer } from "../model";
import type { MaybeAnswer, Profile } from "../types";
import { signed, WORD, type ViewCtx } from "./context";
import { noScoreText } from "./questions";

/*
 * Что сделал именно последний ответ: по каждой затронутой шкале из focus — на сколько изменились сырые
 * баллы (или поправка K) и как сдвинулся Т-балл. Остальные затронутые шкалы перечислены мелко в конце.
 */
export function renderImpact(v: ViewCtx, box: HTMLElement, last: LastAnswer | null, answer: MaybeAnswer): void {
  if (!last) {
    box.className = "impact";
    box.innerHTML = `<span class="impact-empty">Здесь будет видно, что изменил ответ.</span>`;
    return;
  }
  const { q: i, before, after } = last;
  const badge = answer === null ? `<span class="ans none">снят</span>` : `<span class="ans ${answer === "?" ? "dk" : answer}">${WORD[answer]}</span>`;
  const chips = last.changed.map((s) => {
    const dRaw = after.raw[s] - before.raw[s];
    const dT = after.t[s] - before.t[s];
    const down = dRaw < 0 || (dRaw === 0 && dT < 0);
    const what = dRaw !== 0 ? signed(dRaw, 0) : "поправка K";
    // «2 +1 · Т 68 → 71»: номер шкалы и сдвиг цветом (вверх красный, вниз синий), Т — обычным текстом.
    return `<span class="imp-chip${down ? " minus" : ""}" title="${v.scaleLabel(s)}"><b>${s} ${what}</b>` +
      `<span class="t">Т ${v.fmtT(before.t[s], before.extrapolated[s])} → ${v.fmtT(after.t[s], after.extrapolated[s])}</span></span>`;
  });
  const others = last.changedAll.filter((s) => !v.focus.has(s));
  const more = others.length ? `<span class="imp-more">прочие: ${others.join(", ")}</span>` : "";
  const body = chips.length
    ? `${chips.join("")}${more}`
    : `<span class="imp-note">${answer === null ? "Ответ снят, шкалы не изменились" : `Без изменений<span class="imp-why">: ${noScoreText(v, i, answer)}</span>`}</span>${more}`;
  box.className = "impact " + (chips.length ? "hit" : "miss");
  box.innerHTML =
    `<div class="imp-q" title="${escapeHtml(v.def.questions[i])}">Вопрос ${i + 1} ${badge}</div>` +
    `<div class="imp-body">${body}</div>`;
}

/** Полоска шкал. Неотслеживаемые свёрнуты в кнопку «ещё N шкал» (кроме только что изменившихся). */
export function renderStrip(v: ViewCtx, box: HTMLElement, profile: Profile, last: LastAnswer | null, showAll: boolean, empty = false): void {
  const changed = new Set(last ? last.changed : []);
  const exceeded = new Set(profile.validity.checks.filter((c) => c.exceeded).map((c) => c.scale));
  let hidden = 0;
  const cells: string[] = [];
  for (const s of v.order) {
    if (!showAll && !v.focus.has(s) && !changed.has(s)) { hidden++; continue; }
    const g = v.def.scaleInfo[s].group === "control" ? "ctrl" : "clin";
    // Без единого ответа Т-баллы ничего не значат (сплошь «низкие»), поэтому их не показываем.
    const t = empty ? "—" : (profile.extrapolated[s] ? "≈" : "") + String(Math.round(profile.t[s])).replace("-", "−");
    // Сдвиг Т после последнего ответа: красный — вверх, синий — вниз.
    let dt = "", dn = "";
    if (changed.has(s)) {
      const diff = profile.t[s] - last!.before.t[s];
      dt = `<em>${signed(diff, Math.min(v.def.tDigits, 1))}</em>`;
      if (diff < 0) dn = "dn";
    }
    const cls = ["sc", g, !empty && profile.level[s] ? "lv-" + profile.level[s] : "", exceeded.has(s) ? "invalid" : "", dn,
      changed.has(s) ? "changed" : "", v.focus.has(s) ? "" : "other"].filter(Boolean).join(" ");
    const title = empty ? `${v.scaleLabel(s)}: ответов ещё нет` : `${v.scaleLabel(s)}: Т ${t}, сырые с поправкой ${profile.corrected[s]}`;
    cells.push(`<div class="${cls}" title="${title}"><b>${s}</b>${dt}<span>${t}</span><small>${empty ? "&nbsp;" : profile.corrected[s]}</small></div>`);
  }
  if (v.dk) {
    if (showAll) cells.push(`<div class="sc other" title="Ответов «Не знаю»"><b>?</b><span>${profile.dontKnow}</span><small>&nbsp;</small></div>`);
    else hidden++;
  }
  if (hidden) cells.push(`<button type="button" class="more-chip" data-more aria-expanded="false" aria-label="Показать ещё ${hidden} ${plural(hidden, "шкалу", "шкалы", "шкал")}"><span class="long">ещё ${hidden} ${plural(hidden, "шкала", "шкалы", "шкал")}</span><span class="short">+${hidden}</span></button>`);
  else if (showAll && v.order.some((s) => !v.focus.has(s))) cells.push(`<button type="button" class="more-chip" data-more aria-expanded="true">свернуть</button>`);
  box.innerHTML = cells.join("");
}

export interface ValidityEls {
  root: HTMLDetailsElement;
  summary: HTMLElement;
  body: HTMLElement;
}

export function renderValidity(v: ViewCtx, els: ValidityEls, profile: Profile): void {
  const { valid, checks } = profile.validity;
  const unit = (c: { unit: string }) => (c.unit ? " " + c.unit : "");
  els.root.classList.toggle("bad", !valid);
  if (valid) {
    // По сырым баллам: «L 2 из 4»; по Т-баллам: «L 49 Т, до 70».
    const counts = checks.map((c) => (c.unit ? `${c.scale} ${c.value}${unit(c)}, до ${c.limit}` : `${c.scale} ${c.value} из ${c.limit}`)).join(" · ");
    els.summary.innerHTML = `<b>${ICON.check}<span class="vt">Достоверен</span></b><span class="v-counts">${counts}</span>`;
    els.body.innerHTML = `<p>${v.def.validityRule} Сейчас ${checks.length > 2 ? "все" : "оба"} в пределах.</p>`;
    els.root.open = false;
    return;
  }
  const bad = checks.filter((c) => c.exceeded);
  els.summary.innerHTML = `<b>${ICON.cross}<span class="vt">Недостоверен</span></b><span class="v-counts">${bad.map((c) => `${c.scale} ${c.value}${unit(c)}, можно до ${c.limit}`).join(" · ")}</span>`;
  els.body.innerHTML =
    bad.map((c) => `<p><b>${c.scale} = ${c.value}${unit(c)}</b>, можно не больше ${c.limit}${unit(c)} (${v.def.scaleInfo[c.scale].name.toLowerCase()}): ${c.reason}.</p>`).join("") +
    `<p>С таким результатом шкалы ${v.def.title} не читают, тест проходят заново.</p>`;
}

/** Пояснение к достоверности не должно вылезать за правый край экрана (плашка бывает у самого края). */
export function fitValidityBody(els: ValidityEls): void {
  els.body.style.left = "";
  if (!els.root.open || getComputedStyle(els.body).position !== "absolute") return;
  const over = els.body.getBoundingClientRect().right - (document.documentElement.clientWidth - 8);
  if (over > 0) els.body.style.left = -over + "px";
}
