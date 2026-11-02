import { describe, expect, test } from "vitest";
import { telegramWebhook } from "../../server/telegram";

const secret = "test-only-secret";
function request(body: unknown, key = secret) {
  return new Request("https://example.test/api/telegram/webhook", {
    method: "POST", headers: { "X-Telegram-Bot-Api-Secret-Token": key }, body: JSON.stringify(body)
  });
}
describe("Telegram webhook", () => {
  test("requires configured secret and authenticates before handling messages", async () => {
    expect((await telegramWebhook(request({}), undefined)).status).toBe(503);
    expect((await telegramWebhook(request({}, "wrong"), secret)).status).toBe(403);
  });
  test("start deep links receive a real Mini App button in a private chat", async () => {
    const r = await telegramWebhook(request({message:{chat:{id:123,type:"private"},text:"/start campaign"}}), secret);
    const body = await r.json();
    expect(body.method).toBe("sendMessage");
    expect(body.chat_id).toBe(123);
    expect(body.text).toContain("Добро пожаловать");
    expect(body.reply_markup.inline_keyboard[0][0].web_app.url).toBe("https://small.morphellis.workers.dev/");
  });
  test("ignores groups and non-message updates", async () => {
    for (const body of [{message:{chat:{id:-123,type:"group"},text:"/start"}}, {callback_query:{}}]) {
      expect(await (await telegramWebhook(request(body), secret)).json()).toEqual({ok:true});
    }
  });
  test("ordinary private text also explains how to open the app", async () => {
    const r = await telegramWebhook(request({message:{chat:{id:123,type:"private"},text:"привет"}}), secret);
    expect((await r.json()).text).toContain("мини-приложении");
  });
  test("rejects malformed and oversized bodies", async () => {
    const headers = {"X-Telegram-Bot-Api-Secret-Token":secret};
    expect((await telegramWebhook(new Request("https://example.test", {method:"POST",headers,body:"{"}),secret)).status).toBe(400);
    expect((await telegramWebhook(request("x".repeat(65537)),secret)).status).toBe(413);
  });
});
