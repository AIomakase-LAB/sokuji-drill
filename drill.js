/** 即時判断ドリル: ホーム・出題・結果。プロトタイプ(sokuji-drill.html)の流れを踏襲。 */
(function () {
  'use strict';
  var App = window.App, SD = window.SD, state = App.state, esc = App.esc, $ = App.$, $$ = App.$$;

  // ---------- ホーム ----------
  function tagsOf(list) {
    var seen = {};
    list.forEach(function (c) { if (c.tag) seen[c.tag] = 1; });
    return Object.keys(seen).sort();
  }
  function filtered() {
    var s = state.settings;
    return App.drillable().filter(function (c) {
      return (!s.tag || c.tag === s.tag) && (!s.diff || c.difficulty === s.diff);
    });
  }
  function lastScore(caseId) {
    var l = App.sessionsAsc().filter(function (s) { return s.caseId === caseId; }).pop();
    return l ? l.score + '/' + l.total : '';
  }
  function chips(c) {
    var d = SD.DIFFICULTY[c.difficulty] || '基本';
    return (c.tag ? '<span class="tag">' + esc(c.tag) + '</span>' : '') + '<span class="tag d' + (c.difficulty || 1) + '">' + esc(d) + '</span>' +
      (c.source === 'sample' ? '<span class="tag gray">サンプル</span>' : '');
  }

  App.views.home = function () {
    var s = state.settings, list = filtered(), all = App.drillable();
    var ss = App.sessionsAsc(), today = new Date();
    var g = SD.goalProgress(ss, s.goals, today);
    var weak = SD.weakness(ss, 'stage').filter(function (w) { return w.n >= 3; });
    var tags = tagsOf(all);
    return '' +
      '<header class="top"><h1>即時判断ドリル</h1>' + App.syncBadge() + '</header>' +
      '<p class="sub">指令から引き継ぎまで、場面ごとに数秒で判断する練習です。</p>' +
      '<div class="card stat3">' +
        '<div><b>' + SD.streak(ss, today) + '</b><small>連続日数</small></div>' +
        '<div><b>' + g.week + (g.weekTarget ? '<span>/' + g.weekTarget + '</span>' : '') + '</b><small>今週の回数' + (g.weekDone ? ' ✓' : '') + '</small></div>' +
        '<div><b>' + (g.avg == null ? '—' : g.avg) + '<span>秒</span></b><small>今週の平均' + (g.avgOk ? ' ✓' : g.avgTarget ? '(目標' + g.avgTarget + ')' : '') + '</small></div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="lbl">制限時間(1場面)</div>' +
        '<div class="seg">' + SD.TIME_CHOICES.map(function (v) { return '<button data-act="time" data-v="' + v + '" class="' + (s.time === v ? 'on' : '') + '">' + v + '秒</button>'; }).join('') + '</div>' +
        '<div class="lbl">答え方</div>' +
        '<div class="seg"><button data-act="mode" data-v="choice" class="' + (s.mode === 'choice' ? 'on' : '') + '">選択式</button><button data-act="mode" data-v="speak" class="' + (s.mode === 'speak' ? 'on' : '') + '">声に出す</button></div>' +
        '<p class="note">' + (s.mode === 'choice' ? '選択肢から素早く選びます。並びは毎回入れ替わります。' : '声に出して第一声を言い、模範解答を見て自己評価します。') + '</p>' +
        '<div class="lbl">絞り込み</div>' +
        '<div class="seg wrap">' +
          '<button data-act="diff" data-v="0" class="' + (!s.diff ? 'on' : '') + '">すべて</button>' +
          [1, 2, 3].map(function (d) { return '<button data-act="diff" data-v="' + d + '" class="' + (s.diff === d ? 'on' : '') + '">' + SD.DIFFICULTY[d] + '</button>'; }).join('') +
        '</div>' +
        (tags.length ? '<div class="seg wrap" style="margin-top:8px"><button data-act="tag" data-v="" class="' + (!s.tag ? 'on' : '') + '">全カテゴリ</button>' +
          tags.map(function (t) { return '<button data-act="tag" data-v="' + esc(t) + '" class="' + (s.tag === t ? 'on' : '') + '">' + esc(t) + '</button>'; }).join('') + '</div>' : '') +
      '</div>' +
      '<div class="two">' +
        '<button class="btn" data-act="random"' + (list.length ? '' : ' disabled') + '>ランダムで1本</button>' +
        '<button class="btn sec" data-act="weak"' + (weak.length ? '' : ' disabled') + '>弱点場面だけ</button>' +
      '</div>' +
      (weak.length ? '<p class="note">弱点: ' + weak.slice(0, 2).map(function (w) { return esc(w.key) + '(正答' + Math.round(w.rate * 100) + '%)'; }).join('、') + '</p>' : '<p class="note">弱点場面は、各場面を3回以上訓練すると出せます。</p>') +
      '<h2>症例(' + list.length + ')</h2>' +
      (list.length ? list.map(function (c) {
        var ls = lastScore(c.id);
        return '<button class="sc" data-act="start" data-id="' + esc(c.id) + '"><span>' + chips(c) + '</span><b>' + esc(c.title) + '</b><small>' + c.stages.length + '場面' + (ls ? '・前回 ' + ls : '') + '</small></button>';
      }).join('') : '<div class="empty">条件に合う症例がありません。「症例」タブで作成・取り込みができます。</div>');
  };

  // ---------- 出題 ----------
  var raf = 0;
  function stopTimer() { cancelAnimationFrame(raf); }
  function startTimer(sec, onEnd) {
    stopTimer();
    var bar = $('#bar'), lab = $('#sec');
    var t0 = performance.now(), total = sec * 1000;
    var tick = function () {
      var left = Math.max(0, total - (performance.now() - t0));
      if (bar) { bar.style.width = (left / total * 100) + '%'; bar.classList.toggle('low', left <= 3000); }
      if (lab) lab.textContent = Math.ceil(left / 1000);
      if (left <= 0) { onEnd(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return t0;
  }

  function startRun(sc, stages) {
    state.run = { sc: sc, stages: stages, idx: 0, results: [], log: [], state: 'ready', t0: 0, cur: null, rated: false, time: state.settings.time, mode: state.settings.mode };
    ready();
  }
  function startCase(c) {
    startRun({ id: c.id, title: c.title, tag: c.tag || '', difficulty: c.difficulty || 1 }, SD.prepareRun(c));
  }
  /** 正答率の低い場面名を2つ選び、全症例からその場面だけを集めて出す。 */
  function startWeak() {
    var weak = SD.weakness(App.sessionsAsc(), 'stage').filter(function (w) { return w.n >= 3; }).slice(0, 2).map(function (w) { return w.key; });
    var pool = [];
    App.drillable().forEach(function (c) {
      SD.prepareRun(c).forEach(function (st) { if (weak.indexOf(st.name) >= 0) pool.push(st); });
    });
    if (!pool.length) { App.toast('弱点の場面に当たる症例がありません', true); return; }
    startRun({ id: 'weak', title: '弱点場面ドリル(' + weak.join('・') + ')', tag: '', difficulty: 1 }, SD.shuffle(pool).slice(0, 9));
  }

  function ready() {
    var r = state.run;
    $('#tabbar').hidden = true;
    $('#view').innerHTML = '<div class="notice">訓練用です。実際の活動は所属のMCプロトコールに従ってください。</div>' +
      '<div class="topbar"><button class="ghost" data-act="home">‹ もどる</button></div>' +
      '<span class="tag">' + esc(r.sc.tag || '—') + '</span>' +
      '<h1>' + esc(r.sc.title) + '</h1>' +
      '<div class="card" style="margin-top:12px"><div>' + r.stages.length + '場面／1場面 ' + r.time + '秒／' + (r.mode === 'speak' ? '声に出す' : '選択式') + '</div>' +
      '<p class="note" style="margin-bottom:0">' + r.stages.map(function (s) { return esc(s.name); }).join(' → ') + '</p></div>' +
      '<div class="hint">場面が表示された瞬間にタイマーが動きます。最初の一手を考えて、迷ったら『命に関わるものから先に』。</div>' +
      '<button class="btn" data-act="go">開始</button>';
    window.scrollTo(0, 0);
  }

  function showStage() {
    var r = state.run, st = r.stages[r.idx], n = r.stages.length, speak = r.mode === 'speak';
    r.cur = st; r.state = 'ask'; r.rated = false;
    $('#tabbar').hidden = true;
    $('#view').innerHTML = '<div class="notice">訓練用です。実際の活動は所属のMCプロトコールに従ってください。</div>' +
      '<div class="topbar"><button class="ghost" data-act="abort">× 中止</button><div class="count">' + (r.idx + 1) + ' / ' + n + '</div></div>' +
      '<div class="dots">' + r.stages.map(function (_, i) { return '<i class="' + (i < r.idx ? 'done' : i === r.idx ? 'now' : '') + '"></i>'; }).join('') + '</div>' +
      '<div class="stagename">' + esc(st.name) + '</div>' +
      '<div class="card info">' + esc(st.info) + '</div>' +
      '<div class="timer"><div class="track"><div id="bar"></div></div><div id="sec">' + r.time + '</div></div>' +
      '<div class="q">' + esc(st.q) + '</div>' +
      (speak
        ? '<div class="hint" id="speakhint">声に出して答えてから、答えを見ます。</div><button class="btn" id="reveal" data-act="reveal">答えを見る</button>'
        : '<div id="choices">' + st.opts.map(function (o, i) { return '<button class="opt" data-act="pick" data-v="' + i + '"><span class="k">' + (i + 1) + '</span>' + esc(o.t) + '</button>'; }).join('') + '</div>') +
      '<div id="fbbox"></div>' +
      (r.log.length ? '<details><summary>これまでの経過</summary>' + r.log.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('') + '</details>' : '');
    window.scrollTo(0, 0);
    r.t0 = startTimer(r.time, function () { if (speak) reveal(true); else answer(-1); });
  }

  function elapsed() { var r = state.run; return Math.min(performance.now() - r.t0, r.time * 1000); }

  function push(st, score, ms, timeout, pick) {
    state.run.results.push({ idx: st.stageIdx, name: st.name, score: score, ms: Math.round(ms), timeout: !!timeout, pick: pick, cid: st.caseId, q: st.q, why: st.why, correct: st.opts.filter(function (o) { return o.ok; })[0].t, picked: pick == null || pick < 0 ? null : (st.opts.filter(function (o) { return o.origin === pick; })[0] || {}).t });
  }
  function fbBox(cls, verdict, secs, st, showAns) {
    var r = state.run, last = r.idx === r.stages.length - 1;
    var correct = st.opts.filter(function (o) { return o.ok; })[0].t;
    return '<div class="fb ' + cls + '"><div class="verdict">' + verdict + '<span>' + secs.toFixed(1) + '秒</span></div>' +
      (showAns ? '<div class="ans"><b>正解:</b> ' + esc(correct) + '</div>' : '') +
      '<div class="why">' + esc(st.why) + (st.protocol_ref ? '<br><small>根拠: ' + esc(st.protocol_ref) + '</small>' : '') + '</div>' +
      '<button class="btn" id="nextbtn" data-act="next">' + (last ? '結果を見る' : '次の場面へ') + '</button></div>';
  }
  function answer(i) {
    var r = state.run;
    if (!r || r.state !== 'ask') return;
    r.state = 'fb'; stopTimer();
    var st = r.cur, ms = i < 0 ? r.time * 1000 : elapsed(), ok = i >= 0 && st.opts[i].ok;
    push(st, ok ? 1 : 0, ms, i < 0, i >= 0 ? st.opts[i].origin : null);
    $$('#choices .opt').forEach(function (b, k) {
      b.disabled = true;
      if (st.opts[k].ok) b.classList.add('ok'); else if (k === i) b.classList.add('ng'); else b.classList.add('dim');
    });
    var box = $('#fbbox');
    box.innerHTML = fbBox(ok ? 'ok' : (i < 0 ? 'to' : 'ng'), ok ? '正解' : (i < 0 ? '時間切れ' : '不正解'), ms / 1000, st, !ok);
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function reveal(auto) {
    var r = state.run;
    if (!r || r.state !== 'ask') return;
    r.state = 'fb'; stopTimer();
    var st = r.cur, ms = auto ? r.time * 1000 : elapsed();
    r.curMs = ms; r.curAuto = !!auto;
    var rv = $('#reveal'); if (rv) rv.remove();
    var h = $('#speakhint'); if (h) h.remove();
    var correct = st.opts.filter(function (o) { return o.ok; })[0].t;
    var box = $('#fbbox');
    box.innerHTML = '<div class="fb"><div class="verdict">模範解答<span>' + (ms / 1000).toFixed(1) + '秒' + (auto ? '(時間切れ)' : '') + '</span></div>' +
      '<div class="ans">' + esc(correct) + '</div><div class="why">' + esc(st.why) + (st.protocol_ref ? '<br><small>根拠: ' + esc(st.protocol_ref) + '</small>' : '') + '</div>' +
      '<div class="lbl" style="margin-top:12px">自分の第一声は?</div>' +
      '<div class="rate"><button data-act="rate" data-v="1">言えた</button><button data-act="rate" data-v="0.5">一部だけ</button><button data-act="rate" data-v="0">言えず</button></div></div>';
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function rate(v) {
    var r = state.run;
    if (!r || r.state !== 'fb' || r.rated) return;
    r.rated = true;
    push(r.cur, +v, r.curMs, r.curAuto, null);
    next(true);
  }
  function next(fromRate) {
    var r = state.run;
    if (!r || r.state !== 'fb') return;
    if (r.mode === 'speak' && !fromRate && !r.rated) return; // 声出しは自己評価が先
    r.log.push(r.cur.name + '\n' + r.cur.info);
    r.idx++;
    if (r.idx >= r.stages.length) result(); else showStage();
  }

  // ---------- 結果 ----------
  function buildSession(r, sum) {
    return {
      id: r.sessionId, caseId: r.sc.id, caseTitle: r.sc.title, tag: r.sc.tag, difficulty: r.sc.difficulty,
      mode: r.mode, timeLimit: r.time, score: sum.sum, total: sum.total, avgTime: sum.avg, note: r.note || '',
      createdAt: r.startedAt,
      results: r.results.map(function (x) { return { idx: x.idx, name: x.name, score: x.score, ms: x.ms, timeout: x.timeout, pick: x.pick, cid: x.cid }; })
    };
  }
  function result() {
    var r = state.run;
    r.state = 'done'; stopTimer();
    r.sessionId = SD.newId('s');
    r.startedAt = new Date().toISOString();
    r.sum = SD.summarize(r.results);
    App.mutate('saveSession', buildSession(r, r.sum)); // 端末に保存し、送信キューへ
    resultView();
  }
  function resultView() {
    var r = state.run, R = r.results, sum = r.sum;
    var misses = R.filter(function (x) { return x.score < 1; });
    var slow = sum.slowest >= 0 ? R[sum.slowest] : null;
    $('#tabbar').hidden = true;
    $('#view').innerHTML = '<div class="notice">訓練用です。実際の活動は所属のMCプロトコールに従ってください。</div>' +
      '<div class="topbar"><button class="ghost" data-act="home">‹ ホーム</button>' + App.syncBadge() + '</div>' +
      '<h1>結果</h1><p class="sub">' + esc(r.sc.title) + '</p>' +
      '<div class="card"><div class="big">' + sum.sum + '<span> / ' + sum.total + '</span></div>' +
      '<div class="sub" style="margin:6px 0 0">正答率 ' + sum.pct + '%・平均 ' + sum.avg.toFixed(1) + '秒／場面</div></div>' +
      '<h2>場面ごと</h2><div class="card">' + R.map(function (x) {
        var c = x.score === 1 ? 's1' : x.score === 0 ? 's0' : 'sh', m = x.score === 1 ? '○' : x.score === 0 ? '×' : '△';
        return '<div class="row"><span class="m ' + c + '">' + m + '</span><span class="n">' + esc(x.name) + '</span><span class="t">' + (x.timeout ? '時間切れ' : (x.ms / 1000).toFixed(1) + '秒') + '</span></div>';
      }).join('') + '</div>' +
      (slow && slow.ms >= r.time * 1000 * 0.7 ? '<p class="note">最も時間を使った場面:' + esc(slow.name) + '(' + (slow.ms / 1000).toFixed(1) + '秒)</p>' : '') +
      (misses.length ? '<h2>復習</h2>' + misses.map(function (x) {
        return '<div class="miss"><b>' + esc(x.name) + ':' + esc(x.q) + '</b>' + (x.picked ? '<div>あなた:' + esc(x.picked) + '</div>' : '') +
          '<div>正解:' + esc(x.correct) + '</div><div class="note" style="margin:4px 0 0">' + esc(x.why) + '</div></div>';
      }).join('') : '<div class="hint">全場面クリア。時間を短くして再挑戦してみましょう。</div>') +
      '<h2>メモ</h2><textarea id="note" class="input" rows="2" maxlength="200" placeholder="気づいたこと(実在の傷病者の情報は書かない)">' + esc(r.note || '') + '</textarea>' +
      '<button class="btn sec" data-act="save-note">メモを保存</button>' +
      '<button class="btn" data-act="again">もう一度</button>' +
      '<button class="btn sec" data-act="home">ホームへ</button>';
    window.scrollTo(0, 0);
  }

  // ---------- 操作 ----------
  var A = App.acts;
  A.time = function (el) { state.settings.time = +el.dataset.v; App.saveSettings(); App.render(); };
  A.mode = function (el) { state.settings.mode = el.dataset.v; App.saveSettings(); App.render(); };
  A.diff = function (el) { state.settings.diff = +el.dataset.v; App.saveSettings(); App.render(); };
  A.tag = function (el) { state.settings.tag = el.dataset.v; App.saveSettings(); App.render(); };
  A.start = function (el) { var c = App.findCase(el.dataset.id); if (c) startCase(c); };
  A.random = function () { var l = filtered(); if (l.length) startCase(l[Math.floor(Math.random() * l.length)]); };
  A.weak = function () { startWeak(); };
  A.go = function () { showStage(); };
  A.pick = function (el) { answer(+el.dataset.v); };
  A.reveal = function () { reveal(false); };
  A.rate = function (el) { rate(el.dataset.v); };
  A.next = function () { next(false); };
  A.again = function () {
    var r = state.run;
    var c = r.sc.id === 'weak' ? null : App.findCase(r.sc.id);
    if (c) startCase(c); else startWeak();
  };
  A.abort = function () { if (confirm('訓練を中止しますか?(この回は記録されません)')) { stopTimer(); App.go('home'); } };
  A.home = function () { stopTimer(); App.go('home'); };
  A['save-note'] = function () {
    var r = state.run;
    r.note = $('#note').value.slice(0, 200);
    var pii = SD.detectPII(r.note);
    if (pii.length && !confirm('個人情報かもしれない記述があります(' + pii.join('、') + ')。このまま保存しますか?')) return;
    App.mutate('saveSession', buildSession(r, r.sum));
    App.toast('メモを保存しました');
  };
  App.startCase = startCase;

  // 画面を離れていた間に制限時間を過ぎていたら、時間切れにする
  document.addEventListener('visibilitychange', function () {
    var r = state.run;
    if (document.visibilityState !== 'visible' || !r || r.state !== 'ask') return;
    if (performance.now() - r.t0 >= r.time * 1000) { if (r.mode === 'speak') reveal(true); else answer(-1); }
  });
  // キーボード操作(PC確認用): 1〜9で選択、Enterで次へ
  document.addEventListener('keydown', function (e) {
    var r = state.run;
    if (!r || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    if (r.state === 'ask' && r.mode === 'choice' && /^[1-9]$/.test(e.key)) {
      var i = +e.key - 1; if (r.cur && i < r.cur.opts.length) answer(i);
    } else if (r.state === 'fb' && r.mode === 'choice' && e.key === 'Enter') {
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
      next(false);
    }
  });
})();
