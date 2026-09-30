/*
 * Общие мелочи для анимаций. Все анимации на сайте — украшение: при «уменьшить движение» в системе
 * их нет, и ничего от них не зависит.
 */

export const reducedMotion = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Быстрый старт, мягкая остановка — как у CSS-кривой, которой анимированы полосы. */
export const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)";
const easeOut = (x: number) => 1 - (1 - x) ** 3;

/**
 * Прогнать k от 0 до 1 за ms миллисекунд, вызывая frame(k) на каждом кадре (последний вызов — ровно с 1).
 * Возвращает функцию отмены.
 */
export function tween(ms: number, frame: (k: number) => void): () => void {
  const start = performance.now();
  let raf = requestAnimationFrame(function tick(now) {
    const x = Math.min(1, (now - start) / ms);
    frame(easeOut(x));
    if (x < 1) raf = requestAnimationFrame(tick);
  });
  return () => cancelAnimationFrame(raf);
}
