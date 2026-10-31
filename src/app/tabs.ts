/** Стрелки переключают вкладки, Tab входит только в выбранную. */
export function bindTabs(list: HTMLElement, signal: AbortSignal): void {
  list.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const tabs = [...list.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const index = tabs.indexOf(e.target as HTMLButtonElement);
    if (index < 0) return;
    let next: number;
    if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    e.stopPropagation();
    tabs[next].focus();
    tabs[next].click();
  }, { signal });
}
