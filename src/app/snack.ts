/*
 * Короткое сообщение внизу экрана, при необходимости с кнопкой «Вернуть». Так необратимые на вид действия
 * (снять ответ, сбросить всё) делаются сразу, без окна «Вы уверены?», а ошибку можно отменить.
 * Одно сообщение на экран: новое заменяет старое. Живёт в Scope экрана и убирается вместе с ним.
 */
import type { Scope } from "./scope";

export interface SnackAction {
  label: string;
  run: () => void;
}

export interface Snack {
  show(msg: string, action?: SnackAction): void;
  hide(): void;
}

export function createSnack(root: HTMLElement, scope: Scope): Snack {
  root.insertAdjacentHTML("beforeend", `<div class="snack" role="status" aria-live="polite" hidden><span class="snack-msg"></span><button type="button" class="snack-act" hidden></button></div>`);
  const box = root.lastElementChild as HTMLElement;
  const msgEl = box.querySelector<HTMLElement>(".snack-msg")!;
  const btn = box.querySelector<HTMLButtonElement>(".snack-act")!;
  let action: SnackAction | null = null;
  let ticket = 0;

  function hide() {
    ticket++;
    action = null;
    box.hidden = true;
  }

  scope.on(btn, "click", () => {
    const a = action;
    hide();
    a?.run();
  });
  scope.on(document, "keydown", (e) => {
    // Ctrl+Z — то же, что «Вернуть», пока сообщение на экране.
    if (action && (e.ctrlKey || e.metaKey) && e.code === "KeyZ") {
      e.preventDefault();
      btn.click();
    }
  });

  return {
    hide,
    show(msg, a) {
      const t = ++ticket;
      action = a ?? null;
      msgEl.textContent = msg;
      btn.hidden = !a;
      btn.textContent = a ? a.label : "";
      box.hidden = false;
      // С кнопкой — дольше: человеку нужно время, чтобы понять, что произошло, и дотянуться до неё.
      scope.timeout(() => { if (t === ticket) hide(); }, a ? 8000 : 3000);
    }
  };
}
