'use strict';
/**
 * ブラウザ(Chromium・スマホ画面)での通しテスト。画面 + モックした Apps Script API をローカルで動かす。
 *   GAS_DIR=../gas-projects/projects/sokuji-drill node test/e2e.js
 * 画面の確認用スクリーンショットは SHOTS=出力フォルダ を指定すると保存する。
 */
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { start } = require('../dev/server');

const SHOTS = process.env.SHOTS;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const stage = (n) => ({ name: undefined, info: '状況 ' + n + '\nバイタル安定', q: '最初の一手は? ' + n, options: ['正解' + n, '誤答A' + n, '誤答B' + n], why: '解説 ' + n, protocol_ref: '3-' + n });
const mkCase = (title, o) => Object.assign({ title, tag: '循環器', difficulty: 2, age: '70代', sex: '男性', chief_complaint: '胸痛', protocol_refs: ['3-A'], stages: Array.from({ length: 9 }, (_, i) => stage(i + 1)) }, o);

let passed = 0;
async function step(name, fn) {
  const t0 = Date.now();
  try { await fn(); passed++; console.log('  ok  ' + name + ' (' + (Date.now() - t0) + 'ms)'); }
  catch (e) { console.log('  NG  ' + name + '\n      ' + String(e.stack || e).split('\n').slice(0, 6).join('\n      ')); throw e; }
}

