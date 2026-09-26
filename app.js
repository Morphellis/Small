(function () {
  "use strict";

  /*
   * Тесты. У каждого свои данные, подсчёт и хранилище ответов, поэтому ответы СМОЛ и СМИЛ не смешиваются.
   * focus — шкалы, на которых делаем упор: только по ним показываем влияние ответа, ключ и подсветку;
   * остальные считаются и видны в таблице, но приглушены.
   * hints — свой список «правильных» ответов; keyHighlight — подсвечивать ли ответы по ключу, пока список пуст.
   * bars — диапазон Т на полосах профиля, band — коридор нормы на графике.
   */
  const TESTS = {
    smol: {
      title: "СМОЛ", D: window.SMOL_DATA, S: window.SMOL_SCORING, storageKey: "smol-trainer-v1",
      focus: ["L", "F", "K", "1", "2", "7", "8"], hints: window.SMOL_HINTS || {}, keyHighlight: true,
      bars: { min: 10, max: 110 }, band: [40, 70]
    },
    smil: {
      title: "СМИЛ", D: window.SMIL_DATA, S: window.SMIL_SCORING, storageKey: "smil-trainer-v1",
      focus: ["L", "F", "K", "1", "2", "7", "8"], hints: window.SMIL_HINTS || {}, keyHighlight: false,
      bars: { min: 0, max: 120 }, band: [30, 70]
    }
  };
  const TEST_KEY = "trainer-test";
  const TEST_ID = (() => {
    const h = location.hash.slice(1);
    if (TESTS[h]) return h;
    try { const v = localStorage.getItem(TEST_KEY); if (TESTS[v]) return v; } catch (e) { /* без хранилища — СМОЛ */ }
    return "smol";
  })();
  const TEST = TESTS[TEST_ID];
  // Тест, открытый по ссылке с #smol / #smil, становится выбранным и при следующем заходе без хеша.
  try { localStorage.setItem(TEST_KEY, TEST_ID); } catch (e) { /* без хранилища — только по адресу */ }

  const D = TEST.D;
  const S = TEST.S;
  const N = S.QUESTION_COUNT;
  const ORDER = S.ORDER;
  const STORAGE_KEY = TEST.storageKey;
  const LETTER = { Y: "Д", N: "Н", "?": "?" };
  const WORD = { Y: "Да", N: "Нет", "?": "Не знаю" };
  const FOCUS = new Set(TEST.focus);
  const HINTS = TEST.hints;
  const USE_HINTS = Object.keys(HINTS).length > 0;
  const KEY_HIGHLIGHT = !USE_HINTS && TEST.keyHighlight;
  const scalesWord = (list) => (list.length > 1 ? "шкалы " : "шкала ") + list.join(", ");
  const byScales = (list) => (list.length > 1 ? "по шкалам " : "по шкале ") + list.join(", ");

  const $ = (id) => document.getElementById(id);
  const el = {
    panel: $("panel"),
    layout: $("layout"),
    impact: $("impact"),
    chartWrap: $("chartWrap"),
    chart: $("chart"),
    bars: $("bars"),
    viewButtons: document.querySelectorAll(".view-switch button"),
    testButtons: document.querySelectorAll(".test-switch button"),
    tableWrap: $("tableWrap"),
    scoreBody: $("scoreBody"),
    validity: $("validity"),
    validitySum: $("validitySum"),
    validityBody: $("validityBody"),
    strip: $("strip"),
    keyBtn: $("keyBtn"),
    toggleProfile: $("toggleProfile"),
    resetBtn: $("resetBtn"),
    themeBtn: $("themeBtn"),
    sideClose: $("sideClose"),
    sideOpen: $("sideOpen"),
    toast: $("toast"),
    questions: $("questions"),
    sheetGrid: $("sheetGrid")
  };

  const WIDE = window.matchMedia("(min-width: 1001px)");

  const state = {
    answers: new Array(N).fill(null),
    history: Array.from({ length: N }, () => []),
    keyMode: false,
    cur: 0,
    last: null, // { q, changed: [], changedAll: [], before, after }
    showProfile: true, // боковая колонка (на узком экране — блок над вопросами)
    profileView: "table" // «Шкалы» (полосы, как на psytests.org), «График» или «Таблица»
  };
  let profile = null;

  // ---------- хранение (только удобство: переживает перезагрузку страницы) ----------
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        answers: state.answers, history: state.history,
        keyMode: state.keyMode, showProfile: state.showProfile, showProfileWide: WIDE.matches, profileView: state.profileView, viewV: 2
      }));
    } catch (e) { /* хранилище недоступно — работаем без него */ }
  }

  function restore() {
    // На широком экране профиль всегда рядом с вопросами; на узком по умолчанию свёрнут (остаётся полоска шкал сверху).
    state.showProfile = WIDE.matches;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch (e) { saved = null; }
    if (!saved) return;
    applySnapshot(saved);
    if (typeof saved.keyMode === "boolean") state.keyMode = saved.keyMode;
    if (typeof saved.showProfile === "boolean" && WIDE.matches === (saved.showProfileWide !== false)) state.showProfile = saved.showProfile;
    if (saved.viewV === 2 && (saved.profileView === "bars" || saved.profileView === "chart" || saved.profileView === "table")) state.profileView = saved.profileView;
  }

  function applySnapshot(s) {
    state.answers = S.normalizeAnswers(s.answers);
    state.history = Array.from({ length: N }, (_, i) => {
      const h = Array.isArray(s.history) && Array.isArray(s.history[i]) ? s.history[i] : [];
      return h.filter((v) => v === null || v === "Y" || v === "N" || v === "?");
    });
    // История без текущего ответа (например, из старого файла) — дополнить.
    state.answers.forEach((a, i) => {
      const h = state.history[i];
      if (a !== null && h[h.length - 1] !== a) h.push(a);
    });
    state.last = null;
  }

  // ---------- форматирование ----------
  function fmtT(t, extrapolated) {
    if (t === null) return "—";
    return (extrapolated ? "≈" : "") + t.toFixed(S.T_DIGITS).replace("-", "−");
  }
  function signed(v, digits) {
    const s = Math.abs(v).toFixed(digits);
    return (v > 0 ? "+" : v < 0 ? "−" : "±") + s;
  }
  const scaleLabel = (s) => `${D.scaleInfo[s].code}: ${D.scaleInfo[s].name}`;
  const levelWord = { high: "высокое", low: "низкое" };

  // ---------- построение вопросов ----------
  function buildQuestions() {
    const frag = document.createDocumentFragment();
    D.questions.forEach((text, i) => {
      const li = document.createElement("li");
      li.className = "q";
      li.id = "q-" + (i + 1);
      li.dataset.i = i;
      li.innerHTML =
        `<span class="q-num">${i + 1}</span>` +
        `<div class="q-body"><p class="q-text"></p><div class="q-key" hidden></div><div class="q-impact" hidden></div></div>` +
        `<div class="q-btns" role="group" aria-label="Ответ на вопрос ${i + 1}">` +
        `<button type="button" data-a="Y">Да</button><button type="button" data-a="N">Нет</button><button type="button" data-a="?">Не знаю</button></div>`;
      li.querySelector(".q-text").textContent = text;
      const keys = S.QUESTION_KEYS[i].filter((k) => FOCUS.has(k.scale));
      const keyBox = li.querySelector(".q-key");
      if (keys.length) {
        // «Ключ: «Да» → шкалы F, 1 · «Нет» → шкалы 3, 6»
        const parts = ["Y", "N"].map((a) => {
          const list = keys.filter((k) => k.answer === a).map((k) => k.scale);
          if (!list.length) return "";
          return `<span class="tag"><b class="ans-${a}">«${WORD[a]}»</b> → ${scalesWord(list)}</span>`;
        }).filter(Boolean);
        keyBox.innerHTML = `<span class="key-label">Ключ:</span>` + parts.join(`<span class="sep">·</span>`);
        if (KEY_HIGHLIGHT) for (const a of new Set(keys.map((k) => k.answer))) li.querySelector(`button[data-a="${a}"]`).classList.add("scores-key");
      } else {
        keyBox.innerHTML = `<span class="key-label">Ключ:</span><span class="none">не влияет на отслеживаемые шкалы</span>`;
      }
      // Свой список «правильных» ответов (hints.js, smil-hints.js): подсвечивается только он.
      const hint = HINTS[i + 1];
      if (USE_HINTS && WORD[hint]) {
        keyBox.insertAdjacentHTML("afterbegin", `<span class="key-label">Ответ:</span><b class="ans-${hint === "?" ? "dk" : hint}">«${WORD[hint]}»</b><span class="sep">·</span>`);
        li.querySelector(`button[data-a="${hint}"]`).classList.add("scores-key");
      }
      frag.appendChild(li);
    });
    el.questions.appendChild(frag);
  }

  function buildSheet() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < N; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cell st-empty";
      b.dataset.i = i;
      b.innerHTML = `<i>${i + 1}</i><span></span>`;
      frag.appendChild(b);
    }
    el.sheetGrid.appendChild(frag);
  }

  // ---------- отрисовка ----------
  function renderQuestion(i) {
    const li = el.questions.children[i];
    const a = state.answers[i];
    for (const b of li.querySelectorAll("button")) {
      const on = b.dataset.a === a;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
    // Под каждым отвеченным вопросом остаётся строка «на какие шкалы он повлиял».
    const impact = li.querySelector(".q-impact");
    if (a === null) {
      impact.hidden = true;
    } else {
      impact.hidden = false;
      impact.innerHTML = questionImpactHtml(i);
    }
    li.classList.toggle("last", !!state.last && state.last.q === i && a !== null);
    li.classList.toggle("cur", i === state.cur);
  }

  /*
   * Влияние ответа на вопрос по ключу теста (только шкалы из FOCUS): в какие шкалы он засчитан,
   * либо что баллов не даёт и какой ответ дал бы. Не зависит от остальных ответов, поэтому
   * строка остаётся под вопросом, пока ответ не сняли или не сменили.
   */
  function keyEffect(i, a) {
    const keys = S.QUESTION_KEYS[i].filter((k) => FOCUS.has(k.scale));
    const mine = keys.filter((k) => k.answer === a).map((k) => k.scale);
    const other = keys.filter((k) => k.answer !== a).map((k) => k.scale);
    return { mine, other, alt: a === "Y" ? "N" : "Y" };
  }

  function noScoreText(i, a) {
    if (a === "?") return "«Не знаю» баллов не даёт";
    const { other, alt } = keyEffect(i, a);
    return other.length
      ? `«${WORD[a]}» баллов не даёт (даёт «${WORD[alt]}»: ${other.join(", ")})`
      : "на отслеживаемые шкалы не влияет";
  }

  function questionImpactHtml(i) {
    const a = state.answers[i];
    if (a === "Y" || a === "N") {
      const { mine } = keyEffect(i, a);
      if (mine.length) {
        return `<span class="lead">«${WORD[a]}» дал:</span>` + mine.map((s) => `<span class="chip plus"><b>${s}</b><i>+1</i></span>`).join("");
      }
    }
    return `<span class="quiet">${noScoreText(i, a)}</span>`;
  }

  /*
   * Верхняя карточка: что сделал именно последний ответ. По каждой затронутой шкале — на сколько
   * изменились сырые баллы (или поправка K) и как сдвинулся Т-балл. Только шкалы из FOCUS,
   * остальные затронутые шкалы перечислены мелко в конце.
   */
  function renderImpact() {
    const last = state.last;
    if (!last) {
      el.impact.className = "impact";
      el.impact.innerHTML = `<span class="impact-empty">Отметьте ответ: здесь покажется, какие шкалы он изменил и насколько.</span>`;
      return;
    }
    const i = last.q;
    const a = state.answers[i];
    const { before, after } = last;
    const ansBadge = a === null ? `<span class="ans none">снят</span>` : `<span class="ans ${a === "?" ? "dk" : a}">${WORD[a]}</span>`;

    const chips = last.changed.map((s) => {
      const dRaw = after.raw[s] - before.raw[s];
      const dT = after.t[s] === null || before.t[s] === null ? 0 : after.t[s] - before.t[s];
      const down = dRaw < 0 || (dRaw === 0 && dT < 0);
      const what = dRaw !== 0 ? `${signed(dRaw, 0)} <small>сырых</small>` : "поправка K";
      return `<span class="imp-chip${down ? " minus" : ""}" title="${scaleLabel(s)}"><b>${s}</b>` +
        `<span class="d">${what}</span><span class="t">Т ${fmtT(before.t[s], before.extrapolated && before.extrapolated[s])} → ${fmtT(after.t[s], after.extrapolated[s])}</span></span>`;
    });

    const others = (last.changedAll || []).filter((s) => !FOCUS.has(s));
    const more = others.length ? `<span class="imp-more">и ещё: ${others.join(", ")}</span>` : "";

    let body;
    if (chips.length) {
      body = `<span class="imp-label">Изменились:</span>${chips.join("")}${more}`;
    } else {
      const note = a === null ? "ответ снят, отслеживаемые шкалы не менялись" : noScoreText(i, a);
      body = `<span class="imp-note">Шкалы не изменились: ${note}</span>${more}`;
    }

    el.impact.className = "impact " + (chips.length ? "hit" : "miss");
    el.impact.innerHTML =
      `<div class="imp-q"><div class="imp-q-head">Вопрос ${i + 1} ${ansBadge}</div><div class="imp-q-text">${escapeHtml(D.questions[i])}</div></div>` +
      `<div class="imp-body">${body}</div>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function renderSheetCell(i) {
    const cell = el.sheetGrid.children[i];
    const a = state.answers[i];
    const st = S.cellState(state.history[i], a);
    cell.className = "cell st-" + st + (a === "Y" ? " a-Y" : a === "N" ? " a-N" : a === "?" ? " a-dk" : "");
    if (state.last && state.last.q === i) cell.classList.add("last");
    cell.querySelector("span").textContent = a ? LETTER[a] : "";
    const hist = state.history[i].map((v) => (v === null ? "снят" : LETTER[v])).join(" → ");
    cell.title = `Вопрос ${i + 1}` + (hist ? `: ${hist}` : ": без ответа");
  }

  function renderTable() {
    const changed = new Set(state.last ? state.last.changed : []);
    const rows = ORDER.map((s, idx) => {
      const t = profile.t[s];
      const lvl = profile.level[s];
      const corr = profile.corrected[s] !== profile.raw[s] || S.K_CORRECTED.includes(s)
        ? ` <small title="с поправкой K">(${profile.corrected[s]})</small>` : "";
      let d = "";
      if (changed.has(s) && state.last.before.t[s] !== null && t !== null) d = signed(t - state.last.before.t[s], S.T_DIGITS);
      const over = profile.validity.checks.some((c) => c.scale === s && c.exceeded);
      const cls = [changed.has(s) ? "changed" : "", idx === 3 ? "grp" : "", over ? "invalid" : "", FOCUS.has(s) ? "" : "other"].join(" ").trim();
      const lvlTxt = lvl && lvl !== "norm" ? `<span class="lvl">${levelWord[lvl]}</span>` : "";
      return `<tr class="${cls}" data-s="${s}"><td class="num t ${lvl ? "lv-" + lvl : ""}">${fmtT(t, profile.extrapolated[s])}${lvlTxt}</td>` +
        `<td class="num">${profile.raw[s]}${corr}</td><td class="name" title="${scaleLabel(s)}">${scaleLabel(s)}</td><td class="num d">${d}</td></tr>`;
    });
    rows.push(`<tr class="dk grp"><td class="num t">—</td><td class="num">${profile.dontKnow}</td><td class="name">?: Ответ «Не знаю»</td><td></td></tr>`);
    if (profile.controlTotal) {
      rows.push(`<tr class="dk"><td class="num t">—</td><td class="num">${profile.controlCorrect}<small> из ${profile.controlTotal}</small></td>` +
        `<td class="name" title="Пункты «Номер данного пункта следует обвести кружочком»: правильно отвечать «Не знаю»">Контрольные пункты</td><td></td></tr>`);
    }
    el.scoreBody.innerHTML = rows.join("");
  }

  function renderValidity() {
    const v = profile.validity;
    const u = (c) => (c.unit ? " " + c.unit : "");
    // СМОЛ сравнивает сырые баллы («L 2 из 4»), СМИЛ — Т-баллы («L 49 Т, до 70»).
    const counts = v.checks.map((c) => (c.unit ? `${c.scale} ${c.value}${u(c)}, до ${c.limit}` : `${c.scale} ${c.value} из ${c.limit}`)).join(" · ");
    el.validity.classList.toggle("bad", !v.valid);
    if (v.valid) {
      el.validitySum.innerHTML = `<b>✓<span class="vt"> Достоверен</span></b><span class="v-counts">${counts}</span>`;
      el.validityBody.innerHTML = `<p>${S.VALIDITY_RULE} Сейчас ${v.checks.length > 2 ? "все" : "оба"} в пределах.</p>`;
      el.validity.open = false;
    } else {
      const bad = v.checks.filter((c) => c.exceeded);
      el.validitySum.innerHTML = `<b>✗<span class="vt"> Недостоверен</span></b><span class="v-counts">${bad.map((c) => `${c.scale} = ${c.value}${u(c)}, допустимо до ${c.limit}`).join(" · ")}</span>`;
      el.validityBody.innerHTML =
        bad.map((c) => `<p><b>${c.scale} = ${c.value}${u(c)}</b> (${D.scaleInfo[c.scale].name.toLowerCase()}, допустимо не больше ${c.limit}${u(c)}): ${c.reason}.</p>`).join("") +
        `<p>По методике ${TEST.title} при таком результате шкалы не интерпретируют, а тест проходят заново.</p>`;
    }
  }

  function renderStrip() {
    const changed = new Set(state.last ? state.last.changed : []);
    const cells = ORDER.map((s) => {
      const g = D.scaleInfo[s].group === "control" ? "ctrl" : "clin";
      const lvl = profile.level[s] ? "lv-" + profile.level[s] : "";
      const t = profile.t[s] === null ? "—" : (profile.extrapolated[s] ? "≈" : "") + Math.round(profile.t[s]);
      const over = profile.validity.checks.some((c) => c.scale === s && c.exceeded) ? "invalid" : "";
      // Сдвиг Т после последнего ответа: красный — вверх, синий — вниз.
      let dt = "", dn = "";
      if (changed.has(s) && state.last.before.t[s] !== null && profile.t[s] !== null) {
        const diff = profile.t[s] - state.last.before.t[s];
        dt = `<em>${signed(diff, Math.min(S.T_DIGITS, 1))}</em>`;
        if (diff < 0) dn = "dn";
      }
      return `<div class="sc ${g} ${lvl} ${over} ${dn} ${changed.has(s) ? "changed" : ""} ${FOCUS.has(s) ? "" : "other"}" title="${scaleLabel(s)}: Т ${t}, сырые с поправкой ${profile.corrected[s]}"><b>${s}</b>${dt}<span>${t}</span><small>${profile.corrected[s]}</small></div>`;
    });
    cells.push(`<div class="sc other" title="Ответов «Не знаю»"><b>?</b><span>${profile.dontKnow}</span><small>&nbsp;</small></div>`);
    el.strip.style.setProperty("--n", cells.length);
    el.strip.innerHTML = cells.join("");
  }

  // Вид «Шкалы»: полосы по клеткам в 5 Т, как в результатах psytests.org (СМОЛ — от 10 до 110 Т, СМИЛ — от 0 до 120 Т).
  function renderBars() {
    const changed = new Set(state.last ? state.last.changed : []);
    const T_MIN = TEST.bars.min, T_MAX = TEST.bars.max;
    const pct = (t) => (((t - T_MIN) / (T_MAX - T_MIN)) * 100).toFixed(2) + "%";
    const { low, high } = S.THRESHOLDS;
    el.bars.style.setProperty("--cell", (500 / (T_MAX - T_MIN)).toFixed(4) + "%");
    const row = (s, label) => {
      const t = profile.t[s];
      const lvl = profile.level[s];
      const w = t === null ? 0 : Math.max(0, Math.min(100, ((t - T_MIN) / (T_MAX - T_MIN)) * 100));
      const cls = ["bar-row", lvl === "high" || lvl === "low" ? "is-out" : "is-mid", changed.has(s) ? "changed" : "", FOCUS.has(s) ? "" : "other"].join(" ");
      let d = "";
      if (changed.has(s) && state.last.before.t[s] !== null && t !== null) {
        const diff = Math.round(t) - Math.round(state.last.before.t[s]);
        if (diff) d = `<small>${signed(diff, 0)}</small>`;
      }
      const val = t === null ? "—" : (profile.extrapolated[s] ? "≈" : "") + String(Math.round(t)).replace("-", "−");
      return `<div class="${cls}" title="${scaleLabel(s)}"><span class="bar-name">${label}</span>` +
        `<span class="bar-track"><span class="bar-fill" style="width:${w.toFixed(1)}%"></span></span>` +
        `<span class="bar-val">${val}${d}</span></div>`;
    };
    const group = (g) => ORDER.filter((s) => D.scaleInfo[s].group === g);
    const clinical = group("clinical").map((s) => row(s, `${s}. ${D.scaleInfo[s].title}`)).join("");
    const control = group("control").map((s) => row(s, `${D.scaleInfo[s].title} (${s})`)).join("");
    el.bars.innerHTML =
      `<div class="bars-h">Базисные шкалы</div>${clinical}<div class="bars-h">Контрольные шкалы</div>${control}` +
      `<div class="bar-row bar-axis"><span class="bar-name"></span><span class="bar-track axis">` +
      `<i style="left:0"><b class="lo">[${T_MIN}</b></i><i class="c" style="left:${pct(low + 1)}"><b class="lo">${low}]</b><b class="mid">[${low + 1}</b></i>` +
      `<i class="c" style="left:${pct(high)}"><b class="mid">${high - 1}]</b><b class="hi">[${high}</b></i><i style="right:0"><b class="hi">${T_MAX}]</b></i></span><span class="bar-val"></span></div>` +
      `<div class="bars-legend"><span class="lo">низкие</span> ⇒ <span class="mid">средние</span> ⇒ <span class="hi">высокие значения</span></div>`;
  }

  // Ширина графика в координатах SVG равна ширине колонки в пикселях: так подписи не сжимаются на узком экране.
  let chartW = 0;
  function renderChart() {
    const w = el.chartWrap.clientWidth;
    const W = w > 0 ? Math.round(Math.min(800, Math.max(300, w))) : 600;
    // Узкая колонка — график повыше; широкая — пониже, но не выше половины экрана (телефон горизонтально).
    const H = W <= 400 ? 230 : Math.round(Math.max(180, Math.min(320, W * 0.5, window.innerHeight * 0.55)));
    const m = { l: 34, r: 10, t: 12, b: 26 };
    chartW = W;
    el.chart.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const slot = (i) => i + (i >= 3 ? 0.7 : 0);
    const span = slot(ORDER.length - 1);
    const x = (i) => m.l + 18 + (slot(i) * (pw - 36)) / span;
    const clamp = (t) => Math.max(0, Math.min(120, t));
    const y = (t) => m.t + ((120 - clamp(t)) / 120) * ph;
    const css = (v) => `var(${v})`;
    const out = [];

    const [bandLo, bandHi] = TEST.band;
    out.push(`<rect x="${m.l}" y="${y(bandHi)}" width="${pw}" height="${y(bandLo) - y(bandHi)}" fill="${css("--band")}"/>`);
    for (let t = 0; t <= 120; t += 5) {
      const strong = t % 10 === 0;
      out.push(`<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="${css(strong ? "--grid-strong" : "--grid")}" stroke-width="${strong ? 0.8 : 0.6}"/>`);
      if (strong) out.push(`<text x="${m.l - 6}" y="${y(t) + 3.5}" text-anchor="end">${t}</text>`);
    }
    for (const t of TEST.band) {
      out.push(`<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="${css("--muted")}" stroke-width="1" stroke-dasharray="5 4"/>`);
    }
    const sepX = (x(2) + x(3)) / 2;
    out.push(`<line x1="${sepX}" x2="${sepX}" y1="${m.t}" y2="${m.t + ph}" stroke="${css("--grid-strong")}" stroke-width="1"/>`);
    ORDER.forEach((s, i) => out.push(`<text class="xl" x="${x(i)}" y="${H - 8}" text-anchor="middle">${s}</text>`));

    const changed = new Set(state.last ? state.last.changed : []);
    const line = (from, to, color) => {
      const pts = ORDER.slice(from, to).map((s, k) => `${x(from + k).toFixed(1)},${y(profile.t[s]).toFixed(1)}`).join(" ");
      out.push(`<polyline points="${pts}" fill="none" stroke="${css(color)}" stroke-width="2.2" stroke-linejoin="round"/>`);
    };
    line(0, 3, "--ctrl");
    line(3, ORDER.length, "--clin");

    ORDER.forEach((s, i) => {
      const t = profile.t[s];
      const color = i < 3 ? "--ctrl" : "--clin";
      const cx = x(i), cy = y(t);
      const clipped = t < 0 || t > 120;
      if (!FOCUS.has(s)) out.push(`<g opacity="0.4">`);
      if (changed.has(s)) out.push(`<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="${css("--hl")}" stroke-width="2"/>`);
      out.push(`<circle cx="${cx}" cy="${cy}" r="4.2" fill="${clipped ? css("--surface") : css(color)}" stroke="${css(color)}" stroke-width="2"><title>${scaleLabel(s)}: Т ${t.toFixed(2)}</title></circle>`);
      const ly = t > 108 ? cy + 18 : cy - (changed.has(s) ? 12 : 9);
      out.push(`<text class="v${changed.has(s) ? " changed" : ""}" x="${cx}" y="${ly}" text-anchor="middle">${Math.round(t)}</text>`);
      if (!FOCUS.has(s)) out.push("</g>");
    });
    el.chart.innerHTML = out.join("");
  }

  function renderLayout() {
    el.layout.classList.toggle("no-side", !state.showProfile);
    el.sideOpen.hidden = state.showProfile;
    el.toggleProfile.setAttribute("aria-pressed", String(state.showProfile));
    el.toggleProfile.setAttribute("aria-expanded", String(state.showProfile));
    el.chartWrap.hidden = state.profileView === "table";
    el.tableWrap.hidden = state.profileView !== "table";
    el.bars.hidden = state.profileView !== "bars";
    el.chart.style.display = state.profileView === "chart" ? "" : "none";
    for (const b of el.viewButtons) {
      const on = b.dataset.view === state.profileView;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", String(on));
    }
    for (const b of el.testButtons) {
      const on = b.dataset.test === TEST_ID;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", String(on));
    }
    el.keyBtn.setAttribute("aria-pressed", String(state.keyMode));
    el.keyBtn.querySelector(".long").textContent = state.keyMode ? "Скрыть ключ" : "Показать ключ";
    el.keyBtn.querySelector(".short").textContent = "Ключ";
    document.body.classList.toggle("keymode", state.keyMode);
    for (const k of el.questions.querySelectorAll(".q-key")) k.hidden = !state.keyMode;
    updatePanelHeight();
  }

  // Кнопка показывает, на какую тему переключит: в тёмной — солнце, в светлой — луна.
  function renderTheme() {
    const light = document.documentElement.getAttribute("data-theme") === "light";
    el.themeBtn.textContent = light ? "\u263E" : "\u2600";
    el.themeBtn.title = light ? "Включить тёмную тему" : "Включить светлую тему";
  }

  function renderScores() {
    profile = S.computeProfile(state.answers);
    renderTable();
    renderValidity();
    renderStrip();
    renderImpact();
    renderChart();
    renderBars();
  }

  function renderAll() {
    for (let i = 0; i < N; i++) { renderQuestion(i); renderSheetCell(i); }
    renderScores();
    renderLayout();
  }

  // ---------- действия ----------
  function setAnswer(i, value, opts) {
    const prev = state.answers[i];
    const next = prev === value ? null : value; // повторный клик снимает ответ
    const before = S.computeProfile(state.answers);
    state.answers[i] = next;
    state.history[i].push(next);
    const after = S.computeProfile(state.answers);
    const prevLast = state.last ? state.last.q : null;
    const changedAll = S.changedScales(before, after);
    state.last = { q: i, changed: changedAll.filter((s) => FOCUS.has(s)), changedAll, before, after };
    const prevCur = state.cur;
    state.cur = i;

    const toRender = new Set([i, prevCur]);
    if (prevLast !== null) toRender.add(prevLast);
    if (opts && opts.advance && next !== null && i < N - 1) {
      state.cur = i + 1;
      toRender.add(i + 1);
    }
    for (const q of toRender) { renderQuestion(q); renderSheetCell(q); }
    renderScores();
    persist();
    if (opts && opts.advance) scrollToQuestion(state.cur);
  }

  function setCur(i, scroll) {
    const prev = state.cur;
    state.cur = Math.max(0, Math.min(N - 1, i));
    renderQuestion(prev);
    renderQuestion(state.cur);
    if (scroll) scrollToQuestion(state.cur);
  }

  function scrollToQuestion(i, flash) {
    const li = el.questions.children[i];
    const r = li.getBoundingClientRect();
    const top = Math.max(8, el.panel.getBoundingClientRect().bottom + 8);
    const room = window.innerHeight - top;
    if (r.top < top || r.bottom > window.innerHeight - 8 || flash) {
      const target = top + Math.max(0, (room - r.height) / 3);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollBy({ top: r.top - target, behavior: reduce ? "auto" : "smooth" });
    }
    if (flash) {
      li.classList.remove("flash");
      void li.offsetWidth;
      li.classList.add("flash");
    }
  }

  function updatePanelHeight() {
    const h = el.panel.getBoundingClientRect().height;
    // Высота липкой панели нужна боковой колонке (прилипает под ней). На узком низком экране
    // слишком высокая панель не прилипает, чтобы не закрывать вопросы.
    document.documentElement.style.setProperty("--panel-h", h + "px");
    const narrow = window.matchMedia("(max-width: 1000px)").matches;
    el.panel.classList.toggle("unstick", narrow && h > window.innerHeight * 0.45);
  }

  function resetAll() {
    if (!window.confirm(`Сбросить все ответы и историю ${TEST.title}?`)) return;
    state.answers = new Array(N).fill(null);
    state.history = Array.from({ length: N }, () => []);
    state.last = null;
    state.cur = 0;
    renderAll();
    persist();
    window.scrollTo({ top: 0 });
    toast("Результаты сброшены");
  }

  let toastTimer = 0;
  function toast(msg) {
    el.toast.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.textContent = ""; }, 3000);
  }

  // ---------- события ----------
  function bind() {
    el.questions.addEventListener("click", (e) => {
      const li = e.target.closest(".q");
      if (!li) return;
      const i = Number(li.dataset.i);
      const b = e.target.closest("button[data-a]");
      if (b) setAnswer(i, b.dataset.a, { advance: false });
      else setCur(i, false);
    });

    el.sheetGrid.addEventListener("click", (e) => {
      const c = e.target.closest(".cell");
      if (!c) return;
      const i = Number(c.dataset.i);
      setCur(i, false);
      scrollToQuestion(i, true);
    });

    // Смена теста: запоминаем выбор и перезагружаем страницу — у каждого теста свои вопросы и свои сохранённые ответы.
    for (const b of el.testButtons) {
      b.addEventListener("click", () => {
        if (b.dataset.test === TEST_ID) return;
        try { localStorage.setItem(TEST_KEY, b.dataset.test); } catch (e) { /* выбор передаётся через адрес */ }
        history.replaceState(null, "", "#" + b.dataset.test);
        location.reload();
      });
    }
    // Смена #smol / #smil в адресе или переход по такой ссылке на открытой странице.
    window.addEventListener("hashchange", () => {
      const h = location.hash.slice(1);
      if (TESTS[h] && h !== TEST_ID) location.reload();
    });
    el.keyBtn.addEventListener("click", () => { state.keyMode = !state.keyMode; renderLayout(); persist(); });
    for (const b of el.viewButtons) b.addEventListener("click", () => { state.profileView = b.dataset.view; renderLayout(); persist(); });
    el.toggleProfile.addEventListener("click", () => { state.showProfile = !state.showProfile; renderLayout(); persist(); });
    el.sideOpen.addEventListener("click", () => { state.showProfile = true; renderLayout(); persist(); });
    el.sideClose.addEventListener("click", () => { state.showProfile = false; renderLayout(); persist(); });
    // При смене ширины (поворот телефона, окно) возвращаемся к умолчанию: справа колонка, на узком экране шторка закрыта.
    const onWide = () => { state.showProfile = WIDE.matches; renderLayout(); };
    if (WIDE.addEventListener) WIDE.addEventListener("change", onWide); else if (WIDE.addListener) WIDE.addListener(onWide);
    el.resetBtn.addEventListener("click", resetAll);
    el.themeBtn.addEventListener("click", () => {
      const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("trainer-theme", next); } catch (e) { /* без хранилища тема сбросится при перезагрузке */ }
      renderTheme();
    });
    // Пояснение к достоверности открывается поверх вопросов — закрываем его кликом мимо.
    document.addEventListener("click", (e) => { if (el.validity.open && !el.validity.contains(e.target)) el.validity.open = false; });

    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === "Escape" && el.validity.open) { el.validity.open = false; return; }
      if (e.code === "Escape" && !WIDE.matches && state.showProfile) { state.showProfile = false; renderLayout(); return; }
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "select" || tag === "textarea" || tag === "input") return;
      const code = e.code;
      let answer = null;
      if (code === "Digit1" || code === "Numpad1" || code === "KeyY") answer = "Y";
      else if (code === "Digit2" || code === "Numpad2" || code === "KeyN") answer = "N";
      else if (code === "Digit3" || code === "Numpad3" || code === "Slash") answer = "?";
      if (answer) {
        e.preventDefault();
        setAnswer(state.cur, answer, { advance: true });
        return;
      }
      if (code === "Digit0" || code === "Numpad0" || code === "Backspace" || code === "Delete") {
        if (state.answers[state.cur] !== null) {
          e.preventDefault();
          setAnswer(state.cur, state.answers[state.cur], { advance: false });
        }
        return;
      }
      if (code === "ArrowDown" || code === "KeyJ") { e.preventDefault(); setCur(state.cur + 1, true); }
      else if (code === "ArrowUp" || code === "KeyK") { e.preventDefault(); setCur(state.cur - 1, true); }
    });

    if ("ResizeObserver" in window) {
      new ResizeObserver(updatePanelHeight).observe(el.panel);
      new ResizeObserver(() => {
        const w = el.chartWrap.clientWidth;
        if (w > 0 && profile && Math.round(Math.min(800, Math.max(300, w))) !== chartW) renderChart();
      }).observe(el.chartWrap);
    }
    window.addEventListener("resize", updatePanelHeight);
  }

  buildQuestions();
  buildSheet();
  renderTheme();
  restore();
  bind();
  renderAll();
})();
