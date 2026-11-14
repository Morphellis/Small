import { trainingHome, trainingView, trainingWidgetHtml } from './telegramTraining';

async function callTelegram(token:string, method:string, body:unknown):Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal:AbortSignal.timeout(8000)
    });
    const result = await response.json() as {ok?:boolean; description?:string};
    return result.ok === true || (method === 'editMessageText' && result.description?.includes('message is not modified') === true);
  } catch { return false; }
}

export async function configureTelegramWebhook(request:Request, secret:string | undefined, token:string | undefined):Promise<Response> {
  if (request.method !== 'POST') return Response.json({error:'method not allowed'},{status:405});
  if (!secret || !token) return Response.json({error:'bot is not configured'},{status:503});
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== secret &&
      request.headers.get('Authorization') !== `Bearer ${token}`) return Response.json({error:'unauthorized'},{status:403});
  const ok = await callTelegram(token,'setWebhook',{
    url:new URL('/api/telegram/webhook',request.url).href, secret_token:secret, allowed_updates:['message','callback_query']
  });
  return Response.json({ok},{status:ok ? 200 : 502});
}

export async function telegramWebhook(request: Request, secret: string | undefined, token?:string): Promise<Response> {
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
  const callback = update?.callback_query;
  if (callback && typeof callback.id === 'string') {
    const answer = (text?:string) => json({method:'answerCallbackQuery',callback_query_id:callback.id,...(text ? {text,show_alert:true} : {})});
    const message = callback.message;
    if (message?.chat?.type !== 'private' || !Number.isSafeInteger(message.chat.id) ||
        message.chat.id !== callback.from?.id || !Number.isSafeInteger(message.message_id)) return answer();
    const card = typeof callback.data === 'string' && callback.data.length <= 64 ? trainingView(callback.data) : null;
    if (!card) return answer('Эта кнопка недоступна. Откройте меню командой /learn.');
    if (!token) return answer('Раздел пока не настроен. Используйте полный тренажёр.');
    const ok = await callTelegram(token,'editMessageText',{chat_id:message.chat.id,message_id:message.message_id,...card});
    return answer(ok ? undefined : 'Не удалось обновить вопрос. Нажмите кнопку ещё раз.');
  }
  const message = update?.message;
  if (message?.chat?.type !== "private" || !Number.isSafeInteger(message.chat.id) ||
      typeof message.text !== "string") return json({ ok: true });
  const command = /^\/(start|help|app|learn|scales)(?:@[a-zA-Z0-9_]+)?(?:\s|$)/i.test(message.text);
  const home = trainingHome();
  if (command) return json({
    method:'sendWidget', chat_id:message.chat.id, html:trainingWidgetHtml(), caption:home.text,
    reply_markup:home.reply_markup
  });
  return json({
    method: "sendMessage",
    chat_id: message.chat.id,
    text: command ? home.text : 'Для прохождения тестов нажмите «Открыть тренажёр». Для изучения вопросов по шкалам выберите тест ниже.',
    reply_markup: home.reply_markup
  });
}
