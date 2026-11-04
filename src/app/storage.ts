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
  flushBeforeExit(): void;
  dispose(): void;
}

const snapshots = new Map<string, () => unknown>();
const recoveries = new Map<string, { value: unknown; expected: string | null; conflict: boolean }>();

/** Несохранённый прогресс не теряется при переходе к другому тесту и обратно. */
export function readProgress<T>(key: string): T | null {
  return recoveries.has(key) ? recoveries.get(key)!.value as T : readJson<T>(key);
}

/** В том числе ответы, которые пока не удалось записать на устройство. */
export function progressSnapshot(key: string): unknown {
  const snapshot = snapshots.get(key);
  return snapshot ? snapshot() : readProgress(key);
}

function storageNotice(key: string, kind: "conflict" | "unavailable" | "saved"): void {
  window.dispatchEvent(new CustomEvent("trainer:storage-status", { detail: { key, kind } }));
}

export function createSaver(key: string, snapshot: () => unknown): Saver {
  const recovered = recoveries.get(key);
  let pending = !!recovered;
  let expected = recovered ? recovered.expected : readString(key);
  let conflict = recovered?.conflict ?? false;
  let disposed = false;
  let locking = false;
  snapshots.set(key, snapshot);
  const onStorage = (event: StorageEvent) => {
    if ((event.key === key || event.key === null) && readString(key) !== expected) {
      conflict = true;
      storageNotice(key, "conflict");
    }
  };
  window.addEventListener("storage", onStorage);
  const saveNow = () => {
    if (!pending || disposed) return;
    try {
      // Проверка нужна и без storage-события: оно может ещё стоять в очереди другой вкладки.
      if (conflict || localStorage.getItem(key) !== expected) {
        conflict = true;
        storageNotice(key, "conflict");
        return;
      }
      const next = JSON.stringify(snapshot());
      localStorage.setItem(key, next);
      expected = next;
      pending = false;
      if (!snapshots.has(key) || snapshots.get(key) === snapshot) recoveries.delete(key);
      storageNotice(key, "saved");
    } catch {
      storageNotice(key, "unavailable");
    }
  };
  const flush = () => {
    if (!pending || disposed || locking) return;
    if (typeof navigator !== "undefined" && navigator.locks) {
      locking = true;
      void navigator.locks.request("trainer-save:" + key, saveNow)
        .catch(() => storageNotice(key, "unavailable"))
        .finally(() => { locking = false; });
    } else saveNow();
  };
  // pagehide не ждёт Promise Web Locks: последний шанс записать синхронно с той же проверкой версии.
  const onVisibility = () => { if (document.visibilityState === "hidden") saveNow(); };
  document.addEventListener("visibilitychange", onVisibility);
  return {
    schedule() {
      pending = true;
      // Снимок доступен для экспорта даже при отключённом localStorage.
      if ("requestIdleCallback" in window) window.requestIdleCallback(flush, { timeout: 400 });
      else setTimeout(flush, 150);
    },
    flush,
    flushBeforeExit: saveNow,
    dispose() {
      saveNow();
      disposed = true;
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
      // Не теряем несохранённый снимок при переходе к другому тесту.
      const last = snapshot();
      if (pending) recoveries.set(key, { value: last, expected, conflict });
      snapshots.delete(key);
    }
  };
}

/** Предупреждение находится вне экрана теста и сохраняется при переключении вкладок приложения. */
export function bindStorageNotice(root: HTMLElement): void {
  const notice = document.createElement("section");
  notice.className = "storage-notice";
  notice.setAttribute("role", "alert");
  notice.hidden = true;
  const text = document.createElement("p");
  const download = document.createElement("button");
  download.type = "button";
  download.className = "btn";
  download.textContent = "Скачать прогресс";
  download.addEventListener("click", () => document.querySelector<HTMLButtonElement>("#exportProgress")?.click());
  const reload = document.createElement("button");
  reload.type = "button";
  reload.className = "btn";
  reload.textContent = "Перезагрузить";
  reload.addEventListener("click", () => {
    if (window.confirm("Несохранённые ответы этой вкладки будут потеряны. Сначала скачайте прогресс. Перезагрузить страницу?")) location.reload();
  });
  notice.append(text, download, reload);
  root.before(notice);
  const problems = new Map<string, string>();
  window.addEventListener("trainer:storage-status", (event) => {
    const { key, kind } = (event as CustomEvent<{ key: string; kind: string }>).detail;
    if (kind === "saved") problems.delete(key);
    else problems.set(key, kind);
    notice.hidden = problems.size === 0;
    text.textContent = [...problems.values()].includes("conflict")
      ? "Сохранение изменено в другой вкладке. Автосохранение этой вкладки остановлено. Скачайте текущие ответы перед перезагрузкой."
      : "Ответы не удалось сохранить на устройстве. При закрытии страницы они могут быть потеряны. Скачайте прогресс в файл.";
  });
}
