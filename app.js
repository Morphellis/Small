(function () {
  "use strict";

  const D = window.SMOL_DATA;
  const S = window.SMOL_SCORING;
  const N = S.QUESTION_COUNT;
  const ORDER = S.ORDER;
  const STORAGE_KEY = "smol-trainer-v1";
  const LETTER = { Y: "Д", N: "Н", "?": "?" };
  const WORD = { Y: "Да", N: "Нет", "?": "Не знаю" };

  const $ = (id) => document.getElementById(id);
  const el = {
    sexInputs: document.querySelectorAll('input[name="sex"]'),
    seg: document.querySelector(".seg"),
    progressText: $("progressText"),
    progressBar: $("progressBar"),
    panel: $("panel"),
    panelMeta: $("panelMeta"),
    panelBody: $("panelBody"),
    chartWrap: $("chartWrap"),
    chart: $("chart"),
    tableWrap: $("tableWrap"),
    scoreBody: $("scoreBody"),
    validity: $("validity"),
    validitySum: $("validitySum"),
    validityBody: $("validityBody"),
    strip: $("strip"),
    keyBtn: $("keyBtn"),
    toggleChart: $("toggleChart"),
    toggleTable: $("toggleTable"),
    resetBtn: $("resetBtn"),
    toast: $("toast"),
    gate: $("gate"),
    questions: $("questions"),
    sheetGrid: $("sheetGrid"),

  };

  const state = {
    sex: "male", // по умолчанию мужской: тест проходят в основном мужчины
    answers: new Array(N).fill(null),
    history: Array.from({ length: N }, () => []),
    keyMode: false,
    cur: 0,
    last: null, // { q, changed: [], before, after }
    showChart: true,
    showTable: true
  };
  let profile = null;

  // ---------- хранение (только удобство: переживает перезагрузку страницы) ----------
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        sex: state.sex, answers: state.answers, history: state.history,
        keyMode: state.keyMode, showChart: state.showChart, showTable: state.showTable
      }));
    } catch (e) { /* хранилище недоступно — работаем без него */ }
  }

  function restore() {
    const narrow = window.matchMedia("(max-width: 640px)").matches;
    state.showChart = !narrow;
    state.showTable = !narrow;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch (e) { saved = null; }
    if (!saved) return;
    applySnapshot(saved);
    if (typeof saved.keyMode === "boolean") state.keyMode = saved.keyMode;
    if (typeof saved.showChart === "boolean") state.showChart = saved.showChart;
    if (typeof saved.showTable === "boolean") state.showTable = saved.showTable;
  }

  function applySnapshot(s) {
    state.sex = s.sex === "male" || s.sex === "female" ? s.sex : "male";
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
  function fmtT(t) {
    if (t === null) return "—";
    return t.toFixed(2).replace("-", "−");
  }
  function signed(v, digits) {
    const s = Math.abs(v).toFixed(digits);
    return (v > 0 ? "+" : v < 0 ? "−" : "±") + s;
  }
  const scaleLabel = (s) => `${D.scaleInfo[s].code}: ${D.scaleInfo[s].name}`;
  const shortCode = (s) => s;
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
      const keys = S.QUESTION_KEYS[i];
      const keyBox = li.querySelector(".q-key");
      if (keys.length) {
        // «Ключ: «Да» → шкалы F, 1 · «Нет» → шкалы 3, 6»
        const parts = ["Y", "N"].map((a) => {
          const list = keys.filter((k) => k.answer === a).map((k) => shortCode(k.scale));
          if (!list.length) return "";
          return `<span class="tag"><b class="ans-${a}">«${WORD[a]}»</b> → ${list.length > 1 ? "шкалы" : "шкала"} ${list.join(", ")}</span>`;
        }).filter(Boolean);
        keyBox.innerHTML = `<span class="key-label">Ключ:</span>` + parts.join(`<span class="sep">·</span>`);
        for (const a of new Set(keys.map((k) => k.answer))) li.querySelector(`button[data-a="${a}"]`).classList.add("scores-key");
      } else {
        keyBox.innerHTML = `<span class="key-label">Ключ:</span><span class="none">не входит ни в одну шкалу</span>`;
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
    const impact = li.querySelector(".q-impact");
    if (state.last && state.last.q === i) {
      impact.hidden = false;
      impact.innerHTML = impactHtml(state.last);
    } else {
      impact.hidden = true;
    }
    li.classList.toggle("cur", i === state.cur);
  }

  function impactHtml(last) {
    if (!last.changed.length) return `<span class="quiet">на шкалы не повлиял</span>`;
    const { before, after } = last;
    return "Повлиял: " + last.changed.map((s) => {
      const dr = after.raw[s] - before.raw[s];
      const dc = after.corrected[s] - before.corrected[s];
      let what;
      if (dr) what = `${signed(dr, 0)}`;
      else if (dc) what = `${signed(dc, 0)} (поправка K)`;
      else what = "Т";
      return `<span class="chip">${s} ${what}</span>`;
    }).join("· ");
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
      if (changed.has(s) && state.last.before.t[s] !== null && t !== null) d = signed(t - state.last.before.t[s], 2);
      const over = profile.validity.checks.some((c) => c.scale === s && c.exceeded);
      const cls = [changed.has(s) ? "changed" : "", idx === 3 ? "grp" : "", over ? "invalid" : ""].join(" ").trim();
      const lvlTxt = lvl && lvl !== "norm" ? `<span class="lvl">${levelWord[lvl]}</span>` : "";
      return `<tr class="${cls}" data-s="${s}"><td class="num t ${lvl ? "lv-" + lvl : ""}">${fmtT(t)}${lvlTxt}</td>` +
        `<td class="num">${profile.raw[s]}${corr}</td><td class="name" title="${scaleLabel(s)}">${scaleLabel(s)}</td><td class="num d">${d}</td></tr>`;
    });
    rows.push(`<tr class="dk grp"><td class="num t">—</td><td class="num">${profile.dontKnow}</td><td class="name">?: Ответ «Не знаю»</td><td></td></tr>`);
    el.scoreBody.innerHTML = rows.join("");

  }

  let wasValid = true;
  function renderValidity() {
    const v = profile.validity;
    const counts = v.checks.map((c) => `${c.scale} ${c.raw} из ${c.limit}`).join(" · ");
    el.validity.classList.toggle("bad", !v.valid);
    if (v.valid) {
      el.validitySum.innerHTML = `<b>✓ Результат достоверен</b><span class="v-counts">допустимо: ${counts}</span>`;
      el.validityBody.innerHTML =
        "<p>По правилам СМОЛ результат недостоверен, если сырой балл L больше 4 или F больше 6. Сейчас оба в пределах.</p>";
      el.validity.open = false;
    } else {
      const bad = v.checks.filter((c) => c.exceeded);
      el.validitySum.innerHTML = `<b>✗ Результат недостоверен</b><span class="v-counts">${bad.map((c) => `${c.scale} = ${c.raw}, допустимо до ${c.limit}`).join(" · ")}</span>`;
      el.validityBody.innerHTML =
        bad.map((c) => `<p><b>${c.scale} = ${c.raw}</b> (${D.scaleInfo[c.scale].name.toLowerCase()}, допустимо не больше ${c.limit}): ${c.reason}.</p>`).join("") +
        "<p>По методике СМОЛ при таком результате шкалы не интерпретируют, а тест проходят заново.</p>";
      if (wasValid) el.validity.open = !window.matchMedia("(max-width: 900px)").matches;
    }
    wasValid = v.valid;
  }

  function renderStrip() {
    const changed = new Set(state.last ? state.last.changed : []);
    const cells = ORDER.map((s) => {
      const g = D.scaleInfo[s].group === "control" ? "ctrl" : "clin";
      const lvl = profile.level[s] ? "lv-" + profile.level[s] : "";
      const t = profile.t[s] === null ? "—" : Math.round(profile.t[s]);
      const over = profile.validity.checks.some((c) => c.scale === s && c.exceeded) ? "invalid" : "";
      return `<div class="sc ${g} ${lvl} ${over} ${changed.has(s) ? "changed" : ""}" title="${scaleLabel(s)}"><b>${s}</b><span>${t}</span><small>${profile.corrected[s]}</small></div>`;
    });
    cells.push(`<div class="sc" title="Ответов «Не знаю»"><b>?</b><span>${profile.dontKnow}</span><small>&nbsp;</small></div>`);
    el.strip.innerHTML = cells.join("");
  }

  function renderChart() {
    const W = 600, H = 290, m = { l: 34, r: 10, t: 12, b: 26 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const slot = (i) => i + (i >= 3 ? 0.7 : 0);
    const span = slot(ORDER.length - 1);
    const x = (i) => m.l + 18 + (slot(i) * (pw - 36)) / span;
    const clamp = (t) => Math.max(0, Math.min(120, t));
    const y = (t) => m.t + ((120 - clamp(t)) / 120) * ph;
    const css = (v) => `var(${v})`;
    const out = [];

    out.push(`<rect x="${m.l}" y="${y(70)}" width="${pw}" height="${y(40) - y(70)}" fill="${css("--band")}"/>`);
    for (let t = 0; t <= 120; t += 5) {
      const strong = t % 10 === 0;
      out.push(`<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="${css(strong ? "--grid-strong" : "--grid")}" stroke-width="${strong ? 0.8 : 0.6}"/>`);
      if (strong) out.push(`<text x="${m.l - 6}" y="${y(t) + 3.5}" text-anchor="end">${t}</text>`);
    }
    for (const t of [40, 70]) {
      out.push(`<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="${css("--muted")}" stroke-width="1" stroke-dasharray="5 4"/>`);
    }
    const sepX = (x(2) + x(3)) / 2;
    out.push(`<line x1="${sepX}" x2="${sepX}" y1="${m.t}" y2="${m.t + ph}" stroke="${css("--grid-strong")}" stroke-width="1"/>`);
    ORDER.forEach((s, i) => out.push(`<text class="xl" x="${x(i)}" y="${H - 8}" text-anchor="middle">${s}</text>`));

    if (!state.sex) {
      out.push(`<text class="empty" x="${m.l + pw / 2}" y="${m.t + ph / 2}" text-anchor="middle">Выберите пол, чтобы построить профиль</text>`);
      el.chart.innerHTML = out.join("");
      return;
    }

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
      if (changed.has(s)) out.push(`<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="${css("--hl")}" stroke-width="2"/>`);
      out.push(`<circle cx="${cx}" cy="${cy}" r="4.2" fill="${clipped ? css("--surface") : css(color)}" stroke="${css(color)}" stroke-width="2"><title>${scaleLabel(s)}: Т ${t.toFixed(2)}</title></circle>`);
      const ly = t > 108 ? cy + 18 : cy - (changed.has(s) ? 12 : 9);
      out.push(`<text class="v${changed.has(s) ? " changed" : ""}" x="${cx}" y="${ly}" text-anchor="middle">${Math.round(t)}</text>`);
    });
    el.chart.innerHTML = out.join("");
  }

  function renderLayout() {
    el.panelBody.classList.toggle("no-chart", !state.showChart);
    el.panelBody.classList.toggle("no-table", !state.showTable);
    el.chartWrap.hidden = !state.showChart;
    el.tableWrap.hidden = !state.showTable;
    el.strip.hidden = state.showTable;
    el.toggleChart.setAttribute("aria-pressed", String(state.showChart));
    el.toggleTable.setAttribute("aria-pressed", String(state.showTable));
    el.keyBtn.setAttribute("aria-pressed", String(state.keyMode));
    el.keyBtn.querySelector(".long").textContent = state.keyMode ? "Скрыть правильные ответы" : "Посмотреть правильные ответы";
    el.keyBtn.querySelector(".short").textContent = state.keyMode ? "Скрыть ключ" : "Ключ";
    document.body.classList.toggle("keymode", state.keyMode);
    for (const k of el.questions.querySelectorAll(".q-key")) k.hidden = !state.keyMode;
    updateScrollMargin();
  }

  function renderSummary() {
    el.progressText.textContent = `${profile.answered} / ${N}`;
    el.progressBar.style.width = (profile.answered / N) * 100 + "%";
    const sexWord = state.sex === "male" ? "мужской" : state.sex === "female" ? "женский" : "пол не выбран";
    el.panelMeta.textContent = `${sexWord} · K = ${profile.raw.K}`;
    el.gate.hidden = !!state.sex;
    el.questions.classList.toggle("locked", !state.sex);
    el.seg.classList.toggle("need", !state.sex);
    for (const b of el.questions.querySelectorAll("button")) b.disabled = !state.sex;
    for (const r of el.sexInputs) r.checked = r.value === state.sex;
  }

  function renderScores() {
    profile = S.computeProfile(state.answers, state.sex);
    renderTable();
    renderValidity();
    renderStrip();
    renderChart();
    renderSummary();
  }

  function renderAll() {
    for (let i = 0; i < N; i++) { renderQuestion(i); renderSheetCell(i); }
    renderScores();
    renderLayout();
  }

  // ---------- действия ----------
  function setAnswer(i, value, opts) {
    if (!state.sex) return;
    const prev = state.answers[i];
    const next = prev === value ? null : value; // повторный клик снимает ответ
    const before = S.computeProfile(state.answers, state.sex);
    state.answers[i] = next;
    state.history[i].push(next);
    const after = S.computeProfile(state.answers, state.sex);
    const prevLast = state.last ? state.last.q : null;
    state.last = { q: i, changed: S.changedScales(before, after), before, after };
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

  function updateScrollMargin() {
    const h = el.panel.getBoundingClientRect().height;
    // Слишком высокая панель (телефон с развёрнутыми графиком и таблицей) не прилипает, чтобы не закрывать вопросы.
    el.panel.classList.toggle("unstick", h > window.innerHeight * 0.6);
    for (const li of el.questions.children) li.style.scrollMarginTop = h + 12 + "px";
  }

  function setSex(sex) {
    state.sex = sex;
    state.last = null;
    renderAll();
    persist();
  }

  function resetAll() {
    if (!window.confirm("Сбросить все ответы и историю? Пол и способ перевода сохранятся.")) return;
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
    for (const r of el.sexInputs) {
      r.addEventListener("change", () => {
        setSex(r.value);
        r.blur(); // иначе клавиши 1/2/3 и стрелки уходят в переключатель пола
      });
    }

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

    el.keyBtn.addEventListener("click", () => { state.keyMode = !state.keyMode; renderLayout(); persist(); });
    el.toggleChart.addEventListener("click", () => { state.showChart = !state.showChart; renderLayout(); persist(); });
    el.toggleTable.addEventListener("click", () => { state.showTable = !state.showTable; renderLayout(); persist(); });
    el.resetBtn.addEventListener("click", resetAll);

    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "select" || tag === "textarea") return;
      if (tag === "input" && e.target.type !== "radio") return;
      if (tag === "input") e.target.blur();
      if (!state.sex) return;
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

    if ("ResizeObserver" in window) new ResizeObserver(updateScrollMargin).observe(el.panel);
    window.addEventListener("resize", updateScrollMargin);
  }

  buildQuestions();
  buildSheet();
  restore();
  bind();
  renderAll();
})();
