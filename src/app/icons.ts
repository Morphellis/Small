/*
 * Значки кнопок. Один набор, одна толщина линии: рисуются цветом текста кнопки, поэтому одинаково
 * выглядят в обеих темах и на любой системе (символы вроде ☀ и ↺ шрифты рисуют по-разному).
 */
const svg = (body: string) =>
  `<svg class="ico" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICON = {
  sun: svg(`<circle cx="10" cy="10" r="3.4"/><path d="M10 1.8v2M10 16.2v2M1.8 10h2M16.2 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4"/>`),
  moon: svg(`<path d="M16.5 12.2A6.8 6.8 0 0 1 7.8 3.5a6.8 6.8 0 1 0 8.7 8.7z"/>`),
  reset: svg(`<path d="M3.5 10a6.5 6.5 0 1 0 2-4.7"/><path d="M3.2 2.8v3.6h3.6"/>`),
  back: svg(`<path d="M16 10H4.5M9 5.2 4.2 10 9 14.8"/>`),
  close: svg(`<path d="M5 5l10 10M15 5 5 15"/>`),
  check: svg(`<path d="M4 10.5l3.8 3.8L16 6"/>`),
  cross: svg(`<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>`),
  chevron: svg(`<path d="M5.5 8l4.5 4.5L14.5 8"/>`),
  chevronUp: svg(`<path d="M5.5 12l4.5-4.5 4.5 4.5"/>`),
  more: `<svg class="ico" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false" fill="currentColor"><circle cx="4.5" cy="10" r="1.6"/><circle cx="10" cy="10" r="1.6"/><circle cx="15.5" cy="10" r="1.6"/></svg>`
} as const;
