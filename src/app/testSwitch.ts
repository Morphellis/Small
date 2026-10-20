/*
 * Переключатель тестов «СМОЛ | СМИЛ | …». Строится из реестра, поэтому новый тест появляется в нём сам.
 * Любой тест ставит его в свою шапку: testSwitchHtml в разметку, затем bindTestSwitch.
 */
import { escapeHtml } from "./html";
import type { AppContext } from "./types";

export function testSwitchHtml(ctx: AppContext): string {
  const buttons = ctx.tests.map(
    (t) =>
      `<button type="button" data-test="${t.id}" title="${escapeHtml(t.hint)}">` +
      `<b>${escapeHtml(t.title)}</b><small>${escapeHtml(t.subtitle)}</small></button>`
  );
  // Это переходы между тестами, а не вкладки: открытый тест отмечен aria-current.
  return `<nav class="test-switch" id="testList" aria-label="Тесты">\n  ${buttons.join("\n  ")}\n</nav>`;
}

/** Подсветить открытый тест. */
function markTestSwitch(container: ParentNode, currentId: string): void {
  for (const b of container.querySelectorAll<HTMLButtonElement>(".test-switch button")) {
    const on = b.dataset.test === currentId;
    b.classList.toggle("on", on);
    if (on) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
  // На телефоне строка листается вбок — открытый тест не должен прятаться за краем.
  const nav = container.querySelector<HTMLElement>(".test-switch");
  const cur = nav?.querySelector<HTMLElement>("button.on");
  if (nav && cur && nav.scrollWidth > nav.clientWidth) {
    nav.scrollLeft = Math.max(0, cur.offsetLeft + cur.offsetWidth / 2 - nav.clientWidth / 2);
  }
}

export function bindTestSwitch(container: ParentNode, ctx: AppContext, signal: AbortSignal): void {
  markTestSwitch(container, ctx.currentId);
  for (const b of container.querySelectorAll<HTMLButtonElement>(".test-switch button")) {
    b.addEventListener("click", () => ctx.switchTo(b.dataset.test!), { signal });
  }
}
