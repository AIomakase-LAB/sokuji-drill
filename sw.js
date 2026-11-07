// アプリ本体をキャッシュして、オフラインでも起動できるようにする。
// データ通信(script.google.com など別オリジン)には関与しない。
// プロトコール本文は端末に保存しない(このアプリは取り扱わない)。
// 画面を更新したら CACHE のバージョンを上げる(version.js も合わせる)。
const CACHE = 'sokuji-v0.1.1';
const SHELL = ['./', 'index.html', 'style.css', 'logic.js', 'samples.js', 'version.js', 'core.js', 'drill.js', 'views.js', 'main.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 同じオリジンのファイルはネット優先・失敗時キャッシュ(更新がすぐ反映され、圏外でも開ける)
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
