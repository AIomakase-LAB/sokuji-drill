# 即時判断ドリル(画面)

救急活動の即時判断を練習する訓練アプリ。画面はこのリポジトリ(GitHub Pages)、データ API は `AIomakase-LAB/gas-projects` の `projects/sokuji-drill`(Google Apps Script)。詳しくは README.md。

- 持ち主とは日本語で話す。専門用語には短い説明をつける。
- 持ち主が「全部アップデートして」などと言ったら、`.claude/skills/update-all/SKILL.md` の手順(テスト → API の PR・マージ → 画面の公開 → 確認 → 報告)で進める。テスト失敗や想定外の差分があれば、そこで止めて報告する。
- 画面のファイルを変えたら `version.js` と `sw.js` の版を上げる。
- 医療内容(症例の正解・解説)は創作しない。根拠は所属のMCプロトコールだけ。
- 実在の傷病者の個人情報は扱わない。
