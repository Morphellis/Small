/*
 * localStorage без падений: в приватном окне, при заблокированных данных сайта и т. п. доступ к нему бросает
 * исключение. Сохранение ответов — удобство, поэтому без хранилища сайт просто работает без запоминания.
 */

export function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* хранилище недоступно — работаем без него */
  }
}

export function readJson<T>(key: string): T | null {
  const s = readString(key);
  if (s === null) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  writeString(key, JSON.stringify(value));
}

/**
 * Отложенное сохранение: частые изменения (ответ за ответом) записываются одним разом, когда браузер свободен,
 * а не на каждый клик. flush() записывает немедленно — при уходе со страницы и при смене теста.
 */
export interface Saver {
  schedule(): void;
  flush(): void;
}

export function createSaver(key: string, snapshot: () => unknown): Saver {
  let pending = false;
  const flush = () => {
    if (!pending) return;
    pending = false;
    writeJson(key, snapshot());
  };
  return {
    schedule() {
      if (pending) return;
      pending = true;
      if ("requestIdleCallback" in window) window.requestIdleCallback(flush, { timeout: 400 });
      else setTimeout(flush, 150);
    },
    flush
  };
}
