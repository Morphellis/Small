/*
 * Правая колонка теста Люшера (результат) и строка прогресса под шапкой.
 * Показатели считает сервер (LuscherResult); протокол шагов, которые на них не влияют, — из журнала здесь.
 */
import { escapeHtml } from "../../../app/html";
import { ANXIETY_BANDS, bandOf } from "../bands";
import { ACHROMATIC, MAX_ANXIETY_ORDER, PAIR_TABLES, achromaticOrder, need, pairWins } from "../flow";
import type { Derived } from "../model";
import type { LuscherDef, LuscherResult, OrderScore } from "../types";
import { figureSvg, stepShort, stepTitle, swatch } from "./common";

const MARKS = ["", "!", "!!", "!!!"];

export function progressHtml(def: LuscherDef, d: Derived, result: LuscherResult | null): string {
  const chips = d.steps.map((s) => {
    const done = (d.picks[s.id]?.length ?? 0) >= need(s);
    const cls = done ? "done" : s.id === d.step?.id ? "cur" : "";
    return `<span class="lu-pstep ${cls}" title="${escapeHtml(stepTitle(def, s))}">${stepShort(s)}</span>`;
  }).join("");
  const a = result?.main?.anxiety ?? null;
  return chips + `<span class="spacer"></span><span class="lu-anx-mini${a === null ? "" : " t-" + bandOf(ANXIETY_BANDS, a).tone}">` +
    `Тревожность: <b>${a ?? "—"}</b>${a === null ? "" : "<small> / 12</small>"}</span>`;
}

function orderRow(label: string, s: OrderScore | null): string {
  if (!s) return `<tr><th>${label}</th><td colspan="9" class="lu-empty">ещё не сделан</td></tr>`;
  return `<tr><th>${label}</th>${[...s.order].map((c, i) =>
    `<td><span class="lu-mark">${MARKS[s.marks[i]]}</span>${swatch(Number(c))}</td>`
  ).join("")}<td class="lu-sum">${s.anxiety}</td></tr>`;
}

function scoreHtml(result: LuscherResult | null): string {
  if (!result) return `<p class="lu-empty">Считаю…</p>`;
  if (!result.main) return `<p class="lu-empty">Показатель тревожности появится после первого восьмицветового выбора.</p>`;
  const { anxiety: a, n } = result.main;
  const band = bandOf(ANXIETY_BANDS, a);
  return `
        <div class="lu-score t-${band.tone}">
          <div class="lu-score-head"><span>Показатель тревожности</span><b>${a}</b><small>из 12</small></div>
          <div class="lu-gauge">${ANXIETY_BANDS.map((b) =>
            `<span class="g-${b.tone}" style="flex:${b.to - b.from + 1}"></span>`).join("")}<i style="left:${(a / 12) * 100}%"></i></div>
          <div class="lu-gauge-lbl"><span>0</span><span>3</span><span>7</span><span>11</span><span>12</span></div>
          <p class="lu-band">${escapeHtml(band.label)}${n === 1 ? " · <small>предварительно, по первому выбору; итог считается по второму</small>" : ""}</p>
        </div>
        <div class="lu-extra">
          <div><span>Совокупное отклонение от аутогенной нормы</span><b>${result.main.deviation}</b><small>из 32 — чем больше, тем выше непродуктивная напряжённость</small></div>
          <div><span>Вегетативный коэффициент</span><b>${result.main.vk}</b><small>${escapeHtml(result.main.vkLabel)}</small></div>
        </div>`;
}

/** Протокол полного теста: ахроматические, таблицы пар, фигуры. */
function protocolHtml(d: Derived): string {
  const rows: string[] = [];
  const ach = achromaticOrder(d.picks.achromatic ?? []);
  if (ach) rows.push(`<tr><th>Ахроматические</th><td>${ach.map((id, i) => swatch(ACHROMATIC[id], i < 2 ? " plus" : i > 2 ? " minus" : "")).join("")}</td></tr>`);
  for (const s of d.steps) {
    if (s.kind !== "pairs" || (d.picks[s.id]?.length ?? 0) < 6) continue;
    const t = PAIR_TABLES.find((x) => x.table === s.table)!;
    const wins = pairWins(d.picks[s.id]);
    const ranked = [0, 1, 2, 3].sort((a, b) => Number(wins[b]) - Number(wins[a]));
    rows.push(`<tr><th>Таблица ${s.table}${s.round === 2 ? " (повтор)" : ""}</th><td>${ranked.map((i) =>
      `<span class="lu-win">${swatch(t.colors[i])}<small>${wins[i]}</small></span>`).join("")}</td></tr>`);
  }
  const f = d.picks.figures ?? [];
  if (f.length === 4) {
    const fig = (n: number, cls: string) => `<span class="lu-fig-sm ${cls}">${figureSvg(n)}</span>`;
    rows.push(`<tr><th>Фигуры</th><td>${fig(f[0], "plus")}${fig(f[1], "plus")}<span class="lu-sep"></span>${fig(f[2], "minus")}${fig(f[3], "minus")}</td></tr>`);
  }
  if (!rows.length) return "";
  return `<h3>Протокол</h3><table class="lu-proto"><tbody>${rows.join("")}</tbody></table>
      <p class="lu-small">Эти шаги на показатель тревожности не влияют; в таблицах рядом с цветом — число его побед в парах.</p>`;
}

export function resultsHtml(def: LuscherDef, d: Derived, result: LuscherResult | null): string {
  return `<h2>Результат</h2>${scoreHtml(result)}
      <h3>Разметка выборов</h3>
      <div class="lu-scroll"><table class="lu-marks">
        <thead><tr><th></th>${[1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<th>${i}</th>`).join("")}<th title="Тревожность">!</th></tr></thead>
        <tbody>${orderRow("Выбор 1", result?.first ?? null)}${orderRow("Выбор 2", result?.second ?? null)}</tbody>
      </table></div>
      <p class="lu-small">«!» — тревожность: основной цвет (синий, зелёный, красный, жёлтый) на 6–8-м месте или серый, коричневый, чёрный на 1–3-м.
      Итоговый показатель — по второму выбору. Наибольшая тревожность (12) — у раскладки ${[...MAX_ANXIETY_ORDER].map((c) => swatch(Number(c), " sm")).join("")}.</p>` +
    (def.variant === "full" ? protocolHtml(d) : "");
}
