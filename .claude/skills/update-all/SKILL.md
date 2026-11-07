---
name: update-all
description: 即時判断ドリルの画面(このリポジトリ)と API(gas-projects の projects/sokuji-drill)を、テストしてから本番まで更新する手順。持ち主が「全部アップデートして」「全部更新して」「本番に反映して」などと言ったとき、または /update-all で使う。
---

# 全部アップデート(即時判断ドリル)

持ち主の「全部アップデートして」は、下の手順1〜7(テスト → 画面の公開 → API の PR 作成・マージ → 確認 → 報告)をひと続きで行う依頼として扱う。
途中でテストが失敗したとき、想定外の差分(他のプロジェクトの変更など)があるとき、手順にない操作が必要になったときは、そこで止めて報告し、持ち主の判断を待つ。

## 対象
| 部分 | リポジトリ | 本番に出る仕組み |
|---|---|---|
| 画面 | `AIomakase-LAB/sokuji-drill`(このリポジトリ) | `main` に push → GitHub Pages が自動で公開(https://aiomakase-lab.github.io/sokuji-drill/) |
| API | `AIomakase-LAB/gas-projects` の `projects/sokuji-drill` | `main` にマージ → GitHub Actions「GAS Push & Deploy」が clasp push + 本番デプロイ(`deploy.json` の ID) |

## 手順
1. **両方のリポジトリを用意する**: このセッションに `AIomakase-LAB/sokuji-drill` と `AIomakase-LAB/gas-projects` が付いているか確認する(なければ持ち主に付けてもらう)。作業用コピーを最新にする(`git fetch origin main`)。
2. **何が変わったかを確認する**: 両方の `git status` と `origin/main` との差分を見る。変更がない側は飛ばす。`gas-projects` は `projects/sokuji-drill` 以外に触れない(他のアプリが入っている)。
3. **テストする**(1つでも失敗したら止めて報告):
   ```bash
   cd sokuji-drill && TZ=Asia/Tokyo node --test test/logic.test.js
   cd gas-projects/projects/sokuji-drill && SD_LOGIC=<sokuji-drillの場所>/logic.js node --test test/api.test.js
   cd sokuji-drill && GAS_DIR=<gas-projectsの場所>/projects/sokuji-drill TZ=Asia/Tokyo node test/e2e.js
   ```
4. **画面を変えたときは版を上げる**: `version.js` の `SD_VERSION` と `sw.js` の `CACHE` を同じ番号で上げる(修正なら v0.1.0 → v0.1.1、機能追加なら v0.2.0)。上げないとスマホに古い画面が残る。
5. **API を公開する**(API を変えたとき。画面より先に行う): `gas-projects` で `claude/` から始まるブランチにコミットして push(ブランチでは clasp push だけが走る)→ main 向けの PR を作る → PR をマージ → main の「GAS Push & Deploy」が success で、ログに `sokuji-drill : push + デプロイ完了` があることを確認する。
6. **画面を公開する**(画面を変えたとき): `sokuji-drill` の `main` にコミットして push → 「pages build and deployment」が success になるのを確認する。
7. **報告する**: 変えた内容、新しい版番号、テスト結果、Actions の結果、PR の URL を短く日本語で。iPhone 実機で確かめてほしい点があれば添える。

## 守ること
- `.clasprc.json`・接続コードなどの秘密情報はコミットしない
- `gas-projects` の他のプロジェクト(workout-menu、triage-system、grid-map)には触れない
- 検証ルールを変えたら、画面の `logic.js`(`validateCase`)と API の `code.js`(`validateCase_`)の両方を直す(食い違うとテストが失敗する)
- スプレッドシートの列は見出し名で読む。列の追加はよいが、列名の変更・削除はしない
