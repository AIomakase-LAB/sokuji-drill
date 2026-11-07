/** 即時判断ドリル: イベントの振り分けと起動。 */
(function () {
  'use strict';
  var App = window.App, state = App.state;

  // data-act を持つ要素のクリックを、App.acts の同名の関数へ渡す
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    var fn = App.acts[b.dataset.act];
    if (fn) fn(b, e);
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('#tabbar [data-tab]');
    if (!t) return;
    state.tab = t.dataset.tab;
    App.go(state.tab);
  });

  // 復帰時に同期する
  window.addEventListener('online', function () { App.flush(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && state.conn && !state.conn.demo) App.flush();
  });
  setInterval(function () { if (state.sync === 'off' && navigator.onLine) App.flush(); }, 30000);

  // ---- 起動 ----
  App.render();
  if (state.conn && !state.conn.demo) App.flush();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
})();
