/*
 * Модель прохождения опросника: ответы, история, «что изменилось», сохранение и загрузка (формат прежний).
 */
import { describe, expect, test } from "vitest";
import { computeProfile } from "../../src/kinds/questionnaire/engine";
import { answerEffect, applyAnswer, defaultPrefs, emptySession, loadSaved, toSaved } from "../../src/kinds/questionnaire/model";
import { questionKeys } from "../../src/kinds/questionnaire/engine";
import { smil } from "../../src/tests/smil/definition";
import { smol } from "../../src/tests/smol/definition";

const focus = new Set(smol.ui.focus);

describe("ответы", () => {
  test("ответ, смена ответа и повторный клик (снять) пишутся в историю", () => {
    const s = emptySession(smol);
    let profile = computeProfile(smol, s.answers);
    for (const v of ["Y", "N", "N"] as const) profile = applyAnswer(smol, s, profile, 8, v, focus).after;
    expect(s.answers[8]).toBe(null);
    expect(s.history[8]).toEqual(["Y", "N", null]);
    expect(profile).toEqual(computeProfile(smol, s.answers));
  });

  test("что изменил ответ: вопрос 9 «Да» → F, 1, 2, 3 (и Т сдвинулись)", () => {
    const s = emptySession(smol);
    const before = computeProfile(smol, s.answers);
    const last = applyAnswer(smol, s, before, 8, "Y", focus);
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
    let p = computeProfile(smil, s.answers);
    p = applyAnswer(smil, s, p, 0, "Y", new Set()).after;
    p = applyAnswer(smil, s, p, 0, "?", new Set()).after;
    applyAnswer(smil, s, p, 565, "N", new Set());
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
