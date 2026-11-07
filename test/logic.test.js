'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const SD = require('../logic.js');

const stage = (o) => Object.assign({ q: '最初の一手は?', options: ['正解', '誤答A', '誤答B'], why: '解説', protocol_ref: '3-1' }, o);
const mkCase = (n = 9, o = {}) => Object.assign({ title: '胸痛(70代男性)', tag: '循環器', difficulty: 1, stages: Array.from({ length: n }, () => stage()) }, o);

// ---------- 検証 ----------
test('validateCases: 正常な症例は通る', () => {
  assert.equal(SD.validateCases([mkCase()]), null);
});
test('validateCases: プロトタイプ形式(name/info/q/options/why だけ)も通る', () => {
  const proto = [{ title: 'x', tag: '外傷', stages: [{ name: '指令内容', info: '…', q: 'q', options: ['a', 'b', 'c'], why: 'w' }] }];
  assert.equal(SD.validateCases(proto), null);
});
test('validateCases: 異常系はメッセージを返す', () => {
  assert.match(SD.validateCases({}), /配列/);
  assert.match(SD.validateCases([{ stages: [] }]), /title/);
  assert.match(SD.validateCases([mkCase(0)]), /stages/);
  assert.match(SD.validateCases([mkCase(1, { difficulty: 5 })]), /difficulty/);
  assert.match(SD.validateCases([mkCase(1, { stages: [stage({ q: '' })] })]), /q\(質問\)/);
  assert.match(SD.validateCases([mkCase(1, { stages: [stage({ options: ['a'] })] })]), /options/);
  assert.match(SD.validateCases([mkCase(1, { stages: [stage({ options: ['a', ''] })] })]), /空の選択肢/);
  assert.match(SD.validateCases([mkCase(1, { stages: [stage({ options: ['a', 'a'] })] })]), /同じ内容/);
  assert.match(SD.validateCases([mkCase(1, { stages: [stage({ options: ['1', '2', '3', '4', '5', '6', '7'] })] })]), /options/);
  assert.match(SD.validateCases([mkCase(1, { stages: [stage({ protocol_ref: 5 })] })]), /protocol_ref/);
  assert.match(SD.validateCases([mkCase(21)]), /20個まで/);
});
test('validateCases: 長すぎる文字列を弾く', () => {
  assert.match(SD.validateCases([mkCase(1, { title: 'あ'.repeat(81) })]), /title/);
  assert.match(SD.validateCases([mkCase(1, { stages: [stage({ info: 'あ'.repeat(601) })] })]), /info/);
});

test('normalizeCase: 場面名の補完・既定値・branch の持ち回り', () => {
  const c = SD.normalizeCase({ title: ' t ', stages: [{ q: 'q', options: ['a', 'b'], branch: { on: 'wrong' } }, { q: 'q2', options: ['a', 'b'], protocol_ref: '' }] });
  assert.equal(c.title, 't');
  assert.equal(c.difficulty, 1);
  assert.equal(c.stages[0].name, '指令内容');
  assert.equal(c.stages[1].name, '現場の状況');
  assert.equal(c.stages[1].protocol_ref, null);
  assert.deepEqual(c.stages[0].branch, { on: 'wrong' });
});

test('reviewHints: 場面数・根拠なし・正解だけ長い', () => {
  const long = '正解は非常に長い文章で、あらゆる要素を詳しく説明しているので見た目で当たりと分かる';
  const c = SD.normalizeCase(mkCase(2, { stages: [stage({ options: [long, '短い', '短い2'], protocol_ref: null }), stage({ why: '' })] }));
  const h = SD.reviewHints(c).join('\n');
  assert.match(h, /場面数が2個/);
  assert.match(h, /場面1: プロトコール根拠/);
  assert.match(h, /場面1: 正解だけが長く/);
  assert.match(h, /場面2: 解説/);
  assert.deepEqual(SD.reviewHints(SD.normalizeCase(mkCase())), []);
});

