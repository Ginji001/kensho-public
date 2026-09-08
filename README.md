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
- 新規候補はActionsの `discovery-queue` artifact として管理者レビュー用に保存
- 公開対象は確認済みデータのみ。検索ページへのフォールバックは行わない
- 公開ファイルは `public/` のみ。個人版API・state.json・Tailscale内部URLには接続しない

## 運用

1. `data/reviewed-campaigns.json` が公開候補の正本です。
2. `npm run discover` が公開サイトから新規候補URLを収集します。
3. 新規候補は公式ページを確認してから正本へ昇格します。
4. `npm run refresh` がリンク・終了状態を更新します。
5. main更新または6時間ごとのGitHub Actionsでテスト・更新・Pages配信を行います。

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
