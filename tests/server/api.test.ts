/*
 * REST API подсчёта (server/api.ts) по-настоящему, через HTTP: ответы, проверки входа, чужие сайты.
 * Плюс граница клиент/сервер: код сайта (src/) не тянет ничего из server/.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { handleApi } from "../../server/api";
import { scoreLuscher } from "../../server/luscher/score";
import { computeProfile, publicKeys } from "../../server/questionnaire/engine";
import { createRateLimiter } from "../../server/rateLimit";
import { QUESTIONNAIRES } from "../../server/registry";
import { findLeaks } from "../../tools/leaks";
import { currentStep, MAX_ANXIETY_ORDER, type Pick } from "../../src/kinds/luscher/flow";

let base = "";
let server: http.Server;

beforeAll(async () => {
  server = http.createServer((req, res) => void handleApi(req, res, new URL(req.url!, "http://x").pathname));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const post = (p: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("опросники", () => {
  test("профиль с сервера тот же, что считает движок", async () => {
    for (const def of Object.values(QUESTIONNAIRES)) {
      const answers = def.questions.map((_, i) => (["Y", "N", "."] as const)[i % 3]).join("");
      const res = await post(`/api/questionnaire/${def.id}/score`, { answers });
      expect(res.status, def.id).toBe(200);
      const { profile } = await res.json();
      expect(profile, def.id).toEqual(computeProfile(def, [...answers].map((c) => (c === "." ? null : c))));
    }
  });

  test("ключ отдаётся только по отслеживаемым шкалам", async () => {
    const def = QUESTIONNAIRES.smil;
    const res = await fetch(`${base}/api/questionnaire/smil/keys`);
    const body = await res.json();
    expect(body).toEqual(JSON.parse(JSON.stringify(publicKeys(def))));
    const focus = new Set(def.ui.focus);
    for (const list of body.keys) for (const k of list) expect(focus.has(k.scale)).toBe(true);
    // Шкал вне упора (3, 4, 5, 6, 9, 0) в ответе нет вовсе.
    expect(JSON.stringify(body)).not.toMatch(/"scale":"[034569]"/);
  });

  test("неверные ответы, чужой тест, метод и тип — понятные ошибки", async () => {
    const n = QUESTIONNAIRES.mmil.questions.length;
    expect((await post("/api/questionnaire/mmil/score", { answers: "Y".repeat(n - 1) })).status).toBe(400);
    expect((await post("/api/questionnaire/mmil/score", { answers: "?".repeat(n) })).status).toBe(400); // в ММИЛ нет «Не знаю»
    expect((await post("/api/questionnaire/mmil/score", { answers: 5 })).status).toBe(400);
    expect((await post("/api/questionnaire/nope/score", { answers: "" })).status).toBe(404);
    expect((await post("/api/questionnaire/__proto__/score", { answers: "" })).status).toBe(404);
    expect((await fetch(`${base}/api/questionnaire/smol/score`)).status).toBe(405);
    const text = await fetch(`${base}/api/questionnaire/smol/score`, { method: "POST", body: "answers" });
    expect(text.status).toBe(415);
    const big = await post("/api/questionnaire/smol/score", { answers: "Y".repeat(20000) });
    expect(big.status).toBe(413);
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
  });

  test("запрос со страницы чужого сайта отклоняется, со своего — нет", async () => {
    const answers = ".".repeat(71);
    const host = new URL(base).host;
    expect((await post("/api/questionnaire/smol/score", { answers }, { Origin: "https://evil.example" })).status).toBe(403);
    expect((await post("/api/questionnaire/smol/score", { answers }, { Origin: `http://${host}` })).status).toBe(200);
  });
});

describe("Люшер", () => {
  /** Пройти тест по раскладке наибольшей тревожности. */
  function maxLog(variant: "short" | "full"): Pick[] {
    const log: Pick[] = [];
    for (let s = currentStep(variant, log); s; s = currentStep(variant, log)) {
      const k = log.filter((p) => p.step === s!.id).length;
      let value = 0;
      if (s.kind === "rank") value = Number(MAX_ANXIETY_ORDER[variant === "full" && k >= 5 ? (k === 5 ? 7 : 6) : k]);
      else if (s.kind === "achromatic") value = k;
      else if (s.kind === "pairs") value = 1;
      else if (s.kind === "figures") value = k;
      log.push({ step: s.id, value });
    }
    return log;
  }

  test("результат по журналу: тревожность 12, отклонение 32", async () => {
    for (const variant of ["short", "full"] as const) {
      const res = await post(`/api/luscher/${variant}/score`, { log: maxLog(variant) });
      const r = await res.json();
      expect(r.main, variant).toMatchObject({ n: 2, anxiety: 12, deviation: 32 });
      expect(r.second.order).toBe(MAX_ANXIETY_ORDER);
    }
  });

  test("подделанный журнал не ломает подсчёт", async () => {
    expect(scoreLuscher("short", [{ step: "rank2", value: 3 }])).toEqual({ first: null, second: null, main: null });
    expect((await post("/api/luscher/short/score", { log: [{ step: 1, value: "x" }] })).status).toBe(400);
    expect((await post("/api/luscher/short/score", { log: new Array(500).fill({ step: "rank1", value: 1 }) })).status).toBe(400);
    expect((await post("/api/luscher/medium/score", { log: [] })).status).toBe(404);
  });
});

test("ограничение частоты: подряд — сколько разрешено, дальше по скорости наполнения", () => {
  const rl = createRateLimiter(3, 2);
  expect([1, 2, 3, 4].map(() => rl.take("a", 1000))).toEqual([true, true, true, false]);
  expect(rl.take("b", 1000)).toBe(true); // у другого адреса своё ведро
  expect(rl.take("a", 1400)).toBe(false);
  expect(rl.take("a", 1600)).toBe(true); // через 0,5 с — один жетон
});

test("проверка утечек находит серверные данные в файлах сайта", () => {
  const hints = Object.entries(QUESTIONNAIRES.smol.hints).slice(0, 6).map(([k, a]) => `${k}:"${a}"`).join(",");
  const leaked = new Map([["x.js", `const h={${hints},40:"Y"}`], ["y.js", "const ok=[0,1,2,3,4,5]"]]);
  expect(findLeaks(leaked).length).toBe(1);
});

test("код сайта (src/) не импортирует серверный (server/)", () => {
  const bad: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.ts$/.test(e.name) && /from\s+["'][^"']*\/server\//.test(fs.readFileSync(p, "utf8"))) bad.push(p);
    }
  };
  walk("src");
  expect(bad).toEqual([]);
});
