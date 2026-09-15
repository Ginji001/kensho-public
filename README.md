# 懸賞応募アシスト（公開版）

**公開URL:** https://ginji001.github.io/kensho-public/

ログイン不要の静的PWAです。応募状況とお気に入りは各ブラウザのlocalStorageだけに保存し、応募は各公式サイトで利用者が行います。

## 公開版で実装済み

- キーワード・ジャンル・掲載元・優先度・応募状態・締切・当選人数・条件・賞品タイプで絞り込み
- おすすめ・当選人数・締切・新着・条件の軽さ順
- 応募済み／条件待ち／見送り／お気に入りの端末内保存
- 日本時間の締切判定、明示時刻の締切にも対応
- HTTPS許可ドメインのみ許可し、内部IP・認証付きURL・秘密値を拒否
- manifest、192/512 PNG、Service Worker、オフライン一覧
- GitHub PagesによるHTTPS公開
- 6時間ごとのリンク再確認・期限処理・再配信
- @cosme / Monipla / RoomClip の新規候補を6時間ごとに自動収集
- 新規候補は締切・当選人数・条件を自動抽出し、安全基準を満たせば自動掲載（条件欄に「自動抽出」と表示）
- 判定できない候補は `review-queue.json` に保留し、6時間ごとに最大12回自動で再判定
- 公開対象は確認済みデータのみ。検索ページへのフォールバックは行わない
- 公開ファイルは `public/` のみ。個人版API・state.json・Tailscale内部URLには接続しない

## 運用（全自動）

6時間ごと（およびmain更新時）にGitHub Actionsが以下を自動実行します。手動作業は不要です。

1. `npm run discover` — @cosme / モニプラ / RoomClip から新規候補URLを収集
2. `npm run promote` — 候補ページから締切・当選人数・条件・ジャンルを抽出し、次の基準で自動判定
   - 許可ドメイン内・HTTPS・公開IPのみ／LIPSなど手動確認対象は除外
   - ページが取得でき、タイトルがあり、終了表示がない
   - 締切が過去でない（締切不明の場合は21日で自動非表示）
   - 個人情報・秘密値らしき文字列を含まない
   - 合格 → `overrides/data/auto-campaigns.json` に追加して公開／判定不能 → `review-queue.json` で再判定（約3日で自動却下）
3. `npm run refresh` — 手動確認済み＋自動掲載の全案件のリンク・終了状態を確認
4. `npm run prune` — 締切を3日過ぎた・終了した自動掲載を削除
5. ビルド・秘密値チェック → 自動掲載データをリポジトリへコミット → Pages配信

`data/reviewed-campaigns.json`（zip内）は手動で精査した案件の正本です。自動掲載より優先されます。
自動掲載を止めたい案件は `overrides/data/auto-campaigns.json` の該当行に `"hidden": true` を付けてください。
各実行の結果（公開件数・保留候補）はActionsの実行サマリーに表示されます。

LIPSは自動アクセス対象外です。公式画面を管理者が確認した案件だけを有効化します。

## プライバシーと安全性

公開版は氏名・住所・電話・メール・Cookie・セッショントークン・個人応募履歴を収集しません。公開JSONは許可フィールドだけを生成し、配信前にも内部IP・Tailscale URL・秘密値パターンを自動検査します。

自動応募、自動送信、CAPTCHA回避、OTP自動突破、複数アカウント大量応募、自動購入・決済は実装しません。

## 検証済み

- GitHub Actions build / deploy
- 公開URL HTTP 200
- MacBook Brave 実画面
- Windows Brave 自動UIテスト
- manifest / Service Worker / 192・512pxアイコン
- オフライン再表示
- モバイル390pxレイアウト
- JavaScript pageerror 0
- 公開データの内部URL・秘密値ガード

iPhone / Androidの「ホーム画面に追加」最終タップは各端末のOS UI操作が必要ですが、PWA要件とモバイル表示は公開環境で検証しています。
