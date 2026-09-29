/** Экранирование текста перед вставкой в HTML-строку. */
export function escapeHtml(s: unknown): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Форма слова по числу: plural(5, "шкала", "шкалы", "шкал") → «шкал». */
export function plural(n: number, one: string, few: string, many: string): string {
  const d = n % 10, dd = n % 100;
  return d === 1 && dd !== 11 ? one : d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? few : many;
}

/** Элемент по id внутри корня экрана (id уникальны: на странице показан один тест). */
export function byId<T extends Element = HTMLElement>(root: ParentNode, id: string): T {
  const el = root.querySelector<T>("#" + id);
  if (!el) throw new Error(`Нет элемента #${id}`);
  return el;
}
