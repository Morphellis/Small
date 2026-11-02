/** Telegram accepts a Bot API method in the webhook response; no bot token is needed here. */
export async function telegramWebhook(request: Request, secret: string | undefined): Promise<Response> {
  const json = (body: unknown, status = 200) => Response.json(body, { status });
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!secret) return json({ error: "bot is not configured" }, 503);
  if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) {
    return json({ error: "unauthorized" }, 403);
  }
  // Read with a bound rather than trusting Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "invalid update" }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 64 * 1024) {
      await reader.cancel();
      return json({ error: "update too large" }, 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let update;
  try { update = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { return json({ error: "invalid JSON" }, 400); }
  const message = update?.message;
  if (message?.chat?.type !== "private" || !Number.isSafeInteger(message.chat.id) ||
      typeof message.text !== "string") return json({ ok: true });
  const command = /^\/(start|help|app)(?:@[a-zA-Z0-9_]+)?(?:\s|$)/i.test(message.text);
  return json({
    method: "sendMessage",
    chat_id: message.chat.id,
    text: command
      ? "Small — тренажёр психологических тестов.\n\nДоступны СМОЛ, СМИЛ, ММИЛ и тест Люшера. Баллы и профиль обновляются после каждого ответа.\n\nДля работы с тестами откройте приложение."
      : "Тесты доступны в приложении. Для продолжения нажмите «Открыть тренажёр».",
    reply_markup: { inline_keyboard: [[{
      text: "Открыть тренажёр",
      web_app: { url: "https://small.morphellis.workers.dev/" }
    }]] }
  });
}
