/*
 * Область жизни экрана теста. Всё, что экран подписал или запустил (обработчики событий, таймеры,
 * наблюдатели), регистрируется здесь и снимается одним вызовом dispose() — при переходе на другой тест.
 * Так ни один тест не оставляет за собой «висящих» обработчиков, даже если их много и они разбросаны по файлам.
 */
export interface Scope {
  readonly signal: AbortSignal;
  /** addEventListener, который сам снимется при dispose(). */
  on<K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void): void;
  on<K extends keyof DocumentEventMap>(target: Document, type: K, fn: (e: DocumentEventMap[K]) => void): void;
  on<K extends keyof WindowEventMap>(target: Window, type: K, fn: (e: WindowEventMap[K]) => void): void;
  on(target: EventTarget, type: string, fn: (e: Event) => void): void;
  /** Что ещё сделать при dispose() (например, сбросить отложенное сохранение). */
  add(cleanup: () => void): void;
  /** setTimeout, который отменится при dispose(). */
  timeout(fn: () => void, ms: number): void;
  /** ResizeObserver, который отключится при dispose(). Без поддержки в браузере — ничего не делает. */
  observeResize(el: Element, fn: () => void): void;
  dispose(): void;
}

export function createScope(): Scope {
  const abort = new AbortController();
  const cleanups: (() => void)[] = [];
  return {
    signal: abort.signal,
    on(target: EventTarget, type: string, fn: (e: Event) => void) {
      target.addEventListener(type, fn, { signal: abort.signal });
    },
    add: (fn) => void cleanups.push(fn),
    timeout(fn, ms) {
      const id = window.setTimeout(fn, ms);
      cleanups.push(() => clearTimeout(id));
    },
    observeResize(el, fn) {
      if (!("ResizeObserver" in window)) return;
      const ro = new ResizeObserver(fn);
      ro.observe(el);
      cleanups.push(() => ro.disconnect());
    },
    dispose() {
      abort.abort();
      // В обратном порядке: то, что подключено позже, может зависеть от подключённого раньше.
      for (const fn of cleanups.splice(0).reverse()) fn();
    }
  };
}
