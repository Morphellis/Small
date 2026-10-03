/*
 * Поиск серверных данных в файлах для браузера: ключей шкал, норм, таблиц Т, своих списков ответов,
 * формул Люшера. Запуск — tools/check-leaks.ts (после каждой сборки), проверка самого поиска — tests/server/api.test.ts.
 *
 * Отпечатки берутся из самих серверных данных: любой числовой ряд от пяти чисел (как его запишет сжатый код),
 * пары «среднее, отклонение» норм и начало каждого списка «правильных» ответов.
 */
import { AUTOGENIC_NORM } from "../server/luscher/scoring";
import { QUESTIONNAIRES } from "../server/registry";
import { MMIL_DATA } from "../server/tests/mmil/data";
import { SMIL_DATA } from "../server/tests/smil/data";
import { SMOL_DATA } from "../server/tests/smol/data";

/** Ряд вида 0,1,2,3,4 встречается в любом коде — по нему утечку не опознать. */
const isRun = (a: number[]) => a.every((x, i) => i === 0 || x === a[i - 1] + 1);

export function fingerprints(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (v: unknown, where: string) => {
    if (Array.isArray(v)) {
      if (v.length >= 5 && v.every((x) => typeof x === "number") && !isRun(v.slice(0, 5))) {
        out.set(v.slice(0, 5).join(","), where);
      }
      if (v.length === 2 && v.every((x) => typeof x === "number" && !Number.isInteger(x))) out.set(v.join(","), where);
      v.forEach((x, i) => walk(x, `${where}[${i}]`));
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) walk(x, `${where}.${k}`);
    }
  };
  walk(SMOL_DATA, "SMOL_DATA");
  walk(SMIL_DATA, "SMIL_DATA");
  walk(MMIL_DATA, "MMIL_DATA");
  for (const def of Object.values(QUESTIONNAIRES)) {
    const entries = Object.entries(def.hints).slice(0, 6);
    if (entries.length >= 4) out.set(entries.map(([k, a]) => `${k}:"${a}"`).join(","), `${def.id}.hints`);
  }
  out.set(AUTOGENIC_NORM, "AUTOGENIC_NORM");
  return out;
}

export function findLeaks(files: Map<string, string>): string[] {
  const found: string[] = [];
  const prints = fingerprints();
  for (const [file, text] of files) {
    for (const [print, where] of prints) if (text.includes(print)) found.push(`${file}: «${print}» (${where})`);
  }
  return found;
}
