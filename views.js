/** 即時判断ドリル: 履歴・分析・症例(作成/編集/取込/書出)・設定・初回接続。 */
(function () {
  'use strict';
  var App = window.App, SD = window.SD, state = App.state, esc = App.esc, $ = App.$, $$ = App.$$, A = App.acts;
  var PII_NOTE = '実在の傷病者の個人情報(氏名・住所・電話番号・生年月日など)は入力しないでください。';

  function head(title) { return '<header class="top"><h1>' + title + '</h1>' + App.syncBadge() + '</header>'; }
  function seg(act, cur, items) {
    return '<div class="seg wrap">' + items.map(function (it) {
      return '<button data-act="' + act + '" data-v="' + esc(it[0]) + '" class="' + (String(cur) === String(it[0]) ? 'on' : '') + '">' + esc(it[1]) + '</button>';
    }).join('') + '</div>';
  }

  // =====================================================================
  // 履歴
  // =====================================================================
  var hist = { month: null, day: '' };
  App.views.history = function () {
    var ss = App.sessionsAsc(), today = new Date();
    if (!hist.month) hist.month = new Date(today.getFullYear(), today.getMonth(), 1);
    var y = hist.month.getFullYear(), m = hist.month.getMonth();
    var counts = {};
    ss.forEach(function (s) { var k = SD.dateKey(s.createdAt); counts[k] = (counts[k] || 0) + 1; });
    var first = new Date(y, m, 1), lead = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
    var cells = '';
    for (var i = 0; i < lead; i++) cells += '<i></i>';
    for (var d = 1; d <= days; d++) {
      var k = y + '-' + (m < 9 ? '0' : '') + (m + 1) + '-' + (d < 10 ? '0' : '') + d;
      cells += '<button class="day' + (counts[k] ? ' has' : '') + (k === SD.dateKey(today) ? ' today' : '') + (k === hist.day ? ' sel' : '') + '" data-act="cal-day" data-v="' + k + '">' + d + (counts[k] ? '<em>' + counts[k] + '</em>' : '') + '</button>';
    }
    var list = ss.slice().reverse().filter(function (s) { return !hist.day || SD.dateKey(s.createdAt) === hist.day; });
    return head('履歴') +
      '<div class="card"><div class="calhead"><button class="ghost" data-act="cal-prev" aria-label="前の月">‹</button><b>' + y + '年' + (m + 1) + '月</b><button class="ghost" data-act="cal-next" aria-label="次の月">›</button></div>' +
      '<div class="cal"><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span><span>日</span>' + cells + '</div>' +
      (hist.day ? '<button class="link" data-act="cal-clear">' + hist.day + ' の絞り込みを解除</button>' : '') + '</div>' +
      '<h2>' + (hist.day ? hist.day : 'すべて') + '(' + list.length + '回)</h2>' +
      (list.length ? '<div class="card">' + list.slice(0, 100).map(function (s) {
        return '<button class="row hrow" data-act="session" data-id="' + esc(s.id) + '"><span class="n">' + esc(s.caseTitle) + '<br><small>' + App.fmtDate(s.createdAt) + '・' + (s.mode === 'speak' ? '声出し' : '選択式') + '・' + s.timeLimit + '秒</small></span><span class="t">' + s.score + '/' + s.total + '・平均' + s.avgTime + '秒</span></button>';
      }).join('') + '</div>' : '<div class="empty">まだ記録がありません。ホームから訓練してみましょう。</div>');
  };
  A['cal-prev'] = function () { hist.month = new Date(hist.month.getFullYear(), hist.month.getMonth() - 1, 1); App.render(); };
  A['cal-next'] = function () { hist.month = new Date(hist.month.getFullYear(), hist.month.getMonth() + 1, 1); App.render(); };
  A['cal-day'] = function (el) { hist.day = hist.day === el.dataset.v ? '' : el.dataset.v; App.render(); };
  A['cal-clear'] = function () { hist.day = ''; App.render(); };
  A.session = function (el) {
    var s = state.data.sessions.filter(function (x) { return x.id === el.dataset.id; })[0];
    if (!s) return;
    App.openLayer('<div class="topbar"><button class="ghost" data-act="close-layer">‹ もどる</button></div>' +
      '<h1>' + esc(s.caseTitle) + '</h1><p class="sub">' + App.fmtDate(s.createdAt) + '・' + (s.mode === 'speak' ? '声出し' : '選択式') + '・' + s.timeLimit + '秒</p>' +
      '<div class="card"><div class="big">' + s.score + '<span> / ' + s.total + '</span></div><div class="sub" style="margin:6px 0 0">平均 ' + s.avgTime + '秒／場面</div></div>' +
      '<div class="card">' + (s.results || []).map(function (x) {
        var c = x.score === 1 ? 's1' : x.score === 0 ? 's0' : 'sh', mk = x.score === 1 ? '○' : x.score === 0 ? '×' : '△';
        return '<div class="row"><span class="m ' + c + '">' + mk + '</span><span class="n">' + esc(x.name) + '</span><span class="t">' + (x.timeout ? '時間切れ' : (x.ms / 1000).toFixed(1) + '秒') + '</span></div>';
      }).join('') + '</div>' +
      (s.note ? '<h2>メモ</h2><div class="card">' + esc(s.note) + '</div>' : '') +
      '<button class="btn danger" data-act="del-session" data-id="' + esc(s.id) + '">この記録を削除</button>');
  };
  A['del-session'] = function (el) {
    if (!confirm('この記録を削除しますか?')) return;
    App.closeLayer();
    App.mutate('deleteSession', { id: el.dataset.id });
  };

  // =====================================================================
  // 分析
  // =====================================================================
  function bars(list, max) {
    if (!list.length) return '<div class="empty">データがまだありません。</div>';
    return list.slice(0, max || 12).map(function (w) {
      var pct = Math.round(w.rate * 100);
      return '<div class="bar"><div class="bl"><span>' + esc(w.key) + '</span><small>' + w.n + '回・平均' + w.avg + '秒</small></div>' +
        '<div class="bt"><div class="bf ' + (pct < 60 ? 'low' : '') + '" style="width:' + pct + '%"></div><b>' + pct + '%</b></div></div>';
    }).join('');
  }
  function trend(ss) {
    var last = ss.slice(-20);
    if (last.length < 2) return '<div class="empty">2回以上の記録で表示されます。</div>';
    var w = 300, h = 90, pad = 6;
    var pct = last.map(function (s) { return s.total ? s.score / s.total * 100 : 0; });
    var avg = last.map(function (s) { return s.avgTime; });
    var maxAvg = Math.max.apply(null, avg.concat([1]));
    function pts(a, mx) { return a.map(function (v, i) { return (pad + i * (w - 2 * pad) / (a.length - 1)).toFixed(1) + ',' + (h - pad - v / mx * (h - 2 * pad)).toFixed(1); }).join(' '); }
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" class="trend" role="img" aria-label="直近の正答率と平均秒数の推移">' +
      '<polyline fill="none" stroke="var(--ok)" stroke-width="2.5" points="' + pts(pct, 100) + '"/>' +
      '<polyline fill="none" stroke="var(--bar)" stroke-width="2.5" stroke-dasharray="5 4" points="' + pts(avg, maxAvg) + '"/></svg>' +
      '<div class="legend"><span><i style="background:var(--ok)"></i>正答率</span><span><i style="background:var(--bar)"></i>平均秒数(最大' + maxAvg.toFixed(1) + '秒)</span></div>';
  }
  App.views.stats = function () {
    var ss = App.sessionsAsc(), today = new Date(), s = state.settings;
    var best = SD.best(ss), g = SD.goalProgress(ss, s.goals, today);
    var heat = SD.heatmap(ss, today, 18);
    var cols = '';
    for (var c = 0; c < 18; c++) {
      cols += '<div>' + heat.slice(c * 7, c * 7 + 7).map(function (x) {
        return '<i class="h' + Math.min(x.n, 4) + (x.future ? ' fut' : '') + '" title="' + x.date + ' ' + x.n + '回"></i>';
      }).join('') + '</div>';
    }
    var opt = function (arr, cur, fmt) { return arr.map(function (v) { return '<option value="' + v + '"' + (cur === v ? ' selected' : '') + '>' + fmt(v) + '</option>'; }).join(''); };
    return head('分析') +
      '<div class="card stat3">' +
        '<div><b>' + ss.length + '</b><small>訓練回数</small></div>' +
        '<div><b>' + (ss.length ? best.pct + '<span>%</span>' : '—') + '</b><small>最高正答率</small></div>' +
        '<div><b>' + (best.avg == null ? '—' : best.avg + '<span>秒</span>') + '</b><small>最速の平均</small></div>' +
      '</div>' +
      '<div class="card stat3"><div><b>' + SD.streak(ss, today) + '</b><small>連続日数</small></div><div><b>' + g.week + '<span>/' + (g.weekTarget || '—') + '</span></b><small>今週の回数' + (g.weekDone ? ' ✓' : '') + '</small></div><div><b>' + (g.avg == null ? '—' : g.avg) + '<span>秒</span></b><small>今週の平均' + (g.avgOk ? ' ✓' : '') + '</small></div></div>' +
      '<h2>目標</h2><div class="card goals">' +
        '<label>週の訓練回数<select data-goal="weekly"><option value="0">設定しない</option>' + opt([1, 2, 3, 4, 5, 6, 7, 10, 14], s.goals.weekly, function (v) { return '週' + v + '回'; }) + '</select></label>' +
        '<label>平均所要時間<select data-goal="avgSec"><option value="0">設定しない</option>' + opt([3, 4, 5, 6, 8, 10, 12, 15], s.goals.avgSec, function (v) { return v + '秒以内'; }) + '</select></label></div>' +
      '<h2>直近の推移</h2><div class="card">' + trend(ss) + '</div>' +
      '<h2>訓練した日(18週)</h2><div class="card"><div class="heat">' + cols + '</div></div>' +
      '<h2>場面ごとの弱点<small>(正答率が低い順)</small></h2><div class="card">' + bars(SD.weakness(ss, 'stage'), 12) + '</div>' +
      '<h2>カテゴリごとの弱点</h2><div class="card">' + bars(SD.weakness(ss, 'tag'), 12) + '</div>' +
      '<h2>書き出し</h2><div class="two"><button class="btn sec" data-act="export-csv">CSV</button><button class="btn sec" data-act="export-json">JSON</button></div>' +
      '<p class="note">自分の訓練記録を書き出します。CSVは場面ごとに1行です。</p>';
  };
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.goal) {
      state.settings.goals[t.dataset.goal] = +t.value;
      App.saveSettings(); App.render();
    }
  });
  A['export-csv'] = function () { App.download('sokuji-drill-history.csv', SD.toCsv(App.sessionsAsc()), 'text/csv;charset=utf-8'); };
  A['export-json'] = function () { App.download('sokuji-drill-history.json', JSON.stringify(App.sessionsAsc(), null, 2), 'application/json'); };

  // =====================================================================
  // 症例
  // =====================================================================
  var cf = { f: 'all' };
  function statusChip(c) { return '<span class="tag st-' + c.status + '">' + esc(SD.STATUS[c.status] || c.status) + '</span>'; }
  function canEdit(c) { return c.source !== 'sample' && (App.isAdmin() || (c.mine && c.status !== 'approved')); }
  function canDelete(c) { return c.source !== 'sample' && (App.isAdmin() || (c.mine && c.status !== 'approved')); }
  function exportShape(c) {
    var n = SD.normalizeCase(c); delete n.id; return n;
  }

  App.views.cases = function () {
    var all = App.allCases().filter(function (c) { return c.source !== 'sample'; });
    var pending = all.filter(function (c) { return c.status === 'review'; });
    var list = all.filter(function (c) {
      if (cf.f === 'mine') return c.mine;
      if (cf.f === 'all') return true;
      return c.status === cf.f;
    }).sort(function (a, b) { return (b.updatedAt || '') < (a.updatedAt || '') ? -1 : 1; });
    return head('症例') +
      '<div class="notice warn">' + PII_NOTE + '</div>' +
      '<div class="two"><button class="btn" data-act="case-new">＋ 新しい症例</button><button class="btn sec" data-act="case-import">JSON取込</button></div>' +
      (App.isAdmin() && pending.length ? '<div class="hint">承認待ちが <b>' + pending.length + '件</b> あります。<button class="linkbtn" data-act="cf" data-v="review">見る</button></div>' : '') +
      seg('cf', cf.f, [['all', 'すべて'], ['mine', '自分の'], ['draft', '下書き'], ['review', 'レビュー待ち'], ['approved', '承認済み']]) +
      '<h2>' + list.length + '本</h2>' +
      (list.length ? list.map(function (c) {
        return '<button class="sc" data-act="case-open" data-id="' + esc(c.id) + '"><span>' + statusChip(c) + (c.tag ? '<span class="tag">' + esc(c.tag) + '</span>' : '') + '<span class="tag d' + c.difficulty + '">' + esc(SD.DIFFICULTY[c.difficulty]) + '</span></span><b>' + esc(c.title) + '</b>' +
          '<small>' + c.stages.length + '場面・' + esc(c.authorName || '') + '・第' + (c.version || 1) + '版' + (c.reviewNote ? '・差し戻しあり' : '') + '</small></button>';
      }).join('') : '<div class="empty">症例がありません。「＋ 新しい症例」から作成するか、JSONを取り込みます。<br>同梱のサンプル3本はホームから訓練できます。</div>') +
      '<div class="two"><button class="btn sec" data-act="case-export"' + (list.length ? '' : ' disabled') + '>表示中をJSON書出</button><button class="btn sec" data-act="case-sample">サンプルを複製</button></div>' +
      '<p class="note">JSONは「options の先頭が正解」の形式です。プロトタイプの形式もそのまま取り込めます。</p>';
  };
  A.cf = function (el) { cf.f = el.dataset.v; App.render(); };

  // ---- 詳細 ----
  function openCase(id) {
    var c = App.findCase(id);
    if (!c) return;
    var n = SD.normalizeCase(c), hints = SD.reviewHints(n), pii = SD.casePII(n), admin = App.isAdmin();
    var btns = '';
    if (c.status === 'approved') btns += '<button class="btn" data-act="case-train" data-id="' + esc(c.id) + '">この症例で訓練</button>';
    else btns += '<button class="btn sec" data-act="case-train" data-id="' + esc(c.id) + '">試しに訓練(未承認)</button>';
    if (canEdit(c)) btns += '<button class="btn sec" data-act="case-edit" data-id="' + esc(c.id) + '">編集</button>';
    if ((c.mine || admin) && c.status === 'draft' && c.source !== 'sample') btns += '<button class="btn" data-act="case-submit" data-id="' + esc(c.id) + '">レビューに出す</button>';
    if (admin && c.status === 'review') btns += '<div class="two"><button class="btn good" data-act="case-approve" data-id="' + esc(c.id) + '">承認して公開</button><button class="btn sec" data-act="case-reject" data-id="' + esc(c.id) + '">差し戻し</button></div>';
    if (admin && c.status === 'approved' && c.source !== 'sample') btns += '<button class="btn sec" data-act="case-unpublish" data-id="' + esc(c.id) + '">公開を取り下げ</button>';
    btns += '<button class="btn sec" data-act="case-dup" data-id="' + esc(c.id) + '">複製して派生症例を作る</button>';
    btns += '<button class="btn sec" data-act="case-export-one" data-id="' + esc(c.id) + '">この症例のJSON</button>';
    if (canDelete(c)) btns += '<button class="btn danger" data-act="case-delete" data-id="' + esc(c.id) + '">削除</button>';
    App.openLayer('<div class="topbar"><button class="ghost" data-act="close-layer">‹ もどる</button></div>' +
      '<div>' + statusChip(c) + (c.tag ? '<span class="tag">' + esc(c.tag) + '</span>' : '') + '<span class="tag d' + c.difficulty + '">' + esc(SD.DIFFICULTY[c.difficulty]) + '</span></div>' +
      '<h1>' + esc(c.title) + '</h1>' +
      '<p class="sub">' + esc([c.age, c.sex, c.chief_complaint].filter(Boolean).join('・')) + (c.protocol_refs && c.protocol_refs.length ? '<br>プロトコール項番: ' + esc(c.protocol_refs.join(', ')) : '') + '<br>作成: ' + esc(c.authorName || '—') + '・第' + (c.version || 1) + '版</p>' +
      (c.reviewNote && c.status === 'draft' ? '<div class="hint ng">差し戻しコメント: ' + esc(c.reviewNote) + '</div>' : '') +
      (c.needs_review ? '<div class="hint">要確認: ' + esc(c.review_note || 'プロトコールとの照合が必要です') + '</div>' : '') +
      (pii.length ? '<div class="hint ng">個人情報かもしれない記述があります: ' + esc(pii.join('、')) + '</div>' : '') +
      (hints.length ? '<details class="hints"><summary>見直しの目安(' + hints.length + '件)</summary>' + hints.map(function (h) { return '<div>' + esc(h) + '</div>'; }).join('') + '</details>' : '') +
      '<div class="actions">' + btns + '</div>' +
      '<h2>場面</h2>' + n.stages.map(function (g, i) {
        return '<details class="stg"><summary>' + (i + 1) + '. ' + esc(g.name) + '</summary>' +
          '<div class="pre">' + esc(g.info) + '</div><div class="q">' + esc(g.q) + '</div>' +
          g.options.map(function (o, k) { return '<div class="opt-prev ' + (k === 0 ? 'ok' : '') + '">' + (k === 0 ? '正解 ' : '誤答 ') + esc(o) + '</div>'; }).join('') +
          (g.why ? '<div class="why">' + esc(g.why) + '</div>' : '') +
          '<div class="note">根拠: ' + esc(g.protocol_ref || '(未設定)') + (g.common_mistake ? '／誤答が示すミス: ' + esc(g.common_mistake) : '') + '</div></details>';
      }).join(''), 'detail');
  }
  A['case-open'] = function (el) { openCase(el.dataset.id); };
  A['close-layer'] = function () { ed = null; App.closeLayer(); };
  A['case-train'] = function (el) { var c = App.findCase(el.dataset.id); if (c) { App.closeLayer(); state.tab = 'home'; App.startCase(c); } };
  A['case-submit'] = function (el) {
    var c = App.findCase(el.dataset.id), n = SD.normalizeCase(c);
    var pii = SD.casePII(n), hints = SD.reviewHints(n);
    if (pii.length && !confirm('個人情報かもしれない記述があります(' + pii.join('、') + ')。確認してから出してください。このまま出しますか?')) return;
    if (hints.length && !confirm('見直しの目安が' + hints.length + '件あります:\n・' + hints.slice(0, 5).join('\n・') + '\nこのままレビューに出しますか?')) return;
    App.closeLayer();
    App.mutate('saveCase', { case: caseForSave(c), submit: true });
    App.toast('レビューに出しました');
  };
  A['case-approve'] = function (el) {
    if (!confirm('この症例を承認して公開します。プロトコールとの照合は済んでいますか?')) return;
    App.closeLayer(); App.mutate('reviewCase', { id: el.dataset.id, decision: 'approve' }); App.toast('承認しました');
  };
  A['case-reject'] = function (el) {
    var note = prompt('差し戻しのコメント(必須・500文字まで)');
    if (note == null) return;
    note = note.trim();
    if (!note) { App.toast('コメントを入力してください', true); return; }
    App.closeLayer(); App.mutate('reviewCase', { id: el.dataset.id, decision: 'reject', note: note.slice(0, 500) }); App.toast('差し戻しました');
  };
  A['case-unpublish'] = function (el) {
    var note = prompt('取り下げの理由(任意)') || '';
    App.closeLayer(); App.mutate('reviewCase', { id: el.dataset.id, decision: 'unpublish', note: note.slice(0, 500) }); App.toast('取り下げました');
  };
  A['case-delete'] = function (el) {
    var c = App.findCase(el.dataset.id);
    if (!confirm('「' + c.title + '」を削除しますか?(元に戻せません)')) return;
    App.closeLayer(); App.mutate('deleteCase', { id: el.dataset.id });
  };
  A['case-dup'] = function (el) {
    var c = App.findCase(el.dataset.id), n = SD.normalizeCase(c);
    n.id = SD.newId('c'); n.title = (n.title + '(コピー)').slice(0, SD.LIMITS.title);
    n.needs_review = true; n.review_note = '複製した症例。内容とプロトコール根拠を確認してください';
    openEditor(n, true);
  };
  A['case-export-one'] = function (el) { showJson([exportShape(App.findCase(el.dataset.id))], 'この症例のJSON'); };
  A['case-export'] = function () {
    var list = App.allCases().filter(function (c) { return c.source !== 'sample' && (cf.f === 'all' || (cf.f === 'mine' ? c.mine : c.status === cf.f)); });
    showJson(list.map(exportShape), '症例のJSON(' + list.length + '本)');
  };
  A['case-sample'] = function () {
    var list = (window.SD_SAMPLES || []).map(function (c) { var n = SD.normalizeCase(c); delete n.id; return n; });
    showJson(list, 'サンプル3本のJSON(コピーして「JSON取込」で自分の症例にできます)');
  };
  function showJson(arr, title) {
    var text = JSON.stringify(arr, null, 2);
    App.openLayer('<div class="topbar"><button class="ghost" data-act="close-layer">‹ もどる</button></div><h1>' + esc(title) + '</h1>' +
      '<textarea id="jsonout" class="mono" readonly spellcheck="false">' + esc(text) + '</textarea>' +
      '<div class="two"><button class="btn" data-act="json-copy">コピー</button><button class="btn sec" data-act="json-download">ファイルに保存</button></div><div class="msg" id="msg"></div>');
  }
  A['json-copy'] = function () {
    var ta = $('#jsonout');
    App.copyText(ta.value).then(function (ok) { msg(ok ? 'コピーしました。' : 'コピーできませんでした。全選択して手動でコピーしてください。', ok ? 'good' : 'err'); });
  };
  A['json-download'] = function () { App.download('sokuji-drill-cases.json', $('#jsonout').value, 'application/json'); };
  function msg(t, cls) { var m = $('#msg'); if (m) { m.textContent = t; m.className = 'msg ' + (cls || ''); } }

  // ---- 取り込み ----
  function template() {
    return JSON.stringify([{
      title: '例:小児の熱性けいれん', tag: '小児', difficulty: 1, age: '1歳', sex: '男児', chief_complaint: 'けいれん', protocol_refs: ['項番'],
      stages: SD.STAGE_NAMES.map(function (n) { return { name: n, info: 'この場面の状況(バイタルなど)', q: 'この場面での判断は?', options: ['正解の選択肢(先頭が正解)', '誤りの選択肢1', '誤りの選択肢2'], why: '解説(根拠を含む)', protocol_ref: '項番', common_mistake: '誤答が示す現場のありがちなミス' }; })
    }], null, 2);
  }
  A['case-import'] = function () {
    App.openLayer('<div class="topbar"><button class="ghost" data-act="close-layer">‹ もどる</button></div><h1>JSON取込</h1>' +
      '<div class="notice warn">' + PII_NOTE + '</div>' +
      '<p class="note">配列 [ … ] で貼り付けます。<b>options の先頭が正解</b>です(表示時に自動でシャッフル)。取り込んだ症例は「下書き」になります。</p>' +
      '<textarea id="jsonin" class="mono" spellcheck="false" placeholder="[ { &quot;title&quot;: …, &quot;stages&quot;: [ … ] } ]"></textarea>' +
      (App.isAdmin() ? '<label class="check"><input type="checkbox" id="asApproved"> 承認済みとして取り込む(承認者のみ・初期データ用)</label>' : '') +
      '<div class="msg" id="msg"></div>' +
      '<div class="two"><button class="btn" data-act="import-do">取り込む</button><button class="btn sec" data-act="import-tpl">雛形を入れる</button></div>');
  };
  A['import-tpl'] = function () { $('#jsonin').value = template(); msg('雛形を入れました。書き換えてから取り込んでください。'); };
  A['import-do'] = function () {
    var data;
    try { data = JSON.parse($('#jsonin').value); } catch (err) { msg('JSONの書式エラー:' + err.message, 'err'); return; }
    if (data && !Array.isArray(data) && typeof data === 'object' && data.title) data = [data];
    var er = SD.validateCases(data);
    if (er) { msg(er, 'err'); return; }
    if (!data.length) { msg('症例が入っていません', 'err'); return; }
    var norm = data.map(function (c) { var n = SD.normalizeCase(c); n.id = SD.newId('c'); return n; });
    var pii = []; norm.forEach(function (n) { SD.casePII(n).forEach(function (p) { if (pii.indexOf(p) < 0) pii.push(p); }); });
    if (pii.length && !confirm('個人情報かもしれない記述があります(' + pii.join('、') + ')。取り込みますか?')) return;
    var approved = !!($('#asApproved') && $('#asApproved').checked);
    for (var i = 0; i < norm.length; i += 30) App.mutate('importCases', { cases: norm.slice(i, i + 30), approved: approved });
    App.closeLayer();
    cf.f = 'all';
    App.toast(norm.length + '本を取り込みました' + (approved ? '(承認済み)' : '(下書き)'));
  };

  // ---- 作成・編集 ----
  var ed = null; // {c, isNew, open:{}}
  function blankCase() {
    return {
      id: SD.newId('c'), title: '', tag: '', difficulty: 1, age: '', sex: '', chief_complaint: '', protocol_refs: [], needs_review: false, review_note: '',
      stages: SD.STAGE_NAMES.map(function (n) { return { name: n, info: '', q: '', options: ['', '', ''], why: '', protocol_ref: null, common_mistake: '' }; })
    };
  }
  function caseForSave(c) {
    var n = SD.normalizeCase(c);
    n.id = c.id;
    return n;
  }
  function openEditor(c, isNew) {
    ed = { c: JSON.parse(JSON.stringify(SD.normalizeCase(c))), isNew: isNew, open: {} };
    ed.c.id = c.id;
    renderEditor();
  }
  function tagList() {
    var seen = {};
    App.allCases().forEach(function (c) { if (c.tag) seen[c.tag] = 1; });
    return Object.keys(seen);
  }
  function renderEditor() {
    var layer = $('#layer'), y = layer.scrollTop, c = ed.c;
    App.openLayer('<div class="topbar"><button class="ghost" data-act="ed-cancel">× 閉じる</button><b>' + (ed.isNew ? '症例を作る' : '症例を編集') + '</b></div>' +
      '<div class="notice warn">' + PII_NOTE + '<br>医療内容は、所属のMCプロトコールの記載だけを根拠にしてください。</div>' +
      '<div class="card form">' +
        field('タイトル', '<input class="input" data-f="title" maxlength="80" value="' + esc(c.title) + '" placeholder="例:胸痛(70代男性)">') +
        field('カテゴリ', '<input class="input" data-f="tag" maxlength="20" list="taglist" value="' + esc(c.tag) + '" placeholder="例:循環器"><datalist id="taglist">' + tagList().map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist>') +
        '<div class="lbl">難易度</div><div class="seg">' + [1, 2, 3].map(function (d) { return '<button data-act="ed-diff" data-v="' + d + '" class="' + (c.difficulty === d ? 'on' : '') + '">' + d + ' ' + SD.DIFFICULTY[d] + '</button>'; }).join('') + '</div>' +
        '<div class="grid3">' + field('年代', '<input class="input" data-f="age" maxlength="20" value="' + esc(c.age) + '" placeholder="70代">') + field('性別', '<input class="input" data-f="sex" maxlength="10" value="' + esc(c.sex) + '" placeholder="男性">') + field('主訴', '<input class="input" data-f="chief_complaint" maxlength="60" value="' + esc(c.chief_complaint) + '" placeholder="胸痛">') + '</div>' +
        field('対応するプロトコール項番(カンマ区切り)', '<input class="input" data-f="protocol_refs" value="' + esc(c.protocol_refs.join(', ')) + '" placeholder="例:3-A, 4-B">') +
      '</div>' +
      '<h2>場面(' + c.stages.length + ')</h2>' +
      c.stages.map(function (g, i) { return stageCard(g, i, c.stages.length); }).join('') +
      '<button class="btn sec" data-act="ed-add-stage"' + (c.stages.length >= SD.LIMITS.stages ? ' disabled' : '') + '>＋ 場面を追加</button>' +
      '<div class="msg" id="msg"></div>' +
      '<div class="two sticky"><button class="btn sec" data-act="ed-save">下書き保存</button><button class="btn" data-act="ed-submit">レビューに出す</button></div>');
    $('#layer').scrollTop = y;
  }
  function field(label, input) { return '<label class="field"><span>' + label + '</span>' + input + '</label>'; }
  function stageCard(g, i, n) {
    return '<details class="stg edit" data-s="' + i + '"' + (ed.open[i] ? ' open' : '') + '><summary>' + (i + 1) + '. ' + esc(g.name || '(場面名)') + '</summary>' +
      field('場面名', '<input class="input" data-s="' + i + '" data-f="name" maxlength="40" list="stagelist" value="' + esc(g.name) + '"><datalist id="stagelist">' + SD.STAGE_NAMES.map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist>') +
      field('状況(2〜5行)', '<textarea class="input" data-s="' + i + '" data-f="info" rows="4" maxlength="600">' + esc(g.info) + '</textarea>') +
      field('質問(数秒で答えられる1行)', '<input class="input" data-s="' + i + '" data-f="q" maxlength="120" value="' + esc(g.q) + '" placeholder="例:最初の一手は?">') +
      '<div class="lbl">選択肢(1つ目が正解・表示時にシャッフル)</div>' +
      g.options.map(function (o, k) {
        return '<div class="optrow"><span class="ok-mark ' + (k === 0 ? 'ok' : '') + '">' + (k === 0 ? '正解' : '誤答' + k) + '</span><textarea class="input" data-s="' + i + '" data-o="' + k + '" rows="2" maxlength="300">' + esc(o) + '</textarea>' +
          (g.options.length > 2 && k > 0 ? '<button class="ghost x" data-act="ed-del-opt" data-s="' + i + '" data-o="' + k + '" aria-label="この選択肢を削除">×</button>' : '') + '</div>';
      }).join('') +
      (g.options.length < SD.LIMITS.options ? '<button class="btn sec sm" data-act="ed-add-opt" data-s="' + i + '">＋ 誤答を追加</button>' : '') +
      field('解説(2文以内・根拠を含む)', '<textarea class="input" data-s="' + i + '" data-f="why" rows="3" maxlength="500">' + esc(g.why) + '</textarea>') +
      field('プロトコール根拠(項番)', '<input class="input" data-s="' + i + '" data-f="protocol_ref" maxlength="60" value="' + esc(g.protocol_ref || '') + '" placeholder="なければ空欄(要確認として扱われます)">') +
      field('誤答が示す現場のありがちなミス', '<input class="input" data-s="' + i + '" data-f="common_mistake" maxlength="300" value="' + esc(g.common_mistake) + '" placeholder="例:確認漏れ、順番の誤り">') +
      '<div class="two"><button class="btn sec sm" data-act="ed-up" data-s="' + i + '"' + (i === 0 ? ' disabled' : '') + '>↑ 上へ</button><button class="btn sec sm" data-act="ed-down" data-s="' + i + '"' + (i === n - 1 ? ' disabled' : '') + '>↓ 下へ</button><button class="btn danger sm" data-act="ed-del-stage" data-s="' + i + '"' + (n <= 1 ? ' disabled' : '') + '>削除</button></div></details>';
  }
  // 入力はその場でモデルに反映する(画面は作り直さない)
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!ed || !t.dataset) return;
    var f = t.dataset.f, s = t.dataset.s, o = t.dataset.o;
    if (s != null && o != null) { ed.c.stages[+s].options[+o] = t.value; return; }
    if (s != null && f) { ed.c.stages[+s][f] = f === 'protocol_ref' ? (t.value || null) : t.value; if (f === 'name') { var sm = t.closest('details'); if (sm) sm.querySelector('summary').textContent = (+s + 1) + '. ' + (t.value || '(場面名)'); } return; }
    if (f === 'protocol_refs') ed.c.protocol_refs = t.value.split(/[,、]/).map(function (x) { return x.trim(); }).filter(Boolean);
    else if (f) ed.c[f] = t.value;
  });
  document.addEventListener('toggle', function (e) {
    if (ed && e.target.matches && e.target.matches('details.stg.edit')) ed.open[e.target.dataset.s] = e.target.open;
  }, true);

  A['case-new'] = function () { openEditor(blankCase(), true); };
  A['case-edit'] = function (el) { openEditor(App.findCase(el.dataset.id), false); };
  A['ed-cancel'] = function () { if (confirm('編集を閉じますか?(保存していない内容は失われます)')) { ed = null; App.closeLayer(); } };
  A['ed-diff'] = function (el) { ed.c.difficulty = +el.dataset.v; renderEditor(); };
  A['ed-add-stage'] = function () { ed.c.stages.push({ name: '', info: '', q: '', options: ['', '', ''], why: '', protocol_ref: null, common_mistake: '' }); ed.open[ed.c.stages.length - 1] = true; renderEditor(); };
  A['ed-del-stage'] = function (el) { if (confirm('この場面を削除しますか?')) { ed.c.stages.splice(+el.dataset.s, 1); ed.open = {}; renderEditor(); } };
  A['ed-up'] = function (el) { var i = +el.dataset.s, a = ed.c.stages; if (i > 0) { var t = a[i]; a[i] = a[i - 1]; a[i - 1] = t; ed.open = {}; ed.open[i - 1] = true; renderEditor(); } };
  A['ed-down'] = function (el) { var i = +el.dataset.s, a = ed.c.stages; if (i < a.length - 1) { var t = a[i]; a[i] = a[i + 1]; a[i + 1] = t; ed.open = {}; ed.open[i + 1] = true; renderEditor(); } };
  A['ed-add-opt'] = function (el) { var i = +el.dataset.s; ed.c.stages[i].options.push(''); ed.open[i] = true; renderEditor(); };
  A['ed-del-opt'] = function (el) { var i = +el.dataset.s; ed.c.stages[i].options.splice(+el.dataset.o, 1); ed.open[i] = true; renderEditor(); };
  function saveEditor(submit) {
    var c = ed.c, raw = JSON.parse(JSON.stringify(c));
    // 空の誤答欄は取り除く(正解欄が空ならエラーにする)
    raw.stages.forEach(function (g) { g.options = g.options.filter(function (o, k) { return k === 0 || String(o).trim(); }); });
    var er = SD.validateCase(raw, '症例');
    if (er) { msg(er, 'err'); App.toast(er, true); return; }
    var n = SD.normalizeCase(raw); n.id = c.id;
    var pii = SD.casePII(n);
    if (pii.length && !confirm('個人情報かもしれない記述があります(' + pii.join('、') + ')。このまま保存しますか?')) return;
    if (submit) {
      var hints = SD.reviewHints(n);
      if (hints.length && !confirm('見直しの目安が' + hints.length + '件あります:\n・' + hints.slice(0, 5).join('\n・') + '\nこのままレビューに出しますか?')) return;
    }
    ed = null;
    App.closeLayer();
    App.mutate('saveCase', { case: n, submit: !!submit });
    cf.f = 'all';
    App.toast(submit ? 'レビューに出しました' : '下書きを保存しました');
  }
  A['ed-save'] = function () { saveEditor(false); };
  A['ed-submit'] = function () { saveEditor(true); };

  // =====================================================================
  // 設定
  // =====================================================================
  App.views.settings = function () {
    var demo = App.isDemo(), me = state.data.me || {};
    return head('設定') +
      '<h2>利用者</h2><div class="card form">' +
        field('ニックネーム(症例の作成者として表示されます)', '<input class="input" id="nick" maxlength="20" value="' + esc(state.me ? state.me.nick : '') + '">') +
        '<button class="btn sec" data-act="nick-save">変更を保存</button>' +
        '<p class="note">接続: ' + (demo ? 'デモ(この端末の中だけ)' : '共有データに接続中') + '。承認者: ' + (App.isAdmin() ? '<b>はい</b>' : 'いいえ') + '</p>' +
      '</div>' +
      '<h2>承認者の合言葉</h2><div class="card form">' +
        '<p class="note">症例の承認・差し戻し・他人の症例の削除をする人だけが入力します。合言葉はこの端末にだけ保存されます。</p>' +
        (demo ? '<p class="note">デモでは、すべての承認操作を試せます。</p>' : '<input class="input" id="adminkey" type="password" autocomplete="off" placeholder="' + (state.admin ? '設定済み(変更するときだけ入力)' : '合言葉') + '">' +
        '<div class="two"><button class="btn sec" data-act="admin-save">設定する</button><button class="btn sec" data-act="admin-clear"' + (state.admin ? '' : ' disabled') + '>解除</button></div>') +
      '</div>' +
      '<h2>同期・端末の引き継ぎ</h2><div class="card form">' +
        (demo ? '<p class="note">デモのデータはこの端末の中だけに保存されます。</p>' : '<button class="btn sec" data-act="sync-now">今すぐ同期(未送信 ' + state.outbox.length + '件)</button>' +
        '<button class="btn sec" data-act="transfer">引き継ぎコードを表示</button>' +
        '<p class="note">機種変更のとき、新しい端末の初回画面に引き継ぎコードを貼ると、履歴ごと移せます。他の人には渡さないでください(あなたの履歴が見られます)。</p>') +
      '</div>' +
      '<h2>データ</h2><div class="card form"><div class="two"><button class="btn sec" data-act="export-csv">履歴CSV</button><button class="btn sec" data-act="export-json">履歴JSON</button></div>' +
        '<button class="btn danger" data-act="disconnect">' + (demo ? 'デモを終了' : '接続を解除(この端末のデータを消す)') + '</button></div>' +
      '<h2>このアプリについて</h2><div class="card note-card">' +
        '<p>訓練用のアプリです。実際の活動は、所属のMCプロトコールに従ってください。</p>' +
        '<p>症例の医療内容は、人の目で確認してから承認します。AIが作った症例も同じです。</p>' +
        '<p>' + PII_NOTE + '入力した内容は、接続コードを知る人が見られる共有データに保存されます。</p>' +
        '<p>オフラインでは、同期済みの承認済み症例と、同梱のサンプルで訓練できます。プロトコール本文は端末に保存しません。</p>' +
        '<p class="note">版: ' + (window.SD_VERSION || '') + '</p></div>';
  };
  A['nick-save'] = function () {
    var v = $('#nick').value.trim();
    if (!v || v.length > 20) { App.toast('ニックネームは1〜20文字で入力してください', true); return; }
    state.me.nick = v;
    App.save(App.LS.me, state.me);
    if (App.isDemo()) { App.toast('保存しました'); return; }
    App.register().then(function () { App.toast('保存しました'); return App.flush(); }, function (e) { App.toast(e.message, true); });
  };
  A['admin-save'] = function () {
    var v = $('#adminkey').value.trim();
    if (!v) { App.toast('合言葉を入力してください', true); return; }
    state.admin = v; App.save(App.LS.admin, v);
    App.flush().then(function () {
      var ok = !!(state.data.me && state.data.me.admin);
      App.toast(ok ? '承認者として認識されました' : '合言葉が違うようです', !ok);
      if (!ok) { state.admin = ''; App.save(App.LS.admin, ''); }
      App.render();
    });
  };
  A['admin-clear'] = function () {
    state.admin = ''; App.save(App.LS.admin, '');
    App.flush().then(function () { App.render(); App.toast('解除しました'); });
  };
  A['sync-now'] = function () { App.flush().then(function () { if (state.sync === 'off') App.toast('つながりませんでした。あとで自動で送ります', true); else App.toast('同期しました'); }); };
  A.transfer = function () {
    var code = SD.encodeCode({ u: state.conn.u, k: state.conn.k, uid: state.me.uid, tok: state.me.tok, nick: state.me.nick });
    App.openLayer('<div class="topbar"><button class="ghost" data-act="close-layer">‹ もどる</button></div><h1>引き継ぎコード</h1>' +
      '<div class="notice warn">他の人に見せないでください。このコードで、あなたの履歴を読み書きできます。</div>' +
      '<textarea id="jsonout" class="mono" readonly rows="6">' + esc(code) + '</textarea>' +
      '<button class="btn" data-act="json-copy">コピー</button><div class="msg" id="msg"></div>');
  };
  A.disconnect = function () {
    var pending = state.outbox.length;
    if (!confirm((App.isDemo() ? 'デモのデータを消して終了しますか?' : '接続を解除し、この端末のデータを消します。' + (pending ? '\n未送信の操作が' + pending + '件あります(失われます)。' : '') + '\n引き継ぎコードを控えていないと、この履歴は戻せません。続けますか?'))) return;
    ['conn', 'me', 'admin', 'data', 'outbox', 'demo'].forEach(function (k) { App.save(App.LS[k], null); });
    state.conn = null; state.me = null; state.admin = ''; state.outbox = []; state.data = App.normalize(null);
    App.go('home');
  };

  // =====================================================================
  // 初回接続
  // =====================================================================
  function randToken() {
    var a = new Uint8Array(16); (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  App.views.connect = function () {
    return '<h1 style="margin-top:12px">即時判断ドリル</h1>' +
      '<p class="sub">指令から引き継ぎまで、場面ごとに数秒で判断する練習アプリです。</p>' +
      '<div class="card form">' +
        '<p class="note"><b>はじめて使うとき</b></p><ol class="steps"><li>管理する人が Apps Script の <code>/exec</code> を開く</li><li>表示されるスプレッドシートの「設定」シート B2 の<b>接続コード</b>をコピー(仲間にも同じものを渡す)</li><li>下に貼り付けて、ニックネームを入れて接続</li></ol>' +
        '<label class="field"><span>接続コード(または引き継ぎコード)</span><textarea class="input mono" id="connCode" rows="3" placeholder="eyJ1Ijoi…" autocapitalize="off" autocorrect="off" spellcheck="false"></textarea></label>' +
        '<label class="field"><span>ニックネーム(引き継ぎコードのときは空欄でも可)</span><input class="input" id="connNick" maxlength="20" placeholder="例:ニシコリ"></label>' +
        '<button class="btn" data-act="connect">接続</button>' +
        '<div class="msg" id="msg"></div></div>' +
      '<button class="link" data-act="demo">接続せずデモで試す(この端末の中だけ)</button>' +
      '<p class="note" style="text-align:center">' + PII_NOTE + '</p>';
  };
  A.connect = function (el) {
    var conn;
    try { conn = SD.decodeCode($('#connCode').value); } catch (e) { msg('接続コードの形式が正しくありません', 'err'); return; }
    var nick = $('#connNick').value.trim() || conn.nick || '';
    if (!nick) { msg('ニックネームを入れてください', 'err'); return; }
    if (nick.length > 20) { msg('ニックネームは20文字以内にしてください', 'err'); return; }
    var prev = { conn: state.conn, me: state.me };
    state.conn = { u: conn.u, k: conn.k };
    state.me = conn.uid ? { uid: conn.uid, tok: conn.tok, nick: nick } : { uid: SD.newId('u'), tok: randToken(), nick: nick };
    el.disabled = true; el.textContent = '接続中…';
    App.register().then(function () { return App.api('getData'); }).then(function (data) {
      App.save(App.LS.conn, state.conn); App.save(App.LS.me, state.me);
      state.data = App.normalize(data); state.outbox = []; App.save(App.LS.outbox, []);
      App.persist();
      state.tab = 'home';
      App.render();
      App.toast('接続しました');
    }, function (e) {
      state.conn = prev.conn; state.me = prev.me;
      el.disabled = false; el.textContent = '接続';
      msg(e.auth ? '接続コードが違います' : '接続できませんでした(' + e.message + ')', 'err');
    });
  };
  A.demo = function () {
    state.conn = { demo: true };
    state.me = { uid: 'demo_user_0000', tok: 'demo', nick: 'デモ' };
    App.save(App.LS.conn, state.conn); App.save(App.LS.me, state.me);
    state.data = App.normalize(App.load(App.LS.demo, null) || { me: { uid: state.me.uid, nickname: 'デモ', admin: true }, cases: [], sessions: [] });
    state.data.me = { uid: state.me.uid, nickname: 'デモ', admin: true };
    App.persist();
    state.tab = 'home';
    App.render();
  };
})();
