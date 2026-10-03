/*
 * Обмен с сервером (server/api.ts). Адреса относительные (api/…): сайт работает и в корне домена, и в подпапке.
 */
import type { Scope } from "./scope";

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, init: { body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(new URL(path, document.baseURI), {
    method: init.body === undefined ? "GET" : "POST",
    headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal
  });
  if (!res.ok) {
    const msg = await res.json().then((j: { error?: string }) => j.error ?? "", () => "");
    throw new ApiError(res.status, msg || `ошибка ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface Sync {
  /** Состояние поменялось — результат нужно пересчитать. */
  request(): void;
}

/**
 * Держит результат с сервера в согласии с тем, что на экране. После каждого изменения — request().
 * В пути не больше одного запроса: если, пока он шёл, состояние снова поменялось, сразу после ответа уходит
 * следующий, с последним состоянием (быстрые ответы подряд склеиваются в один запрос).
 * Нет связи — повтор через 1, 2, 4… до 15 с, а как только браузер снова в сети — сразу.
 */
export function createSync<T>(scope: Scope, opts: {
  /** Запрос по текущему состоянию (вызывается в момент отправки). */
  send(signal: AbortSignal): Promise<T>;
  onResult(result: T): void;
  /** Идёт ли запрос: для aria-busy и проверок в браузере. */
  onBusy?(busy: boolean): void;
  onError?(error: unknown): void;
}): Sync {
  let version = 0;
  let doneVersion = -1;
  let inFlight = false;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let delay = 1000;

  async function pump() {
    if (inFlight || retry || doneVersion === version || scope.signal.aborted) return;
    inFlight = true;
    opts.onBusy?.(true);
    const v = version;
    try {
      const result = await opts.send(scope.signal);
      if (scope.signal.aborted) return;
      doneVersion = v;
      delay = 1000;
      opts.onResult(result);
    } catch (e) {
      if (scope.signal.aborted) return;
      opts.onError?.(e);
      retry = setTimeout(() => { retry = null; void pump(); }, delay);
      delay = Math.min(delay * 2, 15_000);
    } finally {
      inFlight = false;
    }
    if (doneVersion === version || retry) opts.onBusy?.(false);
    if (!retry) void pump();
  }

  scope.add(() => { if (retry) clearTimeout(retry); });
  scope.on(window, "online", () => {
    if (retry) { clearTimeout(retry); retry = null; }
    void pump();
  });

  return {
    request() {
      version++;
      void pump();
    }
  };
}