// ---------- 個人情報の検出 ----------
test('detectPII: 電話・郵便・メール・住所・氏名・生年月日', () => {
  assert.ok(SD.detectPII('連絡先は 090-1234-5678 です').includes('電話番号らしき数字'));
  assert.ok(SD.detectPII('０８６−２３４−５６７８').includes('電話番号らしき数字'));
  assert.ok(SD.detectPII('〒700-0001').includes('郵便番号'));
  assert.ok(SD.detectPII('a.b@example.com').includes('メールアドレス'));
  assert.ok(SD.detectPII('岡山県倉敷市').includes('住所らしき地名'));
  assert.ok(SD.detectPII('山田さんが倒れた').includes('氏名らしき表記(〇〇さん・様)'));
  assert.ok(SD.detectPII('氏名: 山田太郎').includes('氏名の記載'));
  assert.ok(SD.detectPII('1950年3月4日生').includes('生年月日'));
});
test('detectPII: 電話番号は電話番号としてだけ検出し、番地とは重複しない', () => {
  assert.deepEqual(SD.detectPII('090-1234-5678'), ['電話番号らしき数字']);
  assert.ok(SD.detectPII('3丁目5番地').includes('番地らしき表記'));
  assert.ok(SD.detectPII('2番12号').includes('番地らしき表記'));
});
test('detectPII: プロトコール項番・日付・バイタルは誤検出しない', () => {
  assert.deepEqual(SD.detectPII('根拠: 項番 3-1-2、4-2-1 に従う'), []);
  assert.deepEqual(SD.detectPII('令和7年11月、2026-11-07 の改訂版'), []);
  assert.deepEqual(SD.detectPII('血圧 100/64、脈 110、SpO2 93%、体温 36.5℃、JCS 100'), []);
});
test('detectPII: 属性だけの記述は警告しない', () => {
  assert.deepEqual(SD.detectPII('70代男性、胸痛。SpO2 93%、血圧 100/64、脈 110'), []);
  assert.deepEqual(SD.detectPII('妻から通報「胸が痛いと言っている」。自宅2階'), []);
});
test('casePII: 症例全体を走査する', () => {
  const c = SD.normalizeCase(mkCase(1, { stages: [stage({ info: '連絡先 03-1234-5678' })] }));
  assert.ok(SD.casePII(c).includes('電話番号らしき数字'));
});

// ---------- ドリルの進行 ----------
test('prepareRun: 正解は常に1つで、origin=0 が正解', () => {
  const c = SD.normalizeCase(mkCase());
  for (let n = 0; n < 50; n++) {
    const run = SD.prepareRun(c);
    assert.equal(run.length, 9);
    run.forEach((st) => {
      assert.equal(st.opts.length, 3);
      assert.equal(st.opts.filter((o) => o.ok).length, 1);
      assert.equal(st.opts.find((o) => o.ok).origin, 0);
      assert.deepEqual(st.opts.map((o) => o.origin).sort(), [0, 1, 2]);
    });
  }
});
test('prepareRun: シャッフルで位置が偏る(固定でない)', () => {
  const c = SD.normalizeCase(mkCase(1));
  const pos = new Set();
  for (let n = 0; n < 100; n++) pos.add(SD.prepareRun(c)[0].opts.findIndex((o) => o.ok));
  assert.equal(pos.size, 3);
});
test('shuffle: 元の配列を壊さず、要素は同じ', () => {
  const a = [1, 2, 3, 4, 5];
  const b = SD.shuffle(a);
  assert.deepEqual(a, [1, 2, 3, 4, 5]);
  assert.deepEqual(b.slice().sort(), a);
});

test('summarize: 得点・平均秒・最遅場面', () => {
  const s = SD.summarize([{ score: 1, ms: 2000 }, { score: 0.5, ms: 4000 }, { score: 0, ms: 10000, timeout: true }]);
  assert.equal(s.sum, 1.5);
  assert.equal(s.total, 3);
  assert.equal(s.pct, 50);
  assert.equal(s.avg, 5.3);
  assert.equal(s.slowest, 2);
  assert.deepEqual(SD.summarize([]), { sum: 0, total: 0, pct: 0, avg: 0, slowest: -1 });
});

// ---------- 集計 ----------
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).toISOString();
const sess = (iso, o = {}) => Object.assign({ createdAt: iso, score: 7, total: 9, avgTime: 6, tag: '循環器', results: [] }, o);
const today = new Date(2026, 10, 7, 20); // 2026-11-07(土)

