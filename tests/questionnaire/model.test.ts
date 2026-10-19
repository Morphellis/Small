/*
 * Модель прохождения опросника: ответы, история, «что изменилось», сохранение и загрузка (формат прежний).
 */
import { describe, expect, test } from "vitest";
import { computeProfile, questionKeys } from "../../server/questionnaire/engine";
import { smil } from "../../server/tests/smil/definition";
import { smol } from "../../server/tests/smol/definition";
import { answerEffect, answeredCount, applyAnswer, defaultPrefs, emptySession, lastAnswer, loadSaved, nextUnanswered, toSaved, undoAnswer } from "../../src/kinds/questionnaire/model";

const focus = new Set(smol.ui.focus);

describe("ответы", () => {
  test("ответ, смена ответа и повторный клик (снять) пишутся в историю", () => {
    const s = emptySession(smol);
    expect([..."YNN"].map((v) => applyAnswer(s, 8, v as "Y" | "N"))).toEqual(["Y", "N", null]);
    expect(s.answers[8]).toBe(null);
    expect(s.history[8]).toEqual(["Y", "N", null]);
  });


  test("«Вернуть» после снятого ответа: ответ и история — как до снятия", () => {
    const s = emptySession(smol);
    applyAnswer(s, 8, "Y");
    applyAnswer(s, 8, "N");
    applyAnswer(s, 8, "N");
    expect(undoAnswer(s, 8)).toBe("N");
    expect(s.history[8]).toEqual(["Y", "N"]);
    expect(undoAnswer(s, 8)).toBe("Y");
    expect(undoAnswer(s, 8)).toBe(null);
    expect(s.history[8]).toEqual([]);
  });

  test("сколько отвечено и следующий вопрос без ответа (по кругу)", () => {
    const s = emptySession(smol);
    expect(answeredCount(s)).toBe(0);
    expect(nextUnanswered(s, 0)).toBe(1);
    for (let i = 0; i < 71; i++) if (i !== 3) applyAnswer(s, i, "Y");
    expect(answeredCount(s)).toBe(70);
    expect(nextUnanswered(s, 10)).toBe(3);
    applyAnswer(s, 3, "N");
    expect(nextUnanswered(s, 10)).toBe(null);
  });
  test("что изменил ответ: вопрос 9 «Да» → F, 1, 2, 3 (и Т сдвинулись)", () => {
    const s = emptySession(smol);
    const before = computeProfile(smol, s.answers);
    applyAnswer(s, 8, "Y");
    const last = lastAnswer(smol, 8, before, computeProfile(smol, s.answers), focus);
    expect(last.q).toBe(8);
    expect(last.changedAll).toEqual(["F", "1", "2", "3"]);
    expect(last.changed).toEqual(["F", "1", "2"]); // 3 не в focus СМОЛ
    expect(last.before).toBe(before);
    expect(last.after.raw.F).toBe(1);
  });

  test("в чём засчитан ответ и что дал бы другой (только отслеживаемые шкалы)", () => {
    const keys = questionKeys(smol)[8];
    expect(answerEffect(keys, focus, "Y")).toEqual({ mine: ["F", "1", "2"], other: [], alt: "N" });
    expect(answerEffect(keys, focus, "N")).toEqual({ mine: [], other: ["F", "1", "2"], alt: "Y" });
  });
});

describe("сохранение", () => {
  test("туда и обратно без потерь", () => {
    const s = emptySession(smil);
    applyAnswer(s, 0, "Y");
    applyAnswer(s, 0, "?");
    applyAnswer(s, 565, "N");
    const prefs = { keyMode: true, showProfile: false, profileView: "chart" as const, stripAll: true };
    const back = loadSaved(smil, JSON.parse(JSON.stringify(toSaved(s, prefs, true))), true);
    expect(back.session).toEqual(s);
    expect(back.prefs).toEqual(prefs);
  });

  test("старое и испорченное сохранение не ломает загрузку", () => {
    const { session, prefs } = loadSaved(smol, {
      answers: ["Y", "x", 3, null, "?", "N"],
      history: [["N"], "мусор", [], [], [7, "?"]],
      keyMode: "да" as unknown as boolean,
      profileView: "chart" // без viewV: 2 — вид профиля из старой версии не берём
    }, true);
    expect(session.answers.slice(0, 6)).toEqual(["Y", null, null, null, "?", "N"]);
    expect(session.answers.length).toBe(71);
    // История дополняется текущим ответом, если его там нет.
    expect(session.history[0]).toEqual(["N", "Y"]);
    expect(session.history[4]).toEqual(["?"]);
    expect(session.history[5]).toEqual(["N"]);
    expect(prefs).toEqual(defaultPrefs(true));
    expect(loadSaved(smol, null, false).prefs).toEqual(defaultPrefs(false));
  });

  test("«показывать профиль» запоминается отдельно для широкого и узкого экрана", () => {
    const saved = { showProfile: false, showProfileWide: true };
    expect(loadSaved(smol, saved, true).prefs.showProfile).toBe(false);
    expect(loadSaved(smol, saved, false).prefs.showProfile).toBe(false); // на узком — по умолчанию свёрнут
    expect(loadSaved(smol, { showProfile: true, showProfileWide: false }, false).prefs.showProfile).toBe(true);
  });
});
