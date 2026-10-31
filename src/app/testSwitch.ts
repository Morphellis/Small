/*
 * Переключатель тестов «СМОЛ | СМИЛ | …». Строится из реестра, поэтому новый тест появляется в нём сам.
 * Любой тест ставит его в свою шапку: testSwitchHtml в разметку, затем bindTestSwitch.
 */
import { bindTabs } from "./tabs";
import { escapeHtml } from "./html";
import type { AppContext } from "./types";

export function testSwitchHtml(ctx: AppContext): string {
  const buttons = ctx.tests.map(
    (t) =>
      `<button type="button" role="tab" id="test-tab-${t.id}" aria-controls="testContent" data-test="${t.id}" title="${escapeHtml(t.hint)}">` +
      `<b>${escapeHtml(t.title)}</b><small>${escapeHtml(t.subtitle)}</small></button>`
  );
  return `<div class="test-switch" role="tablist" aria-label="Тест">\n  ${buttons.join("\n  ")}\n</div>`;
}

/** Подсветить открытый тест. */
function markTestSwitch(container: ParentNode, currentId: string): void {
  for (const b of container.querySelectorAll<HTMLButtonElement>(".test-switch button")) {
    const on = b.dataset.test === currentId;
    b.classList.toggle("on", on);
    b.tabIndex = on ? 0 : -1;
    b.setAttribute("aria-selected", String(on));
  }
}

export function bindTestSwitch(container: ParentNode, ctx: AppContext, signal: AbortSignal): void {
  markTestSwitch(container, ctx.currentId);
  const list = container.querySelector<HTMLElement>(".test-switch")!;
  bindTabs(list, signal);
  const overflow = () => {
    list.classList.remove("can-scroll");
    const scrolls = list.scrollWidth > list.clientWidth + 1;
    list.classList.toggle("can-scroll", scrolls);
    list.setAttribute("aria-label", scrolls ? "Тест, прокручивается горизонтально" : "Тест");
  };
  overflow();
  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(overflow);
    observer.observe(list);
    signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  }
  container.querySelector<HTMLElement>(".test-switch .on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  for (const b of container.querySelectorAll<HTMLButtonElement>(".test-switch button")) {
    b.addEventListener("click", () => ctx.switchTo(b.dataset.test!), { signal });
  }
}
