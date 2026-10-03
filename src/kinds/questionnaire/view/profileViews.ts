/*
 * Два вида подробного профиля: полосы («Шкалы», как в результатах psytests.org) и график Т-баллов.
 * Рисуют по готовому профилю и ничего не хранят.
 */
import type { Profile, QuestionnaireSpec } from "../types";

export interface ProfileViewData {
  def: QuestionnaireSpec;
  profile: Profile;
  /** Шкалы, изменённые последним ответом. */
  changed: ReadonlySet<string>;
  /** Профиль до последнего ответа. */
  before: Profile | null;
  focus: ReadonlySet<string>;
}

const scaleLabel = (def: QuestionnaireSpec, s: string) => `${def.scaleInfo[s].code}: ${def.scaleInfo[s].name}`;
const signed = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(0);

/**
 * Полосы по клеткам в 5 Т в диапазоне def.ui.bars (СМОЛ — от 10 до 110 Т, СМИЛ — от 0 до 120 Т).
 * Разметка строится один раз, дальше у строк меняются только ширина, цифра и классы — поэтому полосы
 * плавно доезжают до нового значения (переход ширины в CSS).
 */
export function renderBars(box: HTMLElement, { def, profile, changed, before, focus }: ProfileViewData): void {
  const T_MIN = def.ui.bars.min, T_MAX = def.ui.bars.max;
  if (!box.firstChild) buildBars(box, def);
  for (const rowEl of box.querySelectorAll<HTMLElement>(".bar-row[data-s]")) {
    const s = rowEl.dataset.s!;
    const t = profile.t[s];
    const lvl = profile.level[s];
    const w = Math.max(0, Math.min(100, ((t - T_MIN) / (T_MAX - T_MIN)) * 100));
    rowEl.className = ["bar-row", lvl === "high" || lvl === "low" ? "is-out" : "is-mid", changed.has(s) ? "changed" : "", focus.has(s) ? "" : "other"].join(" ");
    let d = "";
    if (changed.has(s) && before) {
      const diff = Math.round(t) - Math.round(before.t[s]);
      if (diff) d = `<small>${signed(diff)}</small>`;
    }
    (rowEl.children[1].firstChild as HTMLElement).style.width = w.toFixed(1) + "%";
    rowEl.children[2].innerHTML = (profile.extrapolated[s] ? "≈" : "") + String(Math.round(t)).replace("-", "−") + d;
  }
}

function buildBars(box: HTMLElement, def: QuestionnaireSpec): void {
  const T_MIN = def.ui.bars.min, T_MAX = def.ui.bars.max;
  const pct = (t: number) => (((t - T_MIN) / (T_MAX - T_MIN)) * 100).toFixed(2) + "%";
  const { low, high } = def.thresholds;
  box.style.setProperty("--cell", (500 / (T_MAX - T_MIN)).toFixed(4) + "%");
  const row = (s: string, label: string) =>
    `<div class="bar-row" data-s="${s}" title="${scaleLabel(def, s)}"><span class="bar-name">${label}</span>` +
    `<span class="bar-track"><span class="bar-fill" style="width:0"></span></span><span class="bar-val"></span></div>`;
  const group = (g: string) => def.scaleOrder.filter((s) => def.scaleInfo[s].group === g);
  const clinical = group("clinical").map((s) => row(s, `${s}. ${def.scaleInfo[s].title}`)).join("");
  const control = group("control").map((s) => row(s, `${def.scaleInfo[s].title} (${s})`)).join("");
  box.innerHTML =
    `<div class="bars-h">Базисные шкалы</div>${clinical}<div class="bars-h">Контрольные шкалы</div>${control}` +
    `<div class="bar-row bar-axis"><span class="bar-name"></span><span class="bar-track axis">` +
    `<i style="left:0"><b class="lo">[${T_MIN}</b></i><i class="c" style="left:${pct(low + 1)}"><b class="lo">${low}]</b><b class="mid">[${low + 1}</b></i>` +
    `<i class="c" style="left:${pct(high)}"><b class="mid">${high - 1}]</b><b class="hi">[${high}</b></i><i style="right:0"><b class="hi">${T_MAX}]</b></i></span><span class="bar-val"></span></div>` +
    `<div class="bars-legend"><span class="lo">низкие</span> ⇒ <span class="mid">средние</span> ⇒ <span class="hi">высокие значения</span></div>`;
}

