/*
 * REST API подсчёта. Браузер присылает ответы — сервер возвращает готовый результат; ключи, нормы и формулы
 * наружу не уходят. Сервер ничего не хранит: каждый запрос несёт все ответы целиком.
 *
 *   GET  api/health                          — жив ли сервер (для Docker и мониторинга)
 *   GET  api/questionnaire/<id>/keys         — ключ по отслеживаемым шкалам и свой список ответов
 *   POST api/questionnaire/<id>/score        { answers: "YN?.…" }  → { profile }
 *   POST api/luscher/<short|full>/score      { log: [{ step, value }, …] } → результат
 *
 * Работает и в собранном сервере (server/main.ts), и внутри dev-сервера Vite (vite.config.ts).
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { decodeAnswers } from "../src/kinds/questionnaire/answers";
import type { KeysResponse, ScoreResponse } from "../src/kinds/questionnaire/types";
import type { Pick, Variant } from "../src/kinds/luscher/flow";
import type { LuscherResult } from "../src/kinds/luscher/types";
import { scoreLuscher } from "./luscher/score";
import { computeProfile, publicKeys } from "./questionnaire/engine";
import { LUSCHER_VARIANTS, QUESTIONNAIRES } from "./registry";

/** Больше любого честного запроса: 566 ответов СМИЛ или журнал полного Люшера — это единицы КБ. */
const MAX_BODY = 16 * 1024;
/** Длиннее журнал полного теста Люшера не бывает (даже с повторами всех таблиц). */
const MAX_LOG = 200;

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown, cache = "no-store"): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(data),
    "Cache-Control": cache
  });
  res.end(data);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!/^application\/json\b/i.test(req.headers["content-type"] ?? "")) throw new HttpError(415, "нужен JSON");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, "слишком большой запрос");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "не JSON");
  }
}

/**
 * Запрос со страницы чужого сайта браузер подписывает его адресом (Origin) — такие отклоняем, чтобы чужая
 * копия сайта не могла считать на нашем сервере. Это не защита от программ, которые шлют запросы напрямую:
 * от них — ограничение частоты (server/rateLimit.ts).
 */
function checkOrigin(req: IncomingMessage): void {
  const origin = req.headers.origin;
  if (!origin) return;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    throw new HttpError(403, "чужой сайт");
  }
  if (host !== req.headers.host) throw new HttpError(403, "чужой сайт");
}

const isPick = (p: unknown): p is Pick =>
  !!p && typeof p === "object" && typeof (p as Pick).step === "string" && (p as Pick).step.length <= 20 &&
  Number.isInteger((p as Pick).value);

async function route(req: IncomingMessage, path: string): Promise<{ status: number; body: unknown; cache?: string }> {
  const parts = path.split("/").filter(Boolean); // ["api", …]
  const method = req.method ?? "GET";
  const expect = (m: string) => { if (method !== m) throw new HttpError(405, "метод не подходит"); };

  if (parts.length === 2 && parts[1] === "health") {
    expect("GET");
    return { status: 200, body: { ok: true } };
  }

  if (parts.length === 4 && parts[1] === "questionnaire") {
    const def = Object.hasOwn(QUESTIONNAIRES, parts[2]) ? QUESTIONNAIRES[parts[2]] : undefined;
    if (!def) throw new HttpError(404, "нет такого теста");
    if (parts[3] === "keys") {
      expect("GET");
      const body: KeysResponse = publicKeys(def);
      return { status: 200, body, cache: "no-cache" };
    }
    if (parts[3] === "score") {
      expect("POST");
      checkOrigin(req);
      const json = await readJson(req);
      const answers = decodeAnswers(def, (json as { answers?: unknown } | null)?.answers);
      if (!answers) throw new HttpError(400, "ответы не подходят к тесту");
      const body: ScoreResponse = { profile: computeProfile(def, answers) };
      return { status: 200, body };
    }
  }

  if (parts.length === 4 && parts[1] === "luscher" && parts[3] === "score") {
    const variant = parts[2] as Variant;
    if (!LUSCHER_VARIANTS.includes(variant)) throw new HttpError(404, "нет такого теста");
    expect("POST");
    checkOrigin(req);
    const json = await readJson(req);
    const log = (json as { log?: unknown } | null)?.log;
    if (!Array.isArray(log) || log.length > MAX_LOG || !log.every(isPick)) throw new HttpError(400, "журнал выборов не подходит");
    const body: LuscherResult = scoreLuscher(variant, log);
    return { status: 200, body };
  }

  throw new HttpError(404, "нет такого адреса");
}

/** Обработать запрос к api/… (path — путь без адреса сайта, начинается с "/api/"). */
export async function handleApi(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  try {
    const r = await route(req, path);
    sendJson(res, r.status, r.body, r.cache);
  } catch (e) {
    if (e instanceof HttpError) {
      sendJson(res, e.status, { error: e.message });
    } else {
      console.error("api:", e);
      sendJson(res, 500, { error: "ошибка сервера" });
    }
  }
}
