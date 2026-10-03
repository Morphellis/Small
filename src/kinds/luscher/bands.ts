/*
 * Уровни тревожности Люшера. Это деления шкалы на экране, а не формула, поэтому они общие для браузера и сервера.
 */

export interface Band {
  from: number;
  to: number;
  label: string;
  tone: "ok" | "mid" | "high" | "max";
}

/** Границы — как на шкале psytests (0–2, 3–6, 7–10, 11–12). */
export const ANXIETY_BANDS: Band[] = [
  { from: 0, to: 2, label: "тревога не выражена", tone: "ok" },
  { from: 3, to: 6, label: "эмоциональная напряжённость", tone: "mid" },
  { from: 7, to: 10, label: "выраженная тревога", tone: "high" },
  { from: 11, to: 12, label: "психологический и физиологический стресс", tone: "max" }
];

export function bandOf(bands: Band[], x: number): Band {
  return bands.find((b) => x >= b.from && x <= b.to) ?? bands[bands.length - 1];
}
