/**
 * 即時判断ドリル: 画面に依存しない判定ロジック(採点・検証・集計)。
 * ブラウザでは window.SD、Node(テスト)では require() で使える。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SD = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STAGE_NAMES = ['指令内容', '現場の状況', '接触時の状況', '初期評価', '状態の変化・バイタル・病院連絡', '活動方針', '現場出発タイミング', '車内活動', '引き継ぎ内容'];
  var TIME_CHOICES = [5, 10, 15, 20];
  var DIFFICULTY = { 1: '基本', 2: '応用', 3: '変化球' };
  var LIMITS = { title: 80, tag: 20, info: 600, q: 120, option: 300, why: 500, ref: 60, stages: 20, options: 6 };

  // ---------- 汎用 ----------
  function shuffle(a, rnd) {
    rnd = rnd || Math.random;
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  /** ISO文字列/Date を端末のローカル日付 yyyy-mm-dd にする。 */
  function dateKey(d) {
    d = d instanceof Date ? d : new Date(d);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); return x; }
  function newId(prefix) {
    var s = '';
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (var i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return (prefix || 'x') + '_' + Date.now().toString(36) + s;
  }

  // ---------- 症例の検証・正規化 ----------
  /**
   * 症例JSON(配列)を検証する。問題があれば日本語のメッセージ、なければ null。
   * 形式: [{title, tag, difficulty?, stages:[{name?, info?, q, options:[正解, 誤答…], why?, protocol_ref?, common_mistake?}]}]
   * options の先頭が正解。
   */
  function validateCases(a) {
    if (!Array.isArray(a)) return '配列 [ ... ] で書いてください';
    for (var i = 0; i < a.length; i++) {
      var err = validateCase(a[i], '症例' + (i + 1));
      if (err) return err;
    }
    return null;
  }

  function validateCase(s, label) {
    var p = label || '症例';
    if (!s || typeof s !== 'object') return p + ': オブジェクトではありません';
    if (typeof s.title !== 'string' || !s.title.trim()) return p + ': title がありません';
    if (s.title.length > LIMITS.title) return p + ': title は' + LIMITS.title + '文字以内にしてください';
    if (s.tag != null && (typeof s.tag !== 'string' || s.tag.length > LIMITS.tag)) return p + ': tag は' + LIMITS.tag + '文字以内の文字列にしてください';
    if (s.difficulty != null && [1, 2, 3].indexOf(Number(s.difficulty)) < 0) return p + ': difficulty は 1〜3 にしてください';
    if (!Array.isArray(s.stages) || !s.stages.length) return p + ': stages がありません';
    if (s.stages.length > LIMITS.stages) return p + ': 場面は' + LIMITS.stages + '個までです';
    if (s.protocol_refs != null && !Array.isArray(s.protocol_refs)) return p + ': protocol_refs は配列にしてください';
    for (var j = 0; j < s.stages.length; j++) {
      var g = s.stages[j];
      var q = p + 'の場面' + (j + 1);
      if (!g || typeof g !== 'object') return q + ': オブジェクトではありません';
      if (typeof g.q !== 'string' || !g.q.trim()) return q + ': q(質問)がありません';
      if (g.q.length > LIMITS.q) return q + ': q は' + LIMITS.q + '文字以内にしてください';
      if (g.info != null && (typeof g.info !== 'string' || g.info.length > LIMITS.info)) return q + ': info は' + LIMITS.info + '文字以内の文字列にしてください';
      if (g.why != null && (typeof g.why !== 'string' || g.why.length > LIMITS.why)) return q + ': why は' + LIMITS.why + '文字以内の文字列にしてください';
      if (!Array.isArray(g.options) || g.options.length < 2 || g.options.length > LIMITS.options) return q + ': options は2〜' + LIMITS.options + '個の文字列で書いてください(先頭が正解)';
      for (var k = 0; k < g.options.length; k++) {
        var o = g.options[k];
        if (typeof o !== 'string' || !o.trim()) return q + ': options に空の選択肢があります';
        if (o.length > LIMITS.option) return q + ': 選択肢は' + LIMITS.option + '文字以内にしてください';
      }
      var seen = {};
      for (var m = 0; m < g.options.length; m++) {
        var key = g.options[m].trim();
        if (seen[key]) return q + ': 同じ内容の選択肢があります';
        seen[key] = 1;
      }
      if (g.protocol_ref != null && (typeof g.protocol_ref !== 'string' || g.protocol_ref.length > LIMITS.ref)) return q + ': protocol_ref は文字列または null にしてください';
    }
    return null;
  }

  /** 検証済みの症例を、保存・表示用の形にそろえる。 */
  function normalizeCase(c) {
    return {
      id: c.id || '',
      title: String(c.title).trim(),
      tag: String(c.tag || '').trim(),
      difficulty: [1, 2, 3].indexOf(Number(c.difficulty)) >= 0 ? Number(c.difficulty) : 1,
      age: String(c.age || '').trim(),
      sex: String(c.sex || '').trim(),
      chief_complaint: String(c.chief_complaint || '').trim(),
      protocol_refs: (Array.isArray(c.protocol_refs) ? c.protocol_refs : []).map(String).filter(Boolean),
      needs_review: !!c.needs_review,
      review_note: String(c.review_note || ''),
      stages: c.stages.map(function (g, i) {
        var o = {
          name: String(g.name || STAGE_NAMES[i] || '場面' + (i + 1)).trim(),
          info: String(g.info || ''),
          q: String(g.q).trim(),
          options: g.options.map(function (t) { return String(t).trim(); }),
          why: String(g.why || ''),
          protocol_ref: g.protocol_ref ? String(g.protocol_ref) : null,
          common_mistake: String(g.common_mistake || '')
        };
        // 変化球用の分岐(設計のみ。画面での利用は今後): そのまま持ち回る
        if (g.branch && typeof g.branch === 'object') o.branch = g.branch;
        return o;
      })
    };
  }

  /** 症例1本の入力チェック(エラーではなく、直したほうがよい点の一覧)。 */
  function reviewHints(c) {
    var out = [];
    if (c.stages.length !== STAGE_NAMES.length) out.push('場面数が' + c.stages.length + '個です(標準は' + STAGE_NAMES.length + '個)');
    c.stages.forEach(function (g, i) {
      var n = '場面' + (i + 1);
      if (!g.protocol_ref) out.push(n + ': プロトコール根拠(protocol_ref)が空です');
      if (g.options.length >= 2) {
        var lens = g.options.map(function (t) { return t.length; });
        var wrongMax = Math.max.apply(null, lens.slice(1));
        if (lens[0] >= 40 && lens[0] > wrongMax * 1.8) out.push(n + ': 正解だけが長く、見た目で当たりが分かります');
      }
      if (!g.why) out.push(n + ': 解説(why)が空です');
    });
    return out;
  }

  // ---------- 個人情報らしき文字列の簡易検出 ----------
  var PII_RULES = [
    { re: /0\d{1,4}[-ー−‐－\s]?\d{1,4}[-ー−‐－\s]?\d{3,4}/, label: '電話番号らしき数字' },
    { re: /〒\s*\d{3}[-ー−‐－]?\d{4}/, label: '郵便番号' },
    { re: /[\w.+-]+@[\w-]+\.[\w.-]+/, label: 'メールアドレス' },
    { re: /[一-龥々]{1,4}(?:都|道|府|県)[一-龥ぁ-んァ-ヶ0-9０-９]{1,8}(?:市|区|町|村)/, label: '住所らしき地名' },
    // 「3-1-2」のような数字だけの並びは、プロトコール項番や日付と区別できないので見ない
    { re: /\d{1,4}\s*丁目|\d{1,4}\s*番地|\d{1,4}\s*番\s*\d{1,4}\s*号/, label: '番地らしき表記' },
    { re: /[一-龥]{1,4}\s?[一-龥]{1,3}(?:さん|様|氏|殿)/, label: '氏名らしき表記(〇〇さん・様)' },
    { re: /(?:氏名|名前|患者名)\s*[:：]\s*\S+/, label: '氏名の記載' },
    { re: /(?:19|20)\d{2}年\d{1,2}月\d{1,2}日生/, label: '生年月日' }
  ];
  /** 文字列から、個人情報かもしれない箇所の種類を返す(重複なし)。 */
  function detectPII(text) {
    var s = String(text || '').normalize('NFKC');
    var out = [];
    PII_RULES.forEach(function (r) { if (r.re.test(s) && out.indexOf(r.label) < 0) out.push(r.label); });
    return out;
  }
  function casePII(c) {
    var parts = [c.title, c.chief_complaint, c.review_note];
    c.stages.forEach(function (g) { parts.push(g.info, g.q, g.why, g.common_mistake); g.options.forEach(function (o) { parts.push(o); }); });
    return detectPII(parts.join('\n'));
  }

  // ---------- ドリルの進行 ----------
  /** 症例から1回分の出題を作る。選択肢はシャッフルし、origin に元の位置(0=正解)を残す。 */
  function prepareRun(c, rnd) {
    return c.stages.map(function (st, i) {
      return {
        name: st.name || STAGE_NAMES[i] || '場面' + (i + 1),
        info: st.info || '',
        q: st.q,
        why: st.why || '',
        protocol_ref: st.protocol_ref || null,
        caseId: c.id || '',
        stageIdx: i,
        opts: shuffle(st.options.map(function (t, j) { return { t: t, ok: j === 0, origin: j }; }), rnd)
      };
    });
  }

  /** セッションのまとめ。results = [{score(0|0.5|1), ms, timeout}] */
  function summarize(results) {
    var n = results.length;
    var sum = results.reduce(function (a, r) { return a + r.score; }, 0);
    var avg = n ? results.reduce(function (a, r) { return a + r.ms; }, 0) / n / 1000 : 0;
    var slow = -1;
    results.forEach(function (r, i) { if (slow < 0 || r.ms > results[slow].ms) slow = i; });
    return { sum: Math.round(sum * 10) / 10, total: n, pct: n ? Math.round(sum / n * 100) : 0, avg: Math.round(avg * 10) / 10, slowest: slow };
  }

  // ---------- 集計 ----------
  function byDate(sessions) {
    var m = {};
    sessions.forEach(function (s) { var k = dateKey(s.createdAt); m[k] = (m[k] || 0) + 1; });
    return m;
  }
  /** 連続訓練日数。今日まだ訓練していなくても、昨日まで続いていれば継続とみなす。 */
  function streak(sessions, today) {
    var m = byDate(sessions);
    var d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (!m[dateKey(d)]) d = addDays(d, -1);
    var n = 0;
    while (m[dateKey(d)]) { n++; d = addDays(d, -1); }
    return n;
  }
  /** 月曜はじまりの今週の回数。 */
  function weekCount(sessions, today) {
    var dow = (today.getDay() + 6) % 7;
    var start = dateKey(addDays(today, -dow));
    return sessions.filter(function (s) { return dateKey(s.createdAt) >= start && dateKey(s.createdAt) <= dateKey(today); }).length;
  }
  /** 直近 weeks 週ぶんの日別回数(古い順)。 */
  function heatmap(sessions, today, weeks) {
    var m = byDate(sessions);
    var dow = (today.getDay() + 6) % 7;
    var start = addDays(today, -dow - (weeks - 1) * 7);
    var out = [];
    for (var i = 0; i < weeks * 7; i++) {
      var d = addDays(start, i);
      out.push({ date: dateKey(d), n: m[dateKey(d)] || 0, future: d > today });
    }
    return out;
  }
  function best(sessions) {
    var b = { pct: 0, avg: null };
    sessions.forEach(function (s) {
      var pct = s.total ? s.score / s.total * 100 : 0;
      if (pct > b.pct) b.pct = Math.round(pct);
      if (s.avgTime != null && (b.avg == null || s.avgTime < b.avg)) b.avg = s.avgTime;
    });
    return b;
  }
  /**
   * 弱点の集計。by='stage'(場面名) か 'tag'(カテゴリ)。
   * 戻り値は 正答率の低い順: [{key, n, rate(0-1), avg(秒)}]
   */
  function weakness(sessions, by) {
    var m = {};
    sessions.forEach(function (s) {
      (s.results || []).forEach(function (r) {
        var key = by === 'tag' ? (s.tag || '未分類') : r.name;
        if (!key) return;
        var x = m[key] || (m[key] = { key: key, n: 0, sum: 0, ms: 0 });
        x.n++; x.sum += r.score; x.ms += r.ms;
      });
    });
    return Object.keys(m).map(function (k) {
      var x = m[k];
      return { key: k, n: x.n, rate: x.sum / x.n, avg: Math.round(x.ms / x.n / 100) / 10 };
    }).sort(function (a, b) { return a.rate - b.rate || b.avg - a.avg; });
  }
  /** 週の目標(回数・平均秒数)に対する進み具合。 */
  function goalProgress(sessions, goals, today) {
    var wk = weekCount(sessions, today);
    var dow = (today.getDay() + 6) % 7;
    var start = dateKey(addDays(today, -dow));
    var recent = sessions.filter(function (s) { return dateKey(s.createdAt) >= start && s.avgTime != null; });
    var avg = recent.length ? recent.reduce(function (a, s) { return a + s.avgTime; }, 0) / recent.length : null;
    return {
      week: wk, weekTarget: goals.weekly || 0, weekDone: !!goals.weekly && wk >= goals.weekly,
      avg: avg == null ? null : Math.round(avg * 10) / 10, avgTarget: goals.avgSec || 0,
      avgOk: avg != null && !!goals.avgSec && avg <= goals.avgSec
    };
  }

  // ---------- 書き出し ----------
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // 表計算ソフトでの数式扱いを避ける
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  /** 場面ごとに1行のCSV。 */
  function toCsv(sessions) {
    var head = ['日時', '症例', 'カテゴリ', '難易度', 'モード', '制限秒', '場面番号', '場面名', '得点', '所要秒', '時間切れ', 'メモ'];
    var lines = [head.map(csvCell).join(',')];
    sessions.forEach(function (s) {
      (s.results || []).forEach(function (r, i) {
        lines.push([s.createdAt, s.caseTitle, s.tag, s.difficulty, s.mode === 'speak' ? '声出し' : '選択式', s.timeLimit,
          i + 1, r.name, r.score, (r.ms / 1000).toFixed(1), r.timeout ? '○' : '', s.note].map(csvCell).join(','));
      });
    });
    return '﻿' + lines.join('\r\n');
  }

  // ---------- 接続コード ----------
  function b64urlEncode(obj) {
    var json = JSON.stringify(obj);
    var b = typeof Buffer !== 'undefined' ? Buffer.from(json, 'utf8').toString('base64') : btoa(unescape(encodeURIComponent(json)));
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(s) {
    s = String(s || '').trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var json = typeof Buffer !== 'undefined' ? Buffer.from(s, 'base64').toString('utf8') : decodeURIComponent(escape(atob(s)));
    return JSON.parse(json);
  }
  /**
   * 接続コード {u,k} か、引き継ぎコード {u,k,uid,tok,nick} を読む。
   * 失敗したら例外。
   */
  function decodeCode(text) {
    var o = b64urlDecode(text);
    // 通信先は https のみ。開発用に、この端末自身(127.0.0.1 / localhost)だけ http を許す。
    var urlOk = o && typeof o.u === 'string' && (/^https:\/\//.test(o.u) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(o.u));
    if (!urlOk || typeof o.k !== 'string' || !o.k) throw new Error('形式が正しくありません');
    var out = { u: o.u, k: o.k };
    if (o.uid && o.tok) { out.uid = String(o.uid); out.tok = String(o.tok); out.nick = String(o.nick || ''); }
    return out;
  }

  return {
    STAGE_NAMES: STAGE_NAMES, TIME_CHOICES: TIME_CHOICES, DIFFICULTY: DIFFICULTY, LIMITS: LIMITS,
    shuffle: shuffle, dateKey: dateKey, addDays: addDays, newId: newId,
    validateCases: validateCases, validateCase: validateCase, normalizeCase: normalizeCase, reviewHints: reviewHints,
    detectPII: detectPII, casePII: casePII,
    prepareRun: prepareRun, summarize: summarize,
    streak: streak, weekCount: weekCount, heatmap: heatmap, best: best, weakness: weakness, goalProgress: goalProgress,
    toCsv: toCsv, encodeCode: b64urlEncode, decodeCode: decodeCode
  };
});
