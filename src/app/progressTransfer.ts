import type { TestEntry } from "./types";

/** Проверка всего файла до первой записи: посторонние настройки не импортируются. */
export function parseProgress(text: string, allowed: readonly string[]): Record<string, string | null> {
  if (text.length > 1_048_576) throw new Error("Файл слишком большой (не больше 1 МБ).");
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== "object") throw new Error("Это не файл прогресса тренажёра.");
  const { format, version, entries } = data as { format?: unknown; version?: unknown; entries?: unknown };
  if (format !== "trainer-progress" || version !== 1 || !entries || typeof entries !== "object" || Array.isArray(entries)) {
    throw new Error("Это не поддерживаемый файл прогресса тренажёра.");
  }
  const pairs = Object.entries(entries);
  if (!pairs.length || pairs.some(([key, value]) => !allowed.includes(key) || (value !== null && (typeof value !== "object" || Array.isArray(value))))) {
    throw new Error("В файле неподходящие данные. Прогресс не изменён.");
  }
  return Object.fromEntries(pairs.map(([key, value]) => [key, value === null ? null : JSON.stringify(value)]));
}

export function bindProgressTransfer(footer: Element, tests: readonly TestEntry[]): void {
  const details = document.createElement("details");
  details.className = "progress-transfer";
  details.innerHTML = `<summary>Перенести прогресс на другое устройство</summary>
    <p>Скачайте файл с ответами всех тестов и загрузите его на другом устройстве. Файл содержит личные ответы; храните его в защищённом месте.</p>
    <button type="button" class="btn" id="exportProgress">Скачать прогресс</button>
    <label class="btn import-progress" for="importProgress">Загрузить файл</label>
    <input type="file" id="importProgress" accept=".json,application/json">
    <p id="transferStatus" role="status"></p>`;
  footer.prepend(details);
  const keys = tests.map((t) => t.storageKey);
  const status = details.querySelector<HTMLElement>("#transferStatus")!;
  details.querySelector("#exportProgress")!.addEventListener("click", () => {
    try {
      window.dispatchEvent(new Event("trainer:save"));
      const entries = Object.fromEntries(keys.map((key) => [key, JSON.parse(localStorage.getItem(key) ?? "null")]));
      const blob = new Blob([JSON.stringify({ format: "trainer-progress", version: 1, entries }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "trainer-progress.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = "Файл прогресса подготовлен.";
    } catch {
      status.textContent = "Не удалось прочитать сохранение. Проверьте, разрешено ли браузеру хранить данные сайта.";
    }
  });
  const input = details.querySelector<HTMLInputElement>("#importProgress")!;
  input.addEventListener("change", async () => {
    try {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 1_048_576) throw new Error("Файл слишком большой (не больше 1 МБ).");
      const entries = parseProgress(await file.text(), keys);
      if (!window.confirm("Загрузить прогресс из файла? Это заменит текущие ответы соответствующих тестов.")) return;
      window.dispatchEvent(new Event("trainer:save"));
      const before = Object.fromEntries(Object.keys(entries).map((key) => [key, localStorage.getItem(key)]));
      const write = (values: Record<string, string | null>) => {
        for (const [key, value] of Object.entries(values)) {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        }
      };
      try { write(entries); }
      catch (error) { write(before); throw error; }
      location.reload();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "Не удалось загрузить прогресс.";
    } finally {
      input.value = "";
    }
  });
}