test('streak: 連続日数と、今日まだでも昨日までなら継続', () => {
  const s = [sess(at(2026, 11, 7)), sess(at(2026, 11, 6)), sess(at(2026, 11, 5)), sess(at(2026, 11, 3))];
  assert.equal(SD.streak(s, today), 3);
  assert.equal(SD.streak([sess(at(2026, 11, 6)), sess(at(2026, 11, 5))], today), 2);
  assert.equal(SD.streak([sess(at(2026, 11, 4))], today), 0);
  assert.equal(SD.streak([], today), 0);
});
test('weekCount: 月曜はじまり', () => {
  // 2026-11-07 は土曜 → 週の開始は 11-02(月)
  const s = [sess(at(2026, 11, 2)), sess(at(2026, 11, 7)), sess(at(2026, 11, 7)), sess(at(2026, 11, 1))];
  assert.equal(SD.weekCount(s, today), 3);
});
test('heatmap: 週数×7日、未来日はfuture', () => {
  const h = SD.heatmap([sess(at(2026, 11, 7))], today, 4);
  assert.equal(h.length, 28);
  assert.equal(h[h.length - 1].date, '2026-11-08'); // 日曜(今週の最終日)
  assert.equal(h[h.length - 1].future, true);
  assert.equal(h.find((x) => x.date === '2026-11-07').n, 1);
  assert.equal(h[0].date, '2026-10-12');
});
test('best: 最高正答率と最速平均', () => {
  const b = SD.best([sess('a', { score: 5, total: 9, avgTime: 8 }), sess('b', { score: 9, total: 9, avgTime: 12 }), sess('c', { score: 3, total: 9, avgTime: 4.5 })]);
  assert.deepEqual(b, { pct: 100, avg: 4.5 });
});
test('weakness: 場面別・カテゴリ別に正答率の低い順', () => {
  const r = (name, score, ms) => ({ name, score, ms });
  const s = [
    sess('a', { tag: '循環器', results: [r('指令内容', 1, 3000), r('活動方針', 0, 9000)] }),
    sess('b', { tag: '外傷', results: [r('指令内容', 1, 5000), r('活動方針', 0.5, 7000)] })
  ];
  const st = SD.weakness(s, 'stage');
  assert.equal(st[0].key, '活動方針');
  assert.equal(st[0].n, 2);
  assert.equal(st[0].rate, 0.25);
  assert.equal(st[0].avg, 8);
  const tg = SD.weakness(s, 'tag');
  assert.equal(tg.length, 2);
  assert.equal(tg[0].key, '循環器'); // (1+0)/2 = 0.5 は 外傷 (1+0.5)/2 = 0.75 より低い
  assert.equal(tg[0].rate, 0.5);
  assert.equal(tg[1].key, '外傷');
  assert.deepEqual(SD.weakness([], 'stage'), []);
});
test('goalProgress: 週の回数と平均秒', () => {
  const s = [sess(at(2026, 11, 3), { avgTime: 6 }), sess(at(2026, 11, 5), { avgTime: 8 }), sess(at(2026, 10, 20), { avgTime: 30 })];
  const g = SD.goalProgress(s, { weekly: 2, avgSec: 8 }, today);
  assert.equal(g.week, 2);
  assert.equal(g.weekDone, true);
  assert.equal(g.avg, 7);
  assert.equal(g.avgOk, true);
  const g2 = SD.goalProgress([], { weekly: 3, avgSec: 8 }, today);
  assert.equal(g2.weekDone, false);
  assert.equal(g2.avg, null);
  assert.equal(g2.avgOk, false);
  assert.equal(SD.goalProgress(s, {}, today).weekDone, false);
});

// ---------- 書き出し・接続コード ----------
test('toCsv: BOM・ヘッダー・エスケープ・数式対策', () => {
  const csv = SD.toCsv([{ createdAt: '2026-11-07T01:00:00.000Z', caseTitle: '=cmd,"x"', tag: 'a', difficulty: 2, mode: 'speak', timeLimit: 10, note: 'n', results: [{ name: '指令内容', score: 1, ms: 2500, timeout: false }] }]);
  assert.ok(csv.startsWith('﻿日時,'));
  const lines = csv.split('\r\n');
  assert.equal(lines.length, 2);
  assert.match(lines[1], /"'=cmd,""x"""/);
  assert.match(lines[1], /声出し/);
  assert.match(lines[1], /2\.5/);
});
test('接続コード・引き継ぎコードの往復', () => {
  const c1 = SD.encodeCode({ u: 'https://script.google.com/macros/s/AAA/exec', k: 'key123' });
  assert.deepEqual(SD.decodeCode(c1), { u: 'https://script.google.com/macros/s/AAA/exec', k: 'key123' });
  const c2 = SD.encodeCode({ u: 'https://script.google.com/x', k: 'k', uid: 'u1', tok: 't1', nick: 'ニシコリ' });
  assert.deepEqual(SD.decodeCode('  ' + c2.slice(0, 10) + '\n' + c2.slice(10) + ' '), { u: 'https://script.google.com/x', k: 'k', uid: 'u1', tok: 't1', nick: 'ニシコリ' });
  assert.throws(() => SD.decodeCode('!!!'));
  assert.throws(() => SD.decodeCode(SD.encodeCode({ u: 'http://insecure', k: 'k' })));
  assert.throws(() => SD.decodeCode(SD.encodeCode({ u: 'http://127.0.0.1.evil.com/api', k: 'k' })));
  assert.throws(() => SD.decodeCode(SD.encodeCode({ u: 'https://script.google.com/x', k: '' })));
  assert.equal(SD.decodeCode(SD.encodeCode({ u: 'http://127.0.0.1:8080/api', k: 'k' })).u, 'http://127.0.0.1:8080/api'); // 開発用の自端末だけ許可
  assert.throws(() => SD.decodeCode(SD.encodeCode({ k: 'k' })));
});
