(() => {
  const STORAGE_WRONG = "bp_bi_wrong_ids";
  const STORAGE_STATS = "bp_bi_stats";
  const STORAGE_CHAPTER = "bp_bi_ch_stats";
  const STORAGE_EVENTS = "bp_bi_events";
  /** @typedef {{ t: string, questionId: number, chapterId: number, mode: string, chosen: string, answerKey: string, ok: boolean }} AnswerEvent */

  const MAX_EVENTS = 800;
  const EXPORT_VERSION = 1;

  const qs = (s, el = document) => el.querySelector(s);
  const qsa = (s, el = document) => [...el.querySelectorAll(s)];

  /** @type {any} */
  let bank = null;
  /** @type {number[]} */
  let session = [];
  let idx = 0;
  /** @type {'practice'|'exam'} */
  let mode = "practice";
  /** @type {Record<number, string>} */
  let examAnswers = {};
  /** @type {Record<number, { chosen: string; ok: boolean }>} */
  let practiceState = {};
  let roteMode = false;
  /** @type {Record<number, boolean>} */
  let roteReveal = {};
  /** @type {import('chart.js').Chart | null} */
  let chapterChartInst = null;

  function loadWrongSet() {
    try {
      const raw = localStorage.getItem(STORAGE_WRONG);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.map(Number).filter(Number.isFinite) : [];
    } catch {
      return [];
    }
  }

  function saveWrongSet(set) {
    localStorage.setItem(STORAGE_WRONG, JSON.stringify([...new Set(set)].sort((a, b) => a - b)));
  }

  function loadChapterStats() {
    try {
      const raw = localStorage.getItem(STORAGE_CHAPTER);
      const j = raw ? JSON.parse(raw) : {};
      return typeof j === "object" && j ? j : {};
    } catch {
      return {};
    }
  }

  function saveChapterStats(obj) {
    localStorage.setItem(STORAGE_CHAPTER, JSON.stringify(obj));
  }

  /** @param {number} cid */
  /** @param {boolean} ok */
  function bumpChapterStats(cid, ok) {
    const o = loadChapterStats();
    const k = String(cid);
    const cur = o[k] && typeof o[k] === "object" ? { ...o[k] } : { n: 0, c: 0 };
    const n = Number(cur.n) || 0;
    const c = Number(cur.c) || 0;
    o[k] = { n: n + 1, c: c + (ok ? 1 : 0) };
    saveChapterStats(o);
  }

  function loadEvents() {
    try {
      const raw = localStorage.getItem(STORAGE_EVENTS);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  /** @param {AnswerEvent[]} arr */
  function saveEvents(arr) {
    localStorage.setItem(STORAGE_EVENTS, JSON.stringify(arr));
  }

  /** @param {Omit<AnswerEvent, 't'> & { t?: string }} ev */
  function pushAnswerEvent(ev) {
    /** @type {AnswerEvent} */
    const row = {
      t: ev.t || new Date().toISOString(),
      questionId: ev.questionId,
      chapterId: ev.chapterId,
      mode: ev.mode,
      chosen: ev.chosen,
      answerKey: ev.answerKey,
      ok: ev.ok,
    };
    const prev = loadEvents();
    prev.unshift(row);
    saveEvents(prev.slice(0, MAX_EVENTS));
  }

  /** @param {boolean} ok */
  function bumpStats(ok) {
    let n = 0;
    let c = 0;
    try {
      const raw = localStorage.getItem(STORAGE_STATS);
      if (raw) {
        const j = JSON.parse(raw);
        n = Number(j.n) || 0;
        c = Number(j.correct) || 0;
      }
    } catch {
      /* ignore */
    }
    n += 1;
    if (ok) c += 1;
    localStorage.setItem(STORAGE_STATS, JSON.stringify({ n, correct: c }));
  }

  function getStats() {
    try {
      const raw = localStorage.getItem(STORAGE_STATS);
      if (!raw) return { n: 0, correct: 0 };
      const j = JSON.parse(raw);
      return { n: Number(j.n) || 0, correct: Number(j.correct) || 0 };
    } catch {
      return { n: 0, correct: 0 };
    }
  }

  /** @param {number} qid */
  function byId(qid) {
    return bank.questions[qid - 1];
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  /** @returns {HTMLElement} */
  function requireEl(sel) {
    const el = qs(sel);
    if (!el) throw new Error(`缺少節點 ${sel}`);
    return /** @type {HTMLElement} */ (el);
  }

  function buildChapterList() {
    const wrap = requireEl("#chapterList");
    wrap.innerHTML = "";
    bank.chapters.forEach((ch) => {
      const row = document.createElement("label");
      row.className = "chapter-row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.dataset.chapterId = String(ch.id);
      const span = document.createElement("span");
      span.innerHTML = `第 ${ch.id} 章<span style="color:var(--muted)">｜${escapeHtml(ch.title)}</span> （${ch.questionCountParsed} 題）`;
      row.prepend(cb);
      row.append(span);
      wrap.appendChild(row);
    });
    updatePoolHint();
  }

  function selectedChapterIds() {
    return qsa("#chapterList input[type=checkbox]:checked").map((i) => Number(i.dataset.chapterId));
  }

  function collectFilteredQuestions() {
    const cids = new Set(selectedChapterIds());
    if (cids.size === 0) return [];
    return bank.questions.filter((q) => cids.has(q.chapterId)).map((q) => q.id);
  }

  /** 「題庫範圍 + 勾選章節」得到之題數（不含題數上限，因上限在開始練習後才套用） */
  function poolSizeForCurrentSettings() {
    if (!bank) return 0;
    const scope = requireEl("#scopeSelect").value;
    if (scope === "wrong") {
      const w = loadWrongSet();
      const setValid = new Set(bank.questions.map((/** @type {{ id: number }} */ q) => q.id));
      return w.filter((id) => setValid.has(id)).length;
    }
    return collectFilteredQuestions().length;
  }

  function updatePoolHint() {
    const hint = qs("#bankPoolHint");
    if (!hint || !bank) return;
    const total = bank.questions.length;
    const lastNum = bank.questions[total - 1]?.id ?? total;
    const pool = poolSizeForCurrentSettings();
    const refNote = total === 260 ? "與 BI 規劃師參考題型 PDF 標示題數相符。" : "";
    hint.textContent = `已載入全題庫 ${total} 題（題號 1～${lastNum}）。${refNote}依左側「題庫範圍／章節」目前可抽到 ${pool} 題。若要一口氣練這 ${total} 題：請選「全部已選章節」、章節全選、題數上限留空。`;
  }

  function validateBankIntegrity() {
    const len = bank.questions.length;
    const t = Number(bank.total);
    /** @type {string[]} */
    const problems = [];
    if (!Number.isFinite(t) || t !== len) {
      problems.push(`JSON 標示 total=${bank.total}，實際題目筆數=${len}`);
    }
    for (let i = 0; i < len; i += 1) {
      if (bank.questions[i].id !== i + 1) {
        problems.push(`題號順序應為連續 1…N，於第 ${i + 1} 筆不符`);
        break;
      }
    }
    if (problems.length) {
      const msg = problems.join("\n");
      console.error(msg);
      alert(`題庫檔異常：\n${msg}\n\n請在本機重新執行 scripts/parse_bp_pdf.py 產製 web/questions.json 後再上傳部署。`);
    }
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function renderStatsLine() {
    const { n, correct } = getStats();
    const rate = n ? Math.round((correct / n) * 100) : 0;
    qs("#statsLine").textContent = `累計作答 ${n} 題｜答對 ${correct} 題｜正確率 ${rate}%`;
    qs("#wrongLine").textContent = `錯題本 ${loadWrongSet().length} 題`;
    renderChapterChart();
  }

  function renderChapterChart() {
    const canvas = qs("#chapterChart");
    if (!canvas || !bank || typeof Chart === "undefined") return;

    const stats = loadChapterStats();
    const labels = bank.chapters.map((ch) => `第${ch.id}章`);
    const data = bank.chapters.map((ch) => {
      const sk = stats[String(ch.id)];
      const n = sk && typeof sk === "object" ? Number(sk.n) || 0 : 0;
      const c = sk && typeof sk === "object" ? Number(sk.c) || 0 : 0;
      if (!n) return null;
      return Math.round((c / n) * 100);
    });
    const colors = bank.chapters.map((ch) => {
      const sk = stats[String(ch.id)];
      const n = sk && typeof sk === "object" ? Number(sk.n) || 0 : 0;
      if (!n) return "rgba(139, 151, 171, 0.35)";
      return "rgba(61, 139, 253, 0.82)";
    });

    /** @type {any} */
    const ds = {
      label: "正確率 （%）",
      data,
      backgroundColor: colors,
      borderRadius: 6,
      borderSkipped: false,
    };

    if (chapterChartInst) {
      chapterChartInst.data.labels = labels;
      chapterChartInst.data.datasets[0].data = data;
      chapterChartInst.data.datasets[0].backgroundColor = colors;
      chapterChartInst.update();
      return;
    }

    chapterChartInst = new Chart(canvas, {
      type: "bar",
      data: { labels, datasets: [ds] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: { callback: (v) => `${v}%`, color: "#8b97ab" },
            grid: { color: "rgba(255,255,255,0.06)" },
          },
          x: {
            ticks: { color: "#8b97ab", maxRotation: 50 },
            grid: { display: false },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(ctx) {
                const chId = bank.chapters[ctx.dataIndex].id;
                const sk = stats[String(chId)];
                const n = sk ? Number(sk.n) || 0 : 0;
                const c = sk ? Number(sk.c) || 0 : 0;
                const v = ctx.raw;
                const pctStr =
                  typeof v === "number" && !Number.isNaN(v) ? `${v}%` : "—";
                return `作答 ${n}／答對 ${c}（約 ${pctStr}）`;
              },
            },
          },
        },
      },
    });
  }

  /** @param {'setup'|'quiz'|'exam'} name */
  function setScreen(name) {
    qsa("[data-screen]").forEach((el) => {
      el.hidden = el.dataset.screen !== name;
    });

    requireEl("#sideSetup").hidden = name !== "setup";
    qs("#appLayout").classList.toggle("layout-focus", name !== "setup");
  }

  function examTotal() {
    return session.length;
  }

  function examAnsweredCount() {
    return session.filter((id) => examAnswers[id]).length;
  }

  function startSession() {
    mode = /** @type any */ (requireEl("#modeSelect").value);
    roteMode = /** @type HTMLInputElement */ (requireEl("#roteMode")).checked;
    let ids = collectFilteredQuestions();
    const scope = requireEl("#scopeSelect").value;
    if (scope === "wrong") {
      const w = loadWrongSet();
      const setValid = new Set(bank.questions.map((/** @type {{ id: number }} */ x) => x.id));
      ids = w.filter((id) => setValid.has(id));
      if (!ids.length) {
        alert("錯題本目前是空的（或已不再包含於題庫）。");
        return;
      }
    }
    const limitRaw = requireEl("#limitInput").value.trim();
    if (requireEl("#shuffleSelect").value === "yes") ids = shuffle(ids);
    if (limitRaw) {
      const lim = Math.max(1, Math.min(Number(limitRaw) || 0, ids.length || 1));
      ids = ids.slice(0, lim);
    }

    session = ids;
    idx = 0;
    examAnswers = {};
    practiceState = {};
    roteReveal = {};

    requireEl("#examSummary").innerHTML = "";

    setScreen(mode === "exam" ? "exam" : "quiz");
    if (mode === "exam") renderExamOverview();

    if (mode === "practice") {
      requireEl("#practiceNav").hidden = false;
      requireEl("#examNav").hidden = true;
    } else {
      requireEl("#practiceNav").hidden = true;
      requireEl("#examNav").hidden = true;
    }

    renderQuestion();
    updateToolbar();
  }

  function renderExamOverview() {
    const list = requireEl("#examList");
    list.innerHTML = "";
    requireEl("#examProgress").textContent = `已作答 ${examAnsweredCount()} / ${examTotal()}`;
    session.forEach((qid, i) => {
      const q = byId(qid);
      const row = document.createElement("button");
      row.type = "button";
      row.className = "btn btn-ghost";
      row.style.textAlign = "left";
      row.style.width = "100%";
      row.style.marginBottom = "8px";
      const mark = examAnswers[qid] ? "●" : "○";
      row.innerHTML = `${mark} <strong>#${qid}</strong> ｜第 ${q.chapterId} 章`;
      row.addEventListener("click", () => {
        idx = i;
        setScreen("quiz");
        requireEl("#examNav").hidden = false;
        requireEl("#practiceNav").hidden = true;
        renderQuestion();
        updateToolbar();
      });
      list.appendChild(row);
    });
  }

  /**
   * @param {number} qid
   * @returns {boolean}
   */
  function optionTextVisible(qid) {
    if (!roteMode) return true;
    if (roteReveal[qid]) return true;
    if (mode === "practice" && practiceState[qid]) return true;
    if (mode === "exam" && examAnswers[qid]) return true;
    return false;
  }

  function renderQuestion() {
    const area = requireEl("#quizArea");

    if (!session.length) {
      area.innerHTML = `<div class="empty-state">沒有可練習的題目。請確認至少勾選一章並重新開始。</div>`;
      requireEl("#quizTitle").textContent = "";
      updateToolbar();
      return;
    }
    const qid = session[idx];
    const q = byId(qid);

    requireEl("#quizTitle").textContent =
      mode === "exam"
        ? "模擬考作答"
        : "練習模式（送出選項後立即對答案）";

    const optName = `opt-${qid}`;
    const visible = optionTextVisible(qid);
    const revealRow =
      roteMode && !visible
        ? `<div class="q-actions"><button type="button" class="btn btn-ghost" id="btnRevealOpts">顯示本題選項文字</button></div>`
        : "";

    area.innerHTML = `
      <article class="q-card" data-qid="${qid}">
        <div class="q-stem-num">題號 ${qid} · 第 ${q.chapterId} 章 ${escapeHtml(q.chapterTitle)}${roteMode ? " · <span style='color:var(--muted)'>背題模式</span>" : ""}</div>
        <p class="q-stem">${escapeHtml(q.stem)}</p>
        ${revealRow}
        <div class="options${roteMode && !visible ? " options-masked" : ""}">
          ${q.options
            .map((/** @type {{ key: string; text: string }} */ o) => {
              const checked = examAnswers[qid] === o.key ? "checked" : "";
              const ot = visible ? escapeHtml(o.text) : `<span class="opt-placeholder">（選項文字已隱藏）</span>`;
              return `<label class="option" data-key="${o.key}">
                <input type="radio" name="${escapeHtml(optName)}" value="${o.key}" ${checked} />
                <span class="opt-key">${o.key}</span>
                <span class="opt-text">${ot}</span>
              </label>`;
            })
            .join("")}
        </div>
        <div id="quizFeedback" class="feedback hidden" role="status"></div>
      </article>`;

    const br = qs("#btnRevealOpts");
    if (br) {
      br.addEventListener("click", () => {
        roteReveal[qid] = true;
        renderQuestion();
      });
    }

    const fb = requireEl("#quizFeedback");

    qsa(".option input", area).forEach((inp) => {
      inp.addEventListener("change", () => {
        if (mode !== "exam") {
          practicePick(qid, /** @type HTMLInputElement */ (inp));
          return;
        }
        examAnswers[qid] = inp.value;
        updateExamProgressText();
      });
    });

    if (mode === "practice") {
      const st = practiceState[qid];
      if (st) {
        const qo = byId(qid);
        qsa(".option", area).forEach((lab) => {
          const k = /** @type HTMLElement */ (lab).dataset.key;
          lab.classList.add("disabled");
          qs("input", lab).disabled = true;
          if (k === qo.answer) lab.classList.add("correct");
          if (!st.ok && k === st.chosen) lab.classList.add("wrong");
          if (k === st.chosen) qs("input", lab).checked = true;
        });
        fb.classList.remove("hidden", "ok", "bad");
        fb.classList.add(st.ok ? "ok" : "bad");
        fb.innerHTML = st.ok
          ? `答對了。參考答案：<strong>${qo.answer}</strong>`
          : `答錯了。參考答案：<strong>${qo.answer}</strong>`;
      } else {
        fb.classList.add("hidden");
      }
    } else {
      fb.classList.add("hidden");
    }
    updateToolbar();
  }

  function updateExamProgressText() {
    const ep = qs("#examProgress");
    if (ep) ep.textContent = `已作答 ${examAnsweredCount()} / ${examTotal()}`;
  }

  /** @param {number} qid */
  /** @param {HTMLInputElement} inp */
  function practicePick(qid, inp) {
    const q = byId(qid);
    const chosen = inp.value;
    const ok = chosen === q.answer;
    practiceState[qid] = { chosen, ok };
    bumpStats(ok);
    bumpChapterStats(q.chapterId, ok);
    pushAnswerEvent({
      questionId: qid,
      chapterId: q.chapterId,
      mode: "practice",
      chosen,
      answerKey: q.answer,
      ok,
    });

    qsa(".option", requireEl("#quizArea")).forEach((lab) => {
      const k = /** @type HTMLElement */ (lab).dataset.key;
      lab.classList.add("disabled");
      qs("input", lab).disabled = true;
      if (k === q.answer) lab.classList.add("correct");
      if (!ok && k === chosen) lab.classList.add("wrong");
    });

    const feedback = requireEl("#quizFeedback");
    feedback.classList.remove("hidden", "ok", "bad");
    feedback.classList.add(ok ? "ok" : "bad");
    feedback.innerHTML = ok
      ? `答對了。參考答案：<strong>${q.answer}</strong>`
      : `答錯了。參考答案：<strong>${q.answer}</strong>`;

    const wrong = loadWrongSet();
    if (ok) {
      saveWrongSet(wrong.filter((x) => x !== qid));
    } else if (!wrong.includes(qid)) {
      wrong.push(qid);
      saveWrongSet(wrong);
    }
    roteReveal[qid] = true;
    renderStatsLine();
  }

  function submitExamConfirmed() {
    const unanswered = examTotal() - examAnsweredCount();
    if (unanswered > 0) {
      if (!confirm(`尚有 ${unanswered} 題未選擇答案，確定仍要交卷？`)) return;
    } else if (!confirm("確定交卷並計算分數？")) {
      return;
    }

    let correct = 0;
    session.forEach((qid) => {
      const q = byId(qid);
      const chosenRaw = examAnswers[qid];
      const chosen = typeof chosenRaw === "string" ? chosenRaw : "";
      const ok = chosenRaw === q.answer;
      if (ok) correct += 1;
      bumpStats(ok);
      bumpChapterStats(q.chapterId, ok);
      pushAnswerEvent({
        questionId: qid,
        chapterId: q.chapterId,
        mode: "exam",
        chosen,
        answerKey: q.answer,
        ok,
      });
    });

    let wrongBook = loadWrongSet();
    session.forEach((qid) => {
      const q = byId(qid);
      const ok = examAnswers[qid] === q.answer;
      if (ok) {
        wrongBook = wrongBook.filter((x) => x !== qid);
      } else if (!wrongBook.includes(qid)) {
        wrongBook.push(qid);
      }
    });
    saveWrongSet(wrongBook);

    const n = examTotal();
    const pct = n ? Math.round((correct / n) * 100) : 0;

    renderStatsLine();
    setScreen("setup");

    requireEl("#examSummary").innerHTML = `
      <div class="q-card">
        <h3 style="margin:0 0 10px;font-size:1.1rem">交卷結果</h3>
        <p style="margin:0">總題數 <strong>${n}</strong>，答對 <strong>${correct}</strong>，
        百分得分 <strong>${pct}</strong> 分</p>
        <p style="margin:12px 0 0;font-size:0.9rem;color:var(--muted)">
          未答對的題目已併入錯題本，可於側欄選「僅錯題本」重練。</p>
      </div>`;
  }

  function updateToolbar() {
    const total = session.length;
    requireEl("#toolbarMeta").textContent = total ? `${idx + 1} / ${total}` : "—";
    const p = total ? Math.round(((idx + 1) / total) * 100) : 0;
    requireEl("#progressFill").style.width = `${p}%`;

    const atStart = idx <= 0;
    const atEnd = total === 0 || idx >= total - 1;
    qsa("#btnPrev, #btnPrevExam").forEach((b) => {
      b.disabled = atStart;
    });
    qsa("#btnNext, #btnNextExam").forEach((b) => {
      b.disabled = atEnd;
    });

    renderStatsLine();
    updateExamProgressText();
  }

  function goQuizHome() {
    if (!confirm("確定離開？未提交的模擬考進度將遺失。")) return;
    setScreen("setup");
  }

  function exportBackup() {
    const payload = {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      sourceQuizMeta: bank ? { pdf: bank.source, total: bank.total } : {},
      chapterStats: loadChapterStats(),
      globalStats: getStats(),
      wrongBook: loadWrongSet(),
      events: loadEvents(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bi-quiz-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /** @param {string} text */
  function importMerged(text) {
    const j = JSON.parse(text);
    if (!j || typeof j !== "object") throw new Error("無效的備份格式");

    if (Array.isArray(j.events)) {
      const keyEv = (e) =>
        [String(e?.t ?? ""), Number(e.questionId), String(e.mode), String(e.chosen), String(e.answerKey), String(!!e.ok)].join("|");
      const merged = [...j.events, ...loadEvents()];
      const seen = new Set();
      /** @type {AnswerEvent[]} */
      const dedup = [];
      for (const row of merged) {
        if (!row || typeof row !== "object") continue;
        const k = keyEv(row);
        if (seen.has(k)) continue;
        seen.add(k);
        dedup.push(row);
      }
      saveEvents(dedup.slice(0, MAX_EVENTS));
    }

    const ch = j.chapterStats;
    if (ch && typeof ch === "object") {
      const into = loadChapterStats();
      for (const [k, v] of Object.entries(ch)) {
        const cur = into[k] && typeof into[k] === "object" ? into[k] : { n: 0, c: 0 };
        const vv = /** @type any */ (v);
        into[k] = {
          n: (Number(cur.n) || 0) + (Number(vv?.n) || 0),
          c: (Number(cur.c) || 0) + (Number(vv?.c) || 0),
        };
      }
      saveChapterStats(into);
    }

    const gs = j.globalStats;
    if (gs && typeof gs === "object") {
      const prev = getStats();
      saveStatsRaw({
        n: (prev.n || 0) + (Number(gs.n) || 0),
        correct: (prev.correct || 0) + (Number(gs.correct) || 0),
      });
    }

    if (Array.isArray(j.wrongBook)) {
      saveWrongSet([...new Set([...loadWrongSet(), ...j.wrongBook.map(Number)])]);
    }

    alert("已合併匯入紀錄與統計（事件已去重並截長）。");
    renderStatsLine();
    renderChapterChart();
    updatePoolHint();
  }

  /** @param {{ n: number, correct: number }} o */
  function saveStatsRaw(o) {
    localStorage.setItem(STORAGE_STATS, JSON.stringify({ n: o.n, correct: o.correct }));
  }

  function resetAllStorage() {
    if (!confirm("將清除統計、章節圖表、作答事件、錯題本……確定重置？")) return;
    [
      STORAGE_WRONG,
      STORAGE_STATS,
      STORAGE_CHAPTER,
      STORAGE_EVENTS,
    ].forEach((k) => localStorage.removeItem(k));
    if (chapterChartInst) {
      chapterChartInst.destroy();
      chapterChartInst = null;
    }
    renderStatsLine();
  }

  function wire() {
    requireEl("#btnStart").addEventListener("click", () => startSession());

    requireEl("#btnSelectAllCh").addEventListener("click", () => {
      qsa("#chapterList input[type=checkbox]").forEach((c) => {
        c.checked = true;
      });
      updatePoolHint();
    });

    requireEl("#btnClearCh").addEventListener("click", () => {
      qsa("#chapterList input[type=checkbox]").forEach((c) => {
        c.checked = false;
      });
      updatePoolHint();
    });

    requireEl("#chapterList").addEventListener("change", () => updatePoolHint());
    requireEl("#scopeSelect").addEventListener("change", () => updatePoolHint());

    requireEl("#btnClearWrong").addEventListener("click", () => {
      if (confirm("確定清空錯題本？")) {
        saveWrongSet([]);
        renderStatsLine();
        updatePoolHint();
      }
    });

    requireEl("#btnExport").addEventListener("click", () => exportBackup());
    requireEl("#btnImportPick").addEventListener("click", () => requireEl("#importFile").click());

    /** @type HTMLInputElement */ (requireEl("#importFile")).addEventListener("change", (ev) => {
      const file = /** @type HTMLInputElement */ (ev.target).files?.[0];
      if (!file) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          importMerged(String(rd.result || ""));
        } catch (err) {
          alert(String(err));
        }
        /** @type HTMLInputElement */ (requireEl("#importFile")).value = "";
      };
      rd.readAsText(file, "utf-8");
    });

    requireEl("#btnResetAll").addEventListener("click", () => resetAllStorage());

    requireEl("#btnExamBoard").addEventListener("click", () => {
      if (mode !== "exam") return;
      setScreen("exam");
      renderExamOverview();
    });

    requireEl("#btnSubmitExam").addEventListener("click", () => submitExamConfirmed());
    requireEl("#btnSubmitExamInline").addEventListener("click", () => submitExamConfirmed());

    requireEl("#btnHomeFromExam").addEventListener("click", () => goQuizHome());

    requireEl("#btnPrev").addEventListener("click", () => {
      idx = Math.max(0, idx - 1);
      renderQuestion();
    });

    requireEl("#btnNext").addEventListener("click", () => {
      idx = Math.min(session.length - 1, idx + 1);
      renderQuestion();
    });

    requireEl("#btnPrevExam").addEventListener("click", () => {
      idx = Math.max(0, idx - 1);
      renderQuestion();
    });

    requireEl("#btnNextExam").addEventListener("click", () => {
      idx = Math.min(session.length - 1, idx + 1);
      renderQuestion();
    });

    requireEl("#btnHome").addEventListener("click", () => {
      setScreen("setup");
    });

    document.addEventListener("keydown", (e) => {
      if (e.target.closest("input,textarea,select,button")) return;
      const onQuiz = !qs('[data-screen="quiz"]')?.hidden;
      if (!onQuiz) return;
      if (e.key === "ArrowLeft") {
        const prev = mode === "exam" ? qs("#btnPrevExam") : qs("#btnPrev");
        if (prev && !prev.disabled) prev.click();
      }
      if (e.key === "ArrowRight") {
        const next = mode === "exam" ? qs("#btnNextExam") : qs("#btnNext");
        if (next && !next.disabled) next.click();
      }
    });
  }

  async function init() {
    wire();
    setScreen("setup");

    const res = await fetch("./questions.json", { cache: "no-store" });
    if (!res.ok)
      throw new Error("無法載入 questions.json。若為本機開發請執行 python3 scripts/serve.py。");
    bank = await res.json();

    validateBankIntegrity();
    buildChapterList();
    renderStatsLine();

    const wHint = qs("#welcomeTotalHint");
    if (wHint) wHint.textContent = String(bank.total);

    const lastId = bank.questions[bank.questions.length - 1]?.id ?? bank.total;
    requireEl("#loadMeta").textContent = `已載入題庫 ${bank.total} 題（題號 1～${lastId}）｜${bank.source}`;

    /** 等 CDN Chart 載完（與 defer 腳本次序相容） */
    if (typeof Chart === "undefined") {
      await new Promise((resolve) => {
        let n = 0;
        const t = setInterval(() => {
          n += 1;
          if (typeof Chart !== "undefined") {
            clearInterval(t);
            resolve(null);
          } else if (n > 100) {
            clearInterval(t);
            console.warn("Chart.js 未載入，章節圖表略過");
            resolve(null);
          }
        }, 40);
      });
    }
    renderChapterChart();
  }

  init().catch((err) => {
    const banner = document.createElement("div");
    banner.className = "empty-state";
    banner.style.margin = "24px 20px";
    banner.textContent = String(err.message || err);
    qs("main.panel-main")?.prepend(banner);
    console.error(err);
  });
})();
