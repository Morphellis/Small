/*
 * Ограничение частоты запросов с одного адреса («ведро с жетонами»): человек отвечает самое большее
 * несколько раз в секунду, а программа, которая перебором вытаскивает ключи, — сотни. Лишнее получает 429.
 */

export interface RateLimiter {
  /** true — запрос можно выполнить; false — слишком часто. */
  take(key: string, now?: number): boolean;
}

/**
 * burst — сколько запросов можно сделать подряд; perSecond — с какой скоростью ведро наполняется обратно.
 * Память не растёт бесконечно: давно молчащие адреса раз в минуту забываются.
 */
export function createRateLimiter(burst: number, perSecond: number): RateLimiter {
  const buckets = new Map<string, { tokens: number; at: number }>();
  let lastSweep = 0;
  return {
    take(key, now = Date.now()) {
      if (now - lastSweep > 60_000) {
        lastSweep = now;
        const fullAfter = (burst / perSecond) * 1000;
        for (const [k, b] of buckets) if (now - b.at > fullAfter) buckets.delete(k);
      }
      const b = buckets.get(key) ?? { tokens: burst, at: now };
      b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 1000) * perSecond);
      b.at = now;
      buckets.set(key, b);
      if (b.tokens < 1) return false;
      b.tokens -= 1;
      return true;
    }
  };
}
