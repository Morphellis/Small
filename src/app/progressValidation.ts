import { replayValid } from "../kinds/luscher/model";

const questionnaires: Record<string, { count: number; unknown: boolean }> = {
  "smol-trainer-v1": { count: 71, unknown: true },
  "smil-trainer-v1": { count: 566, unknown: true },
  "mmil-trainer-v1": { count: 377, unknown: false }
};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Строже восстановления старого localStorage: импорт не должен молча исправлять повреждённые ответы. */
export function validProgressEntry(key: string, value: unknown): boolean {
  if (value === null) return true;
  if (!object(value)) return false;
  const q = questionnaires[key];
  if (q) {
    const answer = (a: unknown) => a === null || a === "Y" || a === "N" || (q.unknown && a === "?");
    if (!Array.isArray(value.answers) || value.answers.length !== q.count || !value.answers.every(answer)) return false;
    if (value.currentQuestion !== undefined && (!Number.isInteger(value.currentQuestion) || Number(value.currentQuestion) < 0 || Number(value.currentQuestion) >= q.count)) return false;
    if (value.history !== undefined && (!Array.isArray(value.history) || value.history.length !== q.count ||
      !value.history.every((h) => Array.isArray(h) && h.every(answer)))) return false;
    for (const field of ["keyMode", "showProfile", "showProfileWide", "stripAll"]) {
      if (value[field] !== undefined && typeof value[field] !== "boolean") return false;
    }
    if (value.profileView !== undefined && !["table", "bars", "chart"].includes(String(value.profileView))) return false;
    if (value.viewV !== undefined && value.viewV !== 2) return false;
    return Object.keys(value).every((k) => ["answers", "history", "currentQuestion", "keyMode", "showProfile", "showProfileWide", "stripAll", "profileView", "viewV"].includes(k));
  }
  const variant = key === "luscher8-trainer-v1" ? "short" : key === "luscher-full-trainer-v1" ? "full" : null;
  if (!variant || !Array.isArray(value.log) || value.log.length > 200 || replayValid(variant, value.log).length !== value.log.length) return false;
  if (value.keyMode !== undefined && typeof value.keyMode !== "boolean") return false;
  if (value.layouts !== undefined) {
    if (!object(value.layouts) || !Object.entries(value.layouts).every(([k, layout]) =>
      ["rank1", "rank2"].includes(k) && Array.isArray(layout) && layout.length === 8 &&
      layout.every(Number.isInteger) && [...layout].sort().join("") === "01234567")) return false;
  }
  return Object.keys(value).every((k) => ["log", "layouts", "keyMode"].includes(k));
}
