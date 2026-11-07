/**
 * 即時判断ドリル: 画面の土台(状態・通信・送信キュー)。
 * 前回の筋トレアプリと同じ作り。操作はまず端末に反映し、送信キューに積んでからサーバーへ送る。
 * オフラインでも使え、つながったときに自動で送信する。
 */
(function () {
  'use strict';
  var SD = window.SD;

  var LS = { conn: 'sd_conn', me: 'sd_me', admin: 'sd_admin', data: 'sd_data', outbox: 'sd_outbox', settings: 'sd_settings', demo: 'sd_demo' };
  function load(k, fb) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
  function save(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 容量超過などは無視 */ } }

  var App = window.App = { LS: LS, load: load, save: save, views: {}, acts: {} };

  function normalize(d) {
    d = d || {};
    return { me: d.me || null, cases: Array.isArray(d.cases) ? d.cases : [], sessions: Array.isArray(d.sessions) ? d.sessions : [] };
  }

  var state = App.state = {
    conn: load(LS.conn, null),          // {u,k} | {demo:true} | null
    me: load(LS.me, null),              // {uid,tok,nick}
    admin: load(LS.admin, ''),          // 承認者の合言葉(この端末だけに保存)
    data: normalize(load(LS.data, null)),
    outbox: load(LS.outbox, []),
    settings: Object.assign({ time: 10, mode: 'choice', tag: '', diff: 0, goals: { weekly: 3, avgSec: 8 } }, load(LS.settings, {})),
    tab: 'home',
    sync: 'idle',
    run: null
  };

  // ---------- 小物 ----------
  var $ = App.$ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = App.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  App.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  var toastTimer;
  App.toast = function (msg, err) {
    var t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast' + (err ? ' err' : ''); }, err ? 4500 : 2400);
  };
  App.fmtDate = function (iso) {
    var d = new Date(iso), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  };
  App.persist = function () { save(LS.settings, state.settings); if (state.conn && state.conn.demo) save(LS.demo, state.data); else save(LS.data, state.data); };
  App.saveSettings = function () { save(LS.settings, state.settings); };
  App.download = function (name, text, mime) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
  App.copyText = function (text) {
    var ok = false;
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
    } catch (e) { /* 次へ */ }
    if (ok) return Promise.resolve(true);
    if (navigator.clipboard) return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
    return Promise.resolve(false);
  };

  // ---------- 症例の見え方 ----------
  App.isDemo = function () { return !!(state.conn && state.conn.demo); };
  App.isAdmin = function () { return App.isDemo() || !!(state.data.me && state.data.me.admin); };
  App.myUid = function () { return state.me ? state.me.uid : ''; };
  /** サンプル(同梱) + サーバーの症例。サンプルは承認済み扱いで、編集・削除はできない。 */
  App.allCases = function () {
    var samples = (window.SD_SAMPLES || []).map(function (c) {
      return Object.assign({}, c, { status: 'approved', source: 'sample', mine: false, version: 1, authorName: 'サンプル' });
    });
    return samples.concat(state.data.cases);
  };
  App.drillable = function () { return App.allCases().filter(function (c) { return c.status === 'approved'; }); };
  App.findCase = function (id) { return App.allCases().filter(function (c) { return c.id === id; })[0] || null; };
  App.sessionsAsc = function () {
    return state.data.sessions.slice().sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0; });
  };

  // ---------- 通信 ----------
  function netError(msg) { var e = new Error(msg); e.network = true; return e; }
  function api(action, payload) {
    var c = state.conn;
    var body = { key: c.k, uid: state.me && state.me.uid, tok: state.me && state.me.tok, action: action, payload: payload || {} };
    if (state.admin) body.admin = state.admin;
    // 本文は文字列のまま送る(Content-Type が text/plain になり、事前確認の通信が要らない)
    return fetch(c.u, { method: 'POST', body: JSON.stringify(body), redirect: 'follow' }).then(function (r) {
      if (!r.ok) throw netError('HTTP ' + r.status);
      return r.json().catch(function () { throw netError('応答を読めませんでした'); });
    }, function () { throw netError('オフラインです'); }).then(function (j) {
      if (!j.ok) { var e = new Error(j.error || 'エラー'); e.auth = !!j.auth; e.identity = !!j.identity; throw e; }
      return j.data;
    });
  }
  App.api = api;
  App.register = function () {
    return api('registerProfile', { uid: state.me.uid, token: state.me.tok, nickname: state.me.nick });
  };
  /** 利用者として未確認(端末は新しいが、サーバーのシートが空など)なら登録し直してから実行する。 */
  function withIdentity(fn) {
    return fn().catch(function (e) {
      if (!e.identity || !state.me) throw e;
      return App.register().then(fn);
    });
  }

  function syncBadge() {
    var n = state.outbox.length;
    var cls = state.sync === 'busy' ? 'busy' : state.sync === 'off' ? 'off' : '';
    var label = App.isDemo() ? 'デモ' : state.sync === 'busy' ? '同期中' : state.sync === 'off' ? (n ? '未送信 ' + n + '件' : 'オフライン') : '同期済み';
    return '<button class="sync ' + cls + '" id="sync" data-act="sync-now"><i></i>' + label + '</button>';
  }
  App.syncBadge = syncBadge;
  function setSync(s) {
    state.sync = s;
    var el = $('#sync');
    if (el) el.outerHTML = syncBadge();
  }

  // ---------- 端末への反映(サーバーと同じ規則) ----------
  function nowIso() { return new Date().toISOString(); }
  function upsert(list, item) {
    var i = -1;
    list.forEach(function (x, k) { if (x.id === item.id) i = k; });
    if (i >= 0) list[i] = item; else list.push(item);
  }
  function caseRow(c, over) {
    var n = SD.normalizeCase(c);
    return Object.assign(n, { id: c.id }, over);
  }
  function applyLocal(action, p) {
    var d = state.data, now = nowIso(), uid = App.myUid(), nick = state.me ? state.me.nick : '';
    var cs = d.cases;
    if (action === 'saveSession') {
      upsert(d.sessions, p);
    } else if (action === 'deleteSession') {
      d.sessions = d.sessions.filter(function (s) { return s.id !== p.id; });
    } else if (action === 'saveCase') {
      var old = cs.filter(function (c) { return c.id === p.case.id; })[0];
      var mine = !old || old.authorId === uid;
      var status = p.submit ? 'review' : (old && App.isAdmin() && !mine ? old.status : (old && old.status === 'approved' ? 'approved' : 'draft'));
      upsert(cs, caseRow(p.case, {
        status: status, version: old ? (old.version || 1) + 1 : 1, source: old ? old.source : 'manual',
        authorId: old ? old.authorId : uid, authorName: old ? old.authorName : nick, mine: mine,
        reviewNote: p.submit || !old ? '' : old.reviewNote || '', createdAt: old ? old.createdAt : now, updatedAt: now, publishedAt: old ? old.publishedAt : ''
      }));
    } else if (action === 'reviewCase') {
      cs.forEach(function (c) {
        if (c.id !== p.id) return;
        if (p.decision === 'approve') { c.status = 'approved'; c.publishedAt = now; c.reviewNote = ''; }
        else if (p.decision === 'reject') { c.status = 'draft'; c.reviewNote = p.note; }
        else if (p.decision === 'unpublish') { c.status = 'draft'; c.publishedAt = ''; c.reviewNote = p.note || ''; }
        c.version = (c.version || 1) + 1; c.updatedAt = now;
      });
    } else if (action === 'deleteCase') {
      d.cases = cs.filter(function (c) { return c.id !== p.id; });
    } else if (action === 'importCases') {
      p.cases.forEach(function (c) {
        upsert(cs, caseRow(c, {
          status: p.approved && App.isAdmin() ? 'approved' : 'draft', version: 1, source: 'import', authorId: uid, authorName: nick, mine: true,
          reviewNote: '', createdAt: now, updatedAt: now, publishedAt: p.approved && App.isAdmin() ? now : ''
        }));
      });
    }
  }

  /** 端末に即反映し、送信キューに積んでからサーバーへ送る。 */
  App.mutate = function (action, payload) {
    applyLocal(action, payload);
    App.persist();
    if (!App.isDemo()) {
      state.outbox.push({ action: action, payload: payload });
      save(LS.outbox, state.outbox);
    }
    App.render();
    App.flush();
  };

  var flushing = false, flushPromise = null;
  App.flush = function () {
    // 同期の最中に呼ばれたら、すぐ終わらせず今の同期の完了を待つ(古い結果で判断しないように)
    if (flushing) return flushPromise;
    if (!state.conn || state.conn.demo || !state.me) return Promise.resolve();
    flushing = true;
    setSync('busy');
    function step() {
      if (!state.outbox.length) {
        // 送るものがなくなったら、サーバーの最新状態(承認の結果など)で端末の表示を置き換える
        return withIdentity(function () { return api('getData'); }).then(function (data) {
          // 取得の最中に新しい操作が積まれていたら、その操作が消えないよう置き換えない(直後の再送で反映される)
          if (!state.outbox.length) {
            state.data = normalize(data);
            App.persist();
          }
          setSync('idle');
          App.render();
        });
      }
      var item = state.outbox[0];
      return withIdentity(function () { return api(item.action, item.payload); }).then(function () {
        state.outbox.shift();
        save(LS.outbox, state.outbox);
        return step();
      }, function (e) {
        if (e.network || e.auth) throw e;
        // 入力内容のエラーは、この1件だけ捨てて続ける(キューを詰まらせない)
        App.toast(e.message, true);
        state.outbox.shift();
        save(LS.outbox, state.outbox);
        return step();
      });
    }
    flushPromise = step().catch(function (e) {
      setSync('off');
      if (e.auth) App.toast('接続コードが無効です。設定から入れ直してください', true);
    }).then(function () {
      flushing = false;
      // 同期中に積まれた操作があれば続けて送る(通信失敗のときは繰り返さない)
      if (state.outbox.length && state.sync !== 'off') return App.flush();
    });
    return flushPromise;
  };
  /** 送信キューを送り切ってから、サーバーに直接最新の状態を問い合わせる。通信できなければ例外。 */
  App.fetchLatest = function () {
    return App.flush().then(function () {
      return withIdentity(function () { return api('getData'); });
    }).then(function (data) {
      if (!state.outbox.length) { state.data = normalize(data); App.persist(); }
      return data;
    });
  };

  // ---------- 描画の入口 ----------
  App.render = function () {
    // 訓練中・結果表示中は、同期の完了などで画面を作り直さない(出題や結果が消えないように)。
    // 抜けるときは App.go() が state.run を空にする。
    if (state.run) { setSync(state.sync); return; }
    var connected = !!state.conn;
    var fn = connected ? App.views[state.tab] : App.views.connect;
    var view = $('#view');
    if (!fn || !view) return;
    var y = window.scrollY;
    view.innerHTML = '<div class="notice">訓練用です。実際の活動は所属のMCプロトコールに従ってください。</div>' + fn();
    $$('#tabbar button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === state.tab); });
    $('#tabbar').hidden = !connected;
    window.scrollTo(0, y);
  };
  App.go = function (tab) { state.run = null; state.tab = tab; App.closeLayer(); App.render(); window.scrollTo(0, 0); };

  // ---------- シート(重ねて表示する画面) ----------
  App.openLayer = function (html, cls) {
    var l = $('#layer');
    l.className = 'on ' + (cls || '');
    l.innerHTML = '<div class="sheet"><div class="notice">訓練用です。実際の活動は所属のMCプロトコールに従ってください。</div>' + html + '</div>';
    l.scrollTop = 0;
    document.body.classList.add('lock');
  };
  App.closeLayer = function () {
    var l = $('#layer');
    l.className = '';
    l.innerHTML = '';
    document.body.classList.remove('lock');
  };

  App.normalize = normalize;
})();