async function newDevice(browser, srv, name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'ja-JP', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(name + ': ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(name + ': console ' + m.text()); });
  page.dialogs = [];
  page.dialogAnswer = true;
  page.on('dialog', async (d) => { page.dialogs.push(d.message()); if (d.type() === 'prompt') await d.accept(page.promptText || ''); else if (page.dialogAnswer) await d.accept(); else await d.dismiss(); });
  await page.goto(srv.origin + '/');
  return { ctx, page, errors };
}
const tab = (page, t) => page.click('#tabbar [data-tab=' + t + ']');
const text = (page) => page.evaluate(() => document.body.innerText);
async function connect(page, srv, nick, code) {
  await page.fill('#connCode', code || srv.code);
  await page.fill('#connNick', nick);
  await page.click('[data-act=connect]');
  await page.waitForSelector('#tabbar:not([hidden])');
  await waitSync(page);
}
async function waitSync(page) {
  await page.waitForFunction(() => window.App.state.outbox.length === 0 && window.App.state.sync === 'idle', null, { timeout: 8000 });
}
/** 全場面を回答する。mode: 'correct'(全問正解) / 'wrong'(全問不正解)。 */
async function runDrill(page, mode) {
  await page.click('[data-act=go]');
  for (let i = 0; i < 9; i++) {
    await page.waitForSelector('#choices .opt');
    const idx = await page.evaluate((m) => {
      const o = window.App.state.run.cur.opts;
      return m === 'correct' ? o.findIndex((x) => x.ok) : o.findIndex((x) => !x.ok);
    }, mode);
    await page.click('#choices .opt >> nth=' + idx);
    await page.waitForSelector('#nextbtn');
    await page.click('#nextbtn');
  }
  await page.waitForSelector('text=結果');
}

(async () => {
  const srv = await start(0);
  const browser = await chromium.launch();
  const allErrors = [];
  const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
  try {
    // ===================== デモ(接続なし) =====================
    console.log('[デモモード]');
    {
      const d = await newDevice(browser, srv, 'demo');
      const p = d.page;
      await step('初回は接続画面。注意書きが常に出ている', async () => {
        assert.match(await text(p), /訓練用です。実際の活動は所属のMCプロトコールに従ってください/);
        assert.match(await text(p), /接続コード/);
        await shot(p, '01-connect');
      });
      await step('接続コードが不正ならエラー表示', async () => {
        await p.fill('#connCode', 'でたらめ'); await p.fill('#connNick', 'a'); await p.click('[data-act=connect]');
        assert.match(await text(p), /接続コードの形式が正しくありません/);
      });
      await step('デモを開始: サンプル3症例が出る', async () => {
        await p.click('[data-act=demo]');
        await p.waitForSelector('.sc[data-act=start]');
        assert.equal(await p.locator('.sc[data-act=start]').count(), 3);
        assert.match(await text(p), /サンプル/);
        await shot(p, '02-home');
      });
      await step('1症例を全問正解で完走 → 9/9・履歴に残る', async () => {
        await p.click('.sc[data-act=start] >> nth=0');
        assert.match(await text(p), /9場面/);
        await runDrill(p, 'correct');
        assert.match(await text(p), /9 \/ 9/);
        assert.match(await text(p), /正答率 100%/);
        await shot(p, '03-result');
        await p.click('[data-act=home]');
        await tab(p, 'history');
        await p.waitForSelector('.hrow');
        assert.equal(await p.locator('.hrow').count(), 1);
        assert.match(await text(p), /9\/9/);
      });
      await step('全問不正解 → 復習が出て、正解が示される', async () => {
        await tab(p, 'home');
        await p.click('.sc[data-act=start] >> nth=1');
        await runDrill(p, 'wrong');
        const t = await text(p);
        assert.match(t, /0 \/ 9/);
        assert.match(t, /復習/);
        assert.match(t, /あなた:/);
        assert.match(t, /正解:/);
        await p.click('[data-act=home]');
      });
      await step('連続日数・今週の回数に反映される', async () => {
        const s = await p.evaluate(() => document.querySelector('.stat3').innerText.replace(/\s+/g, ' '));
        assert.match(s, /1 連続日数/);
        assert.match(s, /2\/3 今週の回数/);
      });
      await step('分析: 弱点が出る・場面ごとの正答率', async () => {
        await tab(p, 'stats');
        const t = await text(p);
        assert.match(t, /場面ごとの弱点/);
        assert.match(t, /指令内容/);
        assert.match(t, /訓練回数\n?2|2\s*訓練回数/);
        await shot(p, '04-stats');
      });
      await step('弱点場面だけ: 各場面が3回未満のうちは押せない', async () => {
        await tab(p, 'home');
        assert.equal(await p.locator('[data-act=weak]').isDisabled(), true);
        assert.match(await text(p), /各場面を3回以上訓練すると出せます/);
      });
      await step('声出しモード: 模範解答 → 自己評価で進む', async () => {
        await tab(p, 'home');
        await p.click('[data-act=mode][data-v=speak]');
        await p.click('.sc[data-act=start] >> nth=2');
        await p.click('[data-act=go]');
        for (let i = 0; i < 9; i++) {
          await p.waitForSelector('#reveal');
          await p.click('#reveal');
          await p.waitForSelector('[data-act=rate]');
          await p.click('[data-act=rate][data-v="' + (i % 3 === 0 ? 1 : i % 3 === 1 ? 0.5 : 0) + '"]');
        }
        await p.waitForSelector('text=結果');
        assert.match(await text(p), /4\.5 \/ 9/); // 1,0.5,0 ×3 = 4.5
        await p.click('[data-act=home]');
        await p.click('[data-act=mode][data-v=choice]');
      });
      await step('時間切れ: 5秒で未回答 → 時間切れ・不正解扱い', async () => {
        await p.click('[data-act=time][data-v="5"]');
        await p.click('.sc[data-act=start] >> nth=0');
        await p.click('[data-act=go]');
        await p.waitForSelector('#choices .opt');
        await p.waitForSelector('.fb.to', { timeout: 7000 });
        assert.match(await text(p), /時間切れ/);
        assert.match(await text(p), /正解:/);
        await p.click('[data-act=abort]');
        assert.match(p.dialogs.pop(), /中止しますか/);
        await p.waitForSelector('.sc[data-act=start]');
        await p.click('[data-act=time][data-v="10"]');
      });
      await step('症例を作る: 空のままでは保存できず、入力すれば下書きで保存', async () => {
        await tab(p, 'cases');
        await p.click('[data-act=case-new]');
        await p.click('[data-act=ed-save]');
        assert.match(await text(p), /title がありません/);
        await p.fill('input[data-f=title]', '手書きの症例');
        await p.fill('input[data-f=tag]', '呼吸器');
        for (let i = 0; i < 9; i++) {
          await p.evaluate((i) => { document.querySelectorAll('details.stg')[i].open = true; }, i);
          await p.fill('details.stg >> nth=' + i + ' >> textarea[data-f=info]', '状況' + i);
          await p.fill('details.stg >> nth=' + i + ' >> input[data-f=q]', '質問' + i);
          await p.fill('details.stg >> nth=' + i + ' >> textarea[data-o="0"]', '正解' + i);
          await p.fill('details.stg >> nth=' + i + ' >> textarea[data-o="1"]', '誤答' + i);
          await p.fill('details.stg >> nth=' + i + ' >> textarea[data-o="2"]', '');
        }
        await shot(p, '05-editor');
        await p.click('[data-act=ed-save]');
        await p.waitForSelector('.sc[data-act=case-open]');
        assert.match(await text(p), /手書きの症例/);
        assert.match(await text(p), /下書き/);
      });
      await step('デモは承認者として全操作を試せる: レビュー→承認→ホームに出る', async () => {
        await p.click('.sc[data-act=case-open]');
        await p.click('[data-act=case-submit]');   // 見直し目安の確認ダイアログ(自動で OK)
        await p.waitForSelector('.tag.st-review');
        await p.click('.sc[data-act=case-open]');
        await p.click('[data-act=case-approve]');
        await tab(p, 'home');
        assert.match(await text(p), /手書きの症例/);
        assert.equal(await p.locator('.sc[data-act=start]').count(), 4);
      });
      await step('JSON取込: 個人情報らしき記述は警告し、拒否すれば取り込まない', async () => {
        await tab(p, 'cases');
        await p.click('[data-act=case-import]');
        const c = mkCase('電話番号入り');
        c.stages[0].info = '連絡先は 090-1234-5678 です';
        await p.fill('#jsonin', JSON.stringify([c]));
        p.dialogAnswer = false;
        const before = await p.evaluate(() => window.App.state.data.cases.length);
        await p.click('[data-act=import-do]');
        assert.match(p.dialogs.pop(), /個人情報かもしれない記述があります\(電話番号らしき数字\)/);
        assert.equal(await p.evaluate(() => window.App.state.data.cases.length), before);
        p.dialogAnswer = true;
        await p.click('[data-act=close-layer]');
      });
      await step('JSON取込: 不正な形式はメッセージが出る', async () => {
        await p.click('[data-act=case-import]');
        await p.fill('#jsonin', '[{"title":"x","stages":[{"q":"q","options":["a"]}]}]');
        await p.click('[data-act=import-do]');
        assert.match(await text(p), /options は2〜6個/);
        await p.fill('#jsonin', '{bad');
        await p.click('[data-act=import-do]');
        assert.match(await text(p), /JSONの書式エラー/);
        await p.click('[data-act=close-layer]');
      });
      await step('プロトタイプ形式(場面名なし・protocol_ref なし)のJSONを取り込める', async () => {
        await p.click('[data-act=case-import]');
        const proto = [{ title: 'プロトタイプ形式', tag: '外傷', stages: [{ info: 'i', q: 'q', options: ['a', 'b', 'c'], why: 'w' }] }];
        await p.fill('#jsonin', JSON.stringify(proto));
        await p.click('[data-act=import-do]');
        await p.waitForSelector('text=プロトタイプ形式');
        assert.match(await text(p), /1場面/);
      });
      await step('設定: 引き継ぎコードはデモでは出ず、デモ終了で初期画面に戻る', async () => {
        await tab(p, 'settings');
        assert.match(await text(p), /デモ/);
        assert.equal(await p.locator('[data-act=transfer]').count(), 0);
        await p.click('[data-act=disconnect]');
        await p.waitForSelector('#connCode');
        assert.equal(await p.evaluate(() => localStorage.getItem('sd_demo')), null);
      });
      assert.deepEqual(d.errors, [], 'ブラウザのエラー: ' + d.errors.join(' / '));
      await d.ctx.close();
    }

    // ===================== 共有データに接続(承認フロー・複数端末・オフライン) =====================
    console.log('[共有データ: 作成者→承認者→隊員]');
    const A = await newDevice(browser, srv, 'A作成者');
    const B = await newDevice(browser, srv, 'B承認者');
    const C = await newDevice(browser, srv, 'C隊員');
    let transferCode;
    try {
      await step('3台がそれぞれニックネームで接続できる', async () => {
        await connect(A.page, srv, '作成者A');
        await connect(B.page, srv, '指導者B');
        await connect(C.page, srv, '隊員C');
        const rows = srv.gas.sheet('プロフィール')._dump();
        assert.equal(rows.length, 4);
        assert.ok(!JSON.stringify(rows).includes(await C.page.evaluate(() => window.App.state.me.tok)), 'トークンの平文は保存されない');
      });
      await step('A: JSON取込で下書きを作り、レビューに出す', async () => {
        await tab(A.page, 'cases');
        await A.page.click('[data-act=case-import]');
        await A.page.fill('#jsonin', JSON.stringify([mkCase('胸痛(70代男性)')]));
        await A.page.click('[data-act=import-do]');
        await waitSync(A.page);
        await A.page.waitForSelector('.sc[data-act=case-open]');
        await A.page.click('.sc[data-act=case-open]');
        await shot(A.page, '06-case-detail');
        await A.page.click('[data-act=case-submit]');
        await waitSync(A.page);
        await A.page.waitForSelector('.tag.st-review');
      });
      await step('C(一般隊員)にはレビュー中の症例は見えず、訓練にも出ない', async () => {
        await C.page.evaluate(() => window.App.flush());
        await tab(C.page, 'cases');
        assert.doesNotMatch(await text(C.page), /胸痛\(70代男性\)/);
        await tab(C.page, 'home');
        assert.equal(await C.page.locator('.sc[data-act=start]').count(), 3, 'サンプルだけ');
      });
      await step('B: 合言葉を入力して承認者になれる。間違った合言葉は拒否', async () => {
        await tab(B.page, 'settings');
        await B.page.fill('#adminkey', 'まちがい');
        await B.page.click('[data-act=admin-save]');
        await B.page.waitForFunction(() => document.getElementById('toast').textContent.includes('合言葉が違う'));
        assert.equal(await B.page.evaluate(() => window.App.state.admin), '', '間違った合言葉は保存しない');
        await B.page.fill('#adminkey', srv.adminKey);
        await B.page.click('[data-act=admin-save]');
        await B.page.waitForFunction(() => document.getElementById('toast').textContent.includes('承認者として認識'));
        assert.match(await text(B.page), /承認者: はい/);
      });
      await step('B: 応答が遅く同期の最中でも、合言葉を正しく判定する(本番で起きた不具合の再発防止)', async () => {
        const toast = () => B.page.evaluate(() => document.getElementById('toast').textContent);
        const clearToast = () => B.page.evaluate(() => { document.getElementById('toast').textContent = ''; });
        const waitToast = (re) => B.page.waitForFunction((s) => new RegExp(s).test(document.getElementById('toast').textContent), re.source, { timeout: 15000 });
        await B.page.click('[data-act=admin-clear]');
        await B.page.waitForFunction(() => document.getElementById('toast').textContent.includes('解除しました'));
        srv.ctl.delayMs = 1200; // 本物の Apps Script のように遅くする
        try {
          // 正しい合言葉: スプレッドシートからアプリに戻った瞬間の自動同期の最中に押す
          await B.page.evaluate(() => { window.App.flush(); });
          await B.page.fill('#adminkey', srv.adminKey);
          await clearToast();
          await B.page.click('[data-act=admin-save]');
          await waitToast(/承認者として認識|合言葉が違う/);
          assert.match(await toast(), /承認者として認識/);
          assert.ok(await B.page.evaluate(() => window.App.state.admin), '合言葉が残っている');
          // 間違った合言葉: 同じ条件でも「違う」と判定し、保存しない
          await B.page.evaluate(() => { window.App.state.admin = ''; window.App.flush(); });
          await B.page.fill('#adminkey', 'まちがい');
          await clearToast();
          await B.page.click('[data-act=admin-save]');
          await waitToast(/承認者として認識|合言葉が違う/);
          assert.match(await toast(), /合言葉が違う/);
          assert.equal(await B.page.evaluate(() => window.App.state.admin), '');
        } finally { srv.ctl.delayMs = 0; }
        // 圏外: 「違う」とは言わず、合言葉は残す
        await B.ctx.setOffline(true);
        await B.page.fill('#adminkey', srv.adminKey);
        await clearToast();
        await B.page.click('[data-act=admin-save]');
        await waitToast(/つながりませんでした|合言葉が違う|承認者として認識/);
        assert.match(await toast(), /つながりませんでした/);
        assert.equal(await B.page.evaluate(() => window.App.state.admin), srv.adminKey);
        await B.ctx.setOffline(false);
        await B.page.evaluate(() => window.App.fetchLatest());
        assert.match(await text(B.page), /承認者: はい/);
      });
      await step('B: 承認待ちが見え、差し戻し(コメント付き)→A に届く', async () => {
        await tab(B.page, 'cases');
        assert.match(await text(B.page), /承認待ちが 1件/);
        await B.page.click('.sc[data-act=case-open]');
        B.page.promptText = '場面3の根拠項番を確認してください';
        await B.page.click('[data-act=case-reject]');
        await waitSync(B.page);
        await A.page.evaluate(() => window.App.flush());
        await tab(A.page, 'cases');
        await A.page.waitForSelector('.tag.st-draft');
        assert.match(await text(A.page), /差し戻しあり/);
        await A.page.click('.sc[data-act=case-open]');
        assert.match(await text(A.page), /差し戻しコメント: 場面3の根拠項番を確認してください/);
        await shot(A.page, '07-rejected');
      });
      await step('A: 直して再提出 → B が承認 → C のホームに出る', async () => {
        await A.page.click('[data-act=case-submit]');
        await waitSync(A.page);
        await B.page.evaluate(() => window.App.flush());
        await tab(B.page, 'cases');
        await B.page.click('.sc[data-act=case-open]');
        await B.page.click('[data-act=case-approve]');
        await waitSync(B.page);
        await C.page.evaluate(() => window.App.flush());
        await tab(C.page, 'home');
        await C.page.waitForSelector('.sc[data-act=start]:has-text("胸痛(70代男性)")');
        assert.equal(await C.page.locator('.sc[data-act=start]').count(), 4);
      });
      await step('A: 承認済みの症例は作成者でも編集・削除できない(複製は可能)', async () => {
        await A.page.evaluate(() => window.App.flush());
        await tab(A.page, 'cases');
        await A.page.click('.sc[data-act=case-open]');
        assert.equal(await A.page.locator('[data-act=case-edit]').count(), 0);
        assert.equal(await A.page.locator('[data-act=case-delete]').count(), 0);
        assert.equal(await A.page.locator('[data-act=case-dup]').count(), 1);
      });
      await step('C: 承認済み症例を完走 → サーバーに保存される', async () => {
        await C.page.click('.sc[data-act=start]:has-text("胸痛(70代男性)")');
        await runDrill(C.page, 'correct');
        await waitSync(C.page);
        const rows = srv.gas.sheet('セッション')._dump();
        assert.equal(rows.length, 2);
        assert.equal(rows[1][3], '胸痛(70代男性)');
        assert.equal(rows[1][8], 9);
        await shot(C.page, '08-result-connected');
      });
      await step('C: メモを保存すると、同じ記録が更新される(重複しない)', async () => {
        await C.page.fill('#note', '場面5が遅い');
        await C.page.click('[data-act=save-note]');
        await waitSync(C.page);
        const rows = srv.gas.sheet('セッション')._dump();
        assert.equal(rows.length, 2);
        assert.equal(rows[1][11], '場面5が遅い');
        await C.page.click('[data-act=home]');
      });
      await step('C: オフラインで訓練 → 「未送信」と表示 → 復帰で自動送信', async () => {
        await C.ctx.setOffline(true);
        await C.page.click('.sc[data-act=start] >> nth=0');
        await runDrill(C.page, 'wrong');
        await C.page.waitForFunction(() => window.App.state.outbox.length >= 1);
        await C.page.waitForFunction(() => document.getElementById('sync').textContent.includes('未送信'));
        assert.equal(srv.gas.sheet('セッション')._dump().length, 2, 'オフライン中はサーバーに届かない');
        await C.page.click('[data-act=home]');
        await tab(C.page, 'history');
        assert.equal(await C.page.locator('.hrow').count(), 2, 'オフラインでも履歴に出る');
        await C.ctx.setOffline(false);
        await C.page.evaluate(() => window.dispatchEvent(new Event('online')));
        await waitSync(C.page);
        assert.equal(srv.gas.sheet('セッション')._dump().length, 3);
      });
      await step('C: 履歴は本人だけ(他の端末の記録は見えない)', async () => {
        await A.page.evaluate(() => window.App.flush());
        assert.equal(await A.page.evaluate(() => window.App.state.data.sessions.length), 0);
        assert.equal(await C.page.evaluate(() => window.App.state.data.sessions.length), 2);
      });
      await step('C: 引き継ぎコードで新しい端末に履歴ごと移せる', async () => {
        await tab(C.page, 'settings');
        await C.page.click('[data-act=transfer]');
        transferCode = await C.page.inputValue('#jsonout');
        assert.ok(transferCode.length > 40);
        await C.page.click('[data-act=close-layer]');
        const D = await newDevice(browser, srv, 'D新端末');
        await D.page.fill('#connCode', transferCode);
        await D.page.click('[data-act=connect]'); // ニックネーム空でも引き継ぎコードなら可
        await D.page.waitForSelector('#tabbar:not([hidden])');
        await waitSync(D.page);
        await tab(D.page, 'history');
        assert.equal(await D.page.locator('.hrow').count(), 2);
        assert.equal(srv.gas.sheet('プロフィール')._dump().length, 4, '新しい利用者は増えない');
        await D.ctx.close();
      });
      await step('接続コードが違う端末は接続できない', async () => {
        const E = await newDevice(browser, srv, 'E');
        const bad = Buffer.from(JSON.stringify({ u: srv.origin + '/api', k: 'wrongkey' })).toString('base64').replace(/=+$/, '');
        await E.page.fill('#connCode', bad); await E.page.fill('#connNick', 'x');
        await E.page.click('[data-act=connect]');
        await E.page.waitForSelector('text=接続コードが違います');
        assert.equal(await E.page.evaluate(() => localStorage.getItem('sd_conn')), null);
        await E.ctx.close();
      });
      await step('弱点場面ドリル: 3回以上の訓練で有効になり、集めた場面だけ出る', async () => {
        await tab(C.page, 'home');
        await C.page.click('.sc[data-act=start]:has-text("胸痛(70代男性)")');
        await runDrill(C.page, 'wrong');
        await C.page.click('[data-act=home]');
        await waitSync(C.page);
        await C.page.waitForSelector('[data-act=weak]:not([disabled])');
        await C.page.click('[data-act=weak]');
        assert.match(await text(C.page), /弱点場面ドリル/);
        await C.page.click('[data-act=go]');
        await C.page.waitForSelector('#choices .opt');
        const names = await C.page.evaluate(() => Array.from(new Set(window.App.state.run.stages.map((s) => s.name))));
        const weak = await C.page.evaluate(() => window.SD.weakness(window.App.sessionsAsc(), 'stage').filter((w) => w.n >= 3).slice(0, 2).map((w) => w.key));
        assert.ok(names.length > 0 && names.every((n) => weak.includes(n)), '出題は弱点の場面だけ: ' + names + ' / ' + weak);
        await C.page.click('[data-act=abort]');
      });
      await step('履歴の削除がサーバーにも反映される', async () => {
        await tab(C.page, 'history');
        await C.page.click('.hrow >> nth=0');
        await C.page.click('[data-act=del-session]');
        await waitSync(C.page);
        assert.equal(srv.gas.sheet('セッション')._dump().length, 3);
      });
      await step('サーバーのシートが空でも、端末が自動で再登録して復旧する', async () => {
        // 作成者A(2行目)のプロフィールを消す → identity エラー → 同じ端末ID・トークンで再登録 → 続行
        const uidA = await A.page.evaluate(() => window.App.state.me.uid);
        const sheet = srv.gas.sheet('プロフィール');
        assert.equal(sheet._dump()[1][0], uidA);
        sheet.getRange(2, 1, 1, 4).clearContent();
        const regs = srv.log.filter((a) => a === 'registerProfile').length;
        await A.page.evaluate(() => window.App.flush());
        await waitSync(A.page);
        assert.equal(srv.log.filter((a) => a === 'registerProfile').length, regs + 1, '自動で再登録した');
        assert.ok(JSON.stringify(sheet._dump()).includes(uidA), '同じIDで復旧した');
        assert.equal(await A.page.evaluate(() => window.App.state.me.uid), uidA);
      });
    } finally {
      allErrors.push(...A.errors, B.errors, C.errors);
      for (const x of [A, B, C]) await x.ctx.close().catch(() => {});
    }
    const flat = allErrors.flat();
    assert.deepEqual(flat, [], 'ブラウザのエラー: ' + flat.join(' / '));
    console.log('\n全 ' + passed + ' 項目 OK');
  } finally {
    await browser.close();
    await srv.close();
  }
})().catch((e) => { console.error('\n失敗しました'); process.exit(1); });