/**
 * График Т-баллов шириной W (в координатах SVG). Контрольные шкалы (первые три) и клинические —
 * две ломаные с разрывом между ними, коридор нормы def.ui.band.
 *
 * shown — Т-баллы, которые рисовать (по умолчанию — из профиля): во время анимации это промежуточные значения
 * на пути к новому профилю. Сетка и подписи осей перерисовываются, только когда поменялся размер.
 */
export function renderChart(svg: SVGSVGElement, W: number, { def, profile, changed, focus }: ProfileViewData, shown: Readonly<Record<string, number>> = profile.t): void {
  const ORDER = def.scaleOrder;
  // Узкая колонка — график повыше; широкая — пониже, но не выше половины экрана (телефон горизонтально).
  const H = W <= 400 ? 230 : Math.round(Math.max(180, Math.min(320, W * 0.5, window.innerHeight * 0.55)));
  const m = { l: 34, r: 10, t: 12, b: 26 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const slot = (i: number) => i + (i >= 3 ? 0.7 : 0);
  const span = slot(ORDER.length - 1);
  const x = (i: number) => m.l + 18 + (slot(i) * (pw - 36)) / span;
  const clamp = (t: number) => Math.max(0, Math.min(120, t));
  const y = (t: number) => m.t + ((120 - clamp(t)) / 120) * ph;
  const css = (v: string) => `var(${v})`;

  const size = `${W}x${H}`;
  let dyn = svg.lastElementChild;
  if (svg.dataset.size !== size || !dyn) {
    svg.dataset.size = size;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = chartGrid() + "<g></g>";
    dyn = svg.lastElementChild!;
  }

  const out: string[] = [];
  const line = (from: number, to: number, color: string) => {
    const pts = ORDER.slice(from, to).map((s, k) => `${x(from + k).toFixed(1)},${y(shown[s]).toFixed(1)}`).join(" ");
    out.push(`<polyline points="${pts}" fill="none" stroke="${css(color)}" stroke-width="2.2" stroke-linejoin="round"/>`);
  };
  line(0, 3, "--ctrl");
  line(3, ORDER.length, "--clin");

  ORDER.forEach((s, i) => {
    const t = shown[s];
    const color = i < 3 ? "--ctrl" : "--clin";
    const cx = x(i), cy = y(t);
    const clipped = t < 0 || t > 120;
    if (!focus.has(s)) out.push(`<g opacity="0.4">`);
    if (changed.has(s)) out.push(`<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="${css("--hl")}" stroke-width="2"/>`);
    out.push(`<circle cx="${cx}" cy="${cy}" r="4.2" fill="${clipped ? css("--surface") : css(color)}" stroke="${css(color)}" stroke-width="2"><title>${scaleLabel(def, s)}: Т ${profile.t[s].toFixed(2)}</title></circle>`);
    const ly = t > 108 ? cy + 18 : cy - (changed.has(s) ? 12 : 9);
    out.push(`<text class="v${changed.has(s) ? " changed" : ""}" x="${cx}" y="${ly}" text-anchor="middle">${Math.round(t)}</text>`);
    if (!focus.has(s)) out.push("</g>");
  });
  dyn.innerHTML = out.join("");

  function chartGrid(): string {
    const out: string[] = [];
    const [bandLo, bandHi] = def.ui.band;
    out.push(`<rect x="${m.l}" y="${y(bandHi)}" width="${pw}" height="${y(bandLo) - y(bandHi)}" fill="${css("--band")}"/>`);
    for (let t = 0; t <= 120; t += 5) {
      const strong = t % 10 === 0;
      out.push(`<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="${css(strong ? "--grid-strong" : "--grid")}" stroke-width="${strong ? 0.8 : 0.6}"/>`);
      if (strong) out.push(`<text x="${m.l - 6}" y="${y(t) + 3.5}" text-anchor="end">${t}</text>`);
    }
    for (const t of def.ui.band) {
      out.push(`<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="${css("--muted")}" stroke-width="1" stroke-dasharray="5 4"/>`);
    }
    const sepX = (x(2) + x(3)) / 2;
    out.push(`<line x1="${sepX}" x2="${sepX}" y1="${m.t}" y2="${m.t + ph}" stroke="${css("--grid-strong")}" stroke-width="1"/>`);
    ORDER.forEach((s, i) => out.push(`<text class="xl" x="${x(i)}" y="${H - 8}" text-anchor="middle">${s}</text>`));
    return out.join("");
  }
}
