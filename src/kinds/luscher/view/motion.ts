/*
 * Анимации экрана Люшера. Экран перерисовывается целиком (innerHTML), поэтому анимации устроены так:
 * до перерисовки снять, где что было, после — проиграть переход от старого к новому (приём FLIP).
 * Всё — через Web Animations API: ничего не остаётся в стилях, прерванная анимация ничего не ломает.
 */
import { EASE, reducedMotion } from "../../../app/motion";

export interface Snapshot {
  /** Копия нажатой карточки или фигуры на её месте на экране — она и полетит. */
  ghost: HTMLElement | null;
  stepId: string | null;
  /** Положение метки на шкале тревожности (style.left). */
  gauge: string | null;
}

const FLY_MS = 380;

/** Запомнить, что было на экране перед выбором value. */
export function snapshot(stage: HTMLElement, results: HTMLElement, stepId: string | null, value: number | null): Snapshot {
  const gauge = results.querySelector<HTMLElement>(".lu-gauge i")?.style.left ?? null;
  if (reducedMotion()) return { ghost: null, stepId, gauge: null };
  const src = value === null ? null : stage.querySelector<HTMLElement>(`[data-v="${value}"]`);
  return { ghost: src ? makeGhost(src) : null, stepId, gauge };
}

function makeGhost(src: HTMLElement): HTMLElement {
  const r = src.getBoundingClientRect();
  const g = src.cloneNode(true) as HTMLElement;
  g.classList.remove("hint");
  g.removeAttribute("data-v");
  g.setAttribute("aria-hidden", "true");
  g.tabIndex = -1;
  Object.assign(g.style, {
    position: "fixed", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px",
    margin: "0", zIndex: "50", pointerEvents: "none", transformOrigin: "0 0"
  });
  return g;
}

/**
 * После перерисовки: карточка летит в конец ряда «выбрано» (если шаг тот же и ряд есть) или мягко исчезает;
 * новый шаг или новая пара появляются; метка тревожности доезжает до нового места.
 */
export function play(before: Snapshot, stage: HTMLElement, results: HTMLElement, stepId: string | null, host: HTMLElement): void {
  moveGauge(before.gauge, results);
  if (reducedMotion()) return;
  const sameStep = before.stepId === stepId;

  if (!sameStep) {
    stage.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 280, easing: EASE });
  } else {
    // Та же таблица пар — новая пара на месте старой.
    const pair = stage.querySelector(".lu-row2");
    if (pair) pair.animate([{ opacity: 0, transform: "scale(0.96)" }, { opacity: 1, transform: "none" }], { duration: 220, delay: 90, easing: EASE, fill: "backwards" });
  }

  const g = before.ghost;
  if (!g) return;
  host.append(g);
  const chip = sameStep ? stage.querySelector<HTMLElement>(".lu-chosen .lu-chip:last-child .lu-sw") : null;
  let anim: Animation;
  if (chip) {
    const from = g.getBoundingClientRect(), to = chip.getBoundingClientRect();
    const sx = to.width / from.width, sy = to.height / from.height;
    chip.style.opacity = "0";
    anim = g.animate([
      { transform: "none", borderRadius: getComputedStyle(g).borderRadius },
      { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${sx}, ${sy})`, borderRadius: `${5 / sx}px / ${5 / sy}px` }
    ], { duration: FLY_MS, easing: EASE });
    const reveal = () => { chip.style.opacity = ""; };
    anim.addEventListener("finish", reveal);
    anim.addEventListener("cancel", reveal);
  } else {
    anim = g.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(1.08)" }], { duration: 220, easing: "ease-out" });
  }
  anim.addEventListener("finish", () => g.remove());
  anim.addEventListener("cancel", () => g.remove());
}

/** После отмены выбора: возвращённая карточка проявляется на своём месте. */
export function playUndo(before: Snapshot, stage: HTMLElement, results: HTMLElement, stepId: string | null, value: number): void {
  moveGauge(before.gauge, results);
  if (reducedMotion()) return;
  if (before.stepId !== stepId) {
    stage.animate([{ opacity: 0, transform: "translateY(-10px)" }, { opacity: 1, transform: "none" }], { duration: 280, easing: EASE });
    return;
  }
  stage.querySelector(`[data-v="${value}"]`)?.animate(
    [{ opacity: 0, transform: "scale(0.85)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: EASE });
}

function moveGauge(old: string | null, results: HTMLElement) {
  const mark = results.querySelector<HTMLElement>(".lu-gauge i");
  if (!old || !mark || mark.style.left === old || reducedMotion()) return;
  mark.animate([{ left: old }, { left: mark.style.left }], { duration: 450, easing: EASE });
}
