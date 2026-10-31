import { readString, writeString } from "./storage";

const KEY = "trainer-shortcuts";
let enabled = readString(KEY) !== "off";
export const shortcutsEnabled = () => enabled;

export function bindShortcuts(button: HTMLElement, signal: AbortSignal): void {
  const render = () => {
    const enabled = shortcutsEnabled();
    button.setAttribute("aria-pressed", String(enabled));
    button.setAttribute("aria-label", `Горячие клавиши: ${enabled ? "включены" : "выключены"}`);
    button.title = `Горячие клавиши ${enabled ? "включены — отключить" : "выключены — включить"}`;
  };
  button.addEventListener("click", () => {
    enabled = !enabled;
    writeString(KEY, enabled ? "on" : "off");
    render();
  }, { signal });
  render();
}

export function isTyping(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="tablist"]');
}
