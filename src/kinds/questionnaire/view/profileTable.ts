/*
 * Таблица профиля: Т-балл с уровнем, сырой балл (с поправкой K), шкала, сдвиг Т после последнего ответа.
 */
import type { LastAnswer } from "../model";
import type { Profile } from "../types";
import { LEVEL_WORD, signed, type ViewCtx } from "./context";

export function renderTable(v: ViewCtx, body: HTMLElement, profile: Profile, last: LastAnswer | null): void {
  const { def } = v;
  const changed = new Set(last ? last.changed : []);
  const exceeded = new Set(profile.validity.checks.filter((c) => c.exceeded).map((c) => c.scale));
  const rows = v.order.map((s, idx) => {
    const t = profile.t[s];
    const lvl = profile.level[s];
    const corr = profile.corrected[s] !== profile.raw[s] || def.kCorrected.includes(s)
      ? ` <small title="с поправкой K">(${profile.corrected[s]})</small>` : "";
    const d = changed.has(s) ? signed(t - last!.before.t[s], def.tDigits) : "";
    const cls = [changed.has(s) ? "changed" : "", idx === 3 ? "grp" : "", exceeded.has(s) ? "invalid" : "", v.focus.has(s) ? "" : "other"].filter(Boolean).join(" ");
    const lvlTxt = lvl !== "norm" ? `<span class="lvl">${LEVEL_WORD[lvl]}</span>` : "";
    return `<tr class="${cls}" data-s="${s}"><td class="num t lv-${lvl}">${v.fmtT(t, profile.extrapolated[s])}${lvlTxt}</td>` +
      `<td class="num">${profile.raw[s]}${corr}</td><td class="name" title="${v.scaleLabel(s)}">${v.scaleLabel(s)}</td><td class="num d">${d}</td></tr>`;
  });
  if (v.dk) rows.push(`<tr class="dk grp"><td class="num t">—</td><td class="num">${profile.dontKnow}</td><td class="name">?: Ответ «Не знаю»</td><td></td></tr>`);
  if (profile.controlTotal) {
    rows.push(`<tr class="dk"><td class="num t">—</td><td class="num">${profile.controlCorrect}<small> из ${profile.controlTotal}</small></td>` +
      `<td class="name" title="Пункты «Номер данного пункта следует обвести кружочком»: правильно отвечать «Не знаю»">Контрольные пункты</td><td></td></tr>`);
  }
  body.innerHTML = rows.join("");
}
