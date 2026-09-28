/*
 * Подсчёт цветового теста Люшера по восьмицветовому ряду — как на psytests.org.
 * Раскладка — строка из восьми цифр-цветов в порядке предпочтения, например "70615243".
 *
 * Цвета: 0 серый, 1 синий, 2 зелёный, 3 красный, 4 жёлтый (основные — 1–4), 5 фиолетовый, 6 коричневый, 7 чёрный.
 */

/** Аутогенная норма (Вальнёфер): порядок, в котором цвета стоят у человека без напряжения. */
export const AUTOGENIC_NORM = "34251607";

/**
 * Раскладка с наибольшей тревожностью. Проверено на psytests: тревожность 12 из 12 в обоих выборах,
 * совокупное отклонение 32 (наибольшее возможное: это аутогенная норма задом наперёд).
 */
export const MAX_ANXIETY_ORDER = "70615243";

const BASIC = "1234";
const ANTI = "067";

/**
 * Восклицательные знаки тревожности по позициям (0–3 на каждую).
 * Основной цвет (1–4) на 6-м месте — «!», на 7-м — «!!», на 8-м — «!!!».
 * Дополнительный (0, 6, 7) на 3-м месте — «!», на 2-м — «!!», на 1-м — «!!!».
 */
export function anxietyMarks(order: string): number[] {
  return [...order].map((c, i) => {
    const pos = i + 1;
    if (BASIC.includes(c) && pos >= 6) return pos - 5;
    if (ANTI.includes(c) && pos <= 3) return 4 - pos;
    return 0;
  });
}

/** Показатель тревожности: сумма знаков, 0–12. */
export function anxiety(order: string): number {
  return anxietyMarks(order).reduce((a, b) => a + b, 0);
}

export interface Band {
  from: number;
  to: number;
  label: string;
  tone: "ok" | "mid" | "high" | "max";
}

/** Уровни тревожности. Границы — как на шкале psytests (0–2, 3–6, 7–10, 11–12). */
export const ANXIETY_BANDS: Band[] = [
  { from: 0, to: 2, label: "тревога не выражена", tone: "ok" },
  { from: 3, to: 6, label: "эмоциональная напряжённость", tone: "mid" },
  { from: 7, to: 10, label: "выраженная тревога", tone: "high" },
  { from: 11, to: 12, label: "психологический и физиологический стресс", tone: "max" }
];

export function bandOf(bands: Band[], x: number): Band {
  return bands.find((b) => x >= b.from && x <= b.to) ?? bands[bands.length - 1];
}

const posOf = (order: string, c: string) => order.indexOf(c) + 1;

/** Совокупное (суммарное) отклонение от аутогенной нормы: 0–32. */
export function deviation(order: string): number {
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Math.abs(i + 1 - posOf(order, AUTOGENIC_NORM[i]));
  return sum;
}

/** Вегетативный коэффициент Шипоша: (18 − место красного − место жёлтого) / (18 − место синего − место зелёного). */
export function vegetative(order: string): number {
  return (18 - posOf(order, "3") - posOf(order, "4")) / (18 - posOf(order, "1") - posOf(order, "2"));
}

/** ВК так, как его пишет psytests: один знак после запятой, лишнее отбрасывается (0.375 → 0.3). */
export function vegetativeText(order: string): string {
  return (Math.floor(vegetative(order) * 10 + 1e-9) / 10).toFixed(1);
}

/** Общепринятые уровни ВК. */
export const VEGETATIVE_BANDS: { to: number; label: string; tone: Band["tone"] }[] = [
  { to: 0.5, label: "истощение, хроническое переутомление", tone: "max" },
  { to: 0.91, label: "компенсируемое утомление, экономия сил", tone: "mid" },
  { to: 1.9, label: "оптимальная рабочая мобилизация", tone: "ok" },
  { to: Infinity, label: "перевозбуждение, неэкономная трата сил", tone: "high" }
];

export function vegetativeBand(vk: number) {
  return VEGETATIVE_BANDS.find((b) => vk <= b.to)!;
}
