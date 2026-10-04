# レビュー課題一覧（review-backlog.md）

3名体制のレビュー（2026-10-04 実施）の統合結果。重要度順に並べ、各タスクに「触るファイル」を必ず記載する。

- 調査・レビューのみで、**この一覧の作成時点でソースコードは一切変更していない**。
- 出典: `P` = privacy-auditor（流出経路＋ポリシー/規約の整合）、`A` = accuracy-reviewer（判定精度）、`C` = code-reviewer（`origin/sub...HEAD` 差分レビュー）。
- 「推測」と明記された項目は未実測の仮説。着手前に実測で確認すること。

## 検証済みの前提（レビュー時の実測値）

| 項目 | 結果 |
|---|---|
| `git diff --stat origin/sub...HEAD` | 30 files, +2108 / -1806 |
| `tsc --noEmit` | 27 件（supabase-test 1 / app/debug 24 / use-screen-capture 1 / debug-utils 1）= CLAUDE.md の既知と完全一致、新規エラーなし |
| 翻訳キー件数 | ja 612 / en 612 で一致。`en.ts` の日本語は `as_language: 'Language / 言語'` の1件のみ（意図的） |
| 外部 LLM 呼び出し | 0 件。推論は全経路が `lib/local-ai.ts` の `runLocalPrompt` 経由 |
| Supabase Storage アップロード | 0 件（`storage.from(` のヒットなし） |
| 画像のバイト列が端末外へ出る経路 | **発見されず**（`toDataURL` / `readAsDataURL` / 画像の base64 化は未使用。`canvas.toBlob` → `URL.createObjectURL` のみ） |
| 解析ループの `alert()` / `confirm()` | なし（ヒットは「使わない理由」のコメントのみ） |
| 削除済みファイルの復活 | なし |
| テスト | テストファイル 0 件、テスト基盤（vitest / jest / testing-library）未導入 |
| 未実行 | `next build` と `grep -rl "SERVICE_ROLE\|CRON_SECRET" .next/static/`（`tsc` と tsbuildinfo を共有するため並列禁止。着手時に実行すること） |

---

## 重要度：高

### H-1. 利用規約の Toggl トークン記述が実装と逆（日英とも）

規約は「API トークンは当社サーバーには保存されない」と断言しているが、実装は Supabase（= サーバー側 DB）を正として平文で保存し、サーバー側で読み出して Toggl に Basic 認証している。自サイトのプライバシーポリシー（保存場所を Supabase と正しく記載）とも矛盾する。**事実と異なる開示**なので最優先。

- 根拠: `app/terms/page.tsx:200`（第5条(2)）、`app/terms/en/page.tsx:218` 付近 / 実装は `app/page.tsx:308`、`app/api/toggl-current/route.ts:77`、`lib/toggl-credentials.ts:3-7`
- 修正案: 「行レベルセキュリティ配下の当社データベース（Supabase）に本人のみアクセス可の形で保存する。DB に保存できない環境に限りローカルストレージへ一時退避する」に日英同時で書き換える。
- 触るファイル: `app/terms/page.tsx`、`app/terms/en/page.tsx`
- 出典: P-1

### H-2. `runLocalPrompt` の `timeoutMs` がモデルのダウンロードをカバーせず、推論キューの先頭が無制限にブロックされうる

`promptOnce` が `getBaseSession` / `lm.create` に `signal` を渡していないため、`AbortSignal.timeout` がダウンロード待ちを打ち切れない。推論は同時1件に直列化されているので、後続の全推論が停止する。レポート生成経路（`handleGenerateReport` / `handleGenerateDailyReport` / `handleAutoGenerateReport`）は解析ループと違って `isLocalAiReady` を確認しないため、モデル未ダウンロード端末ではボタン一発で数 GB のダウンロードが始まり、進捗 UI も中断手段もない。CLAUDE.md の「`timeoutMs` は実行開始時点から数える」という記述も、実際には「`create()` 完了後から」になっている。

- 根拠: `lib/local-ai.ts:152-155`、`lib/local-ai.ts:174-196`、`lib/local-ai.ts:93-102`、`lib/local-ai.ts:125-131` / 到達経路は `app/page.tsx:436`、`app/page.tsx:485`、`components/work-log-panel.tsx:579`
- 修正案: (a) `getBaseSession` / `lm.create` に `signal` を渡す。(b) レポート生成の入口で `getLocalAiState().availability !== "available"` なら推論せず即フォールバックへ落とし、ダウンロード起動は `components/local-ai-settings.tsx` の明示ボタンだけに限定する。
- 触るファイル: `lib/local-ai.ts`、`lib/local-reports.ts`、`app/page.tsx`、`components/work-log-panel.tsx`（必要なら `CLAUDE.md` の記述も）
- 出典: C-1

### H-3. `work_category` 不一致時のフォールバックが「一覧の末尾」＝ユーザーが最後に追加したカテゴリになる

`fallbackCategory = ctx.categories[ctx.categories.length - 1]`。カテゴリ追加は末尾追加なので、ユーザーが1つ足した時点で「判定不能時の既定」がそのカテゴリに変わる。「未分類」自体も削除可能。判定不能な回がすべてユーザーの新規カテゴリに計上され、集計と週次レポートの内訳が壊れる。`includes` は完全一致のみで trim も大小区別もしない。

- 根拠: `lib/analysis-prompt.ts:109-110` / 末尾追加は `components/activity-breakdown.tsx:372`、削除は `:377`、集計への伝播は `lib/log-stats.ts:60`
- 修正案: フォールバックを「未分類／その他／Other／Uncategorized」のいずれかに固定し、見つからなければ `"未分類"`。比較前に `String(x).trim()` と大小無視の比較を挟む。本来は `ctx.fallbackWorkCategory` を追加して呼び出し側から i18n 済み文言を渡す形（既存の `fallbackDetails` / `reasonUnknown` と同じ設計）。
- 触るファイル: `lib/analysis-prompt.ts`、`components/work-log-panel.tsx`、`app/local-ai-check/page.tsx`
- 出典: A-B-1

### H-4. `task_alignment` / `confidence` が文字列や 0〜100 スケールで返ると判定が反転する

`typeof === "number"` の厳格判定のため `"0.1"` は 0.5 に化け（明白な脱線の偽陰性）、`10` や `80` は `Math.min(1, …)` で 1.0 になり `focus_score` 100 かつ脱線扱いにならない（偽陰性）。`focus_score` は平均値と週次配信にそのまま入るので集計が恒常的に水増しされる。同リポジトリの `normalizeSummaryReport` は `Number()` coercion しており非対称。

- 根拠: `lib/analysis-prompt.ts:114-116`、`:143-146` / 非対称の比較対象は `lib/report-builders.ts:172-175`
- 修正案: `toRatio(v, def)` 共通ヘルパー（文字列の `Number()` 化、`%` 除去、`n > 1` のときのみ /100、0〜1 クランプ）を作り `task_alignment` と `confidence` の両方に適用。
- 触るファイル: `lib/analysis-prompt.ts`（`lib/report-builders.ts` と共通化するなら両方）
- 出典: A-B-2

### H-5. `task_alignment < 0.35` の強制 distracted が、ユーザー定義ルールもモデルの `is_distracted: false` も上書きする（誤報の主因）

プロンプトは `userRules` を「最優先で尊重」と宣言しているのに、正規化側は数値だけで無条件に distracted へ上書きする。「Amazon は出品作業なので作業中扱い」というルールをモデルが守っても、プロンプトが「ショッピング・SNS・動画は 0.0〜0.2」と指示しているため強制 distracted に戻り、通知とアラート音まで鳴る。ユーザーから見ると「ルールを登録しても誤報が直らない」。

- 根拠: `lib/analysis-prompt.ts:117`、`:123`、`:150`、宣言は `:46` / 通知は `components/work-log-panel.tsx:547`
- 修正案: `forceDistracted` を「モデルが `is_distracted` を返さなかったときだけの補完」に格下げする（`const modelSaid = typeof analysis?.distraction_check?.is_distracted === "boolean"`）。下限を残すなら `normalizeAnalysis` に `hasUserRules: boolean` を渡し、ルール有効時は閾値を下げるか強制を無効化する。
- 触るファイル: `lib/analysis-prompt.ts`、`components/work-log-panel.tsx`、`app/local-ai-check/page.tsx`（シグネチャ変更のため呼び出し側すべて）
- 出典: A-1

### H-6. プロンプト内の3つの規則が互いに矛盾し、優先順位が小型モデルに解けない

同一リストの中で「予定作業に関わらず必ず distracted」「0.35未満の場合のみ true」「ユーザールールを最優先」の3通りの最上位権限が宣言されている。さらにハードリスト（ショッピング/SNS/動画）が「予定作業がまさにその種類」のケース（SNS 運用、EC 出店、動画編集、競合調査）をすべて踏み抜く。

- 根拠: `lib/analysis-prompt.ts:54-60`
- 修正案: 判定の優先順位を番号付きで明示し（1. ユーザールール → 2. 予定作業と同分野は productive → 3. 無関係な娯楽系は distracted → 4. 判断不能は neutral）、「必ず」「最優先」といった強い語は1箇所だけにする。推測: 小型モデルは競合する指示を近接・末尾バイアスで解決しがち（未実測）。
- 触るファイル: `lib/analysis-prompt.ts`
- 出典: A-2

---

## 重要度：中

### M-1. プライバシーポリシーの Toggl トークン削除タイミングが誤り（日英とも）

「ユーザーによるブラウザ削除時」「User clears browser local storage」と書かれているが、実体は Supabase にあるのでブラウザのストレージを消しても消えない。同一文書の 1-3（Supabase 保存）と矛盾。H-1 と同じ修正セットで扱う。

- 根拠: `app/privacy/page.tsx:268-270`、`app/privacy/en/page.tsx:282-284`
- 修正案: 「設定画面でのクリア時・アカウント削除時」に直す。
- 触るファイル: `app/privacy/page.tsx`、`app/privacy/en/page.tsx`
- 出典: P-2

### M-2. スクリーンショット URL の DB 書き込みガードが `blob:` 限定の拒否リスト

`blob:` で始まるものだけを落とすため、`data:image/...`（画像バイト列そのもの）は素通りして `work_logs.screenshot_url` / `report_data.source_screenshots` に書き込まれる。描画側が `data:image/` を明示的に許容しており、「保存済み行に `data:` が入り得る」前提がコードベースに残っている。**現行の生成経路は `createObjectURL` のみなので今は漏れない**が、最重要の不変条件が1箇所の前方一致拒否リストだけで守られている（Supabase は旧クラウド版と共用）。

- 根拠: `lib/supabase.ts:532-545` / 描画側は `components/reports-tab.tsx:92`、`components/work-summary-report.tsx:32`
- 修正案: 拒否リストを許可リストに反転する。`createWorkLog` で `screenshot_url` と `report_data.source_screenshots` を常に削除する（このブランチで端末外に画像 URL を持つ理由がない）か、`https://` 以外を一律除去。`hooks/use-supabase-data.ts:367` の `DB_SAFE_FIELDS` と同じ方式に揃える。
- 触るファイル: `lib/supabase.ts`（必要なら `components/work-log-panel.tsx` の `screenshot_url` 受け渡しも）
- 出典: P-3（C-16 と同一箇所。privacy-auditor は「現行挙動は `app/privacy/page.tsx:172-176` の文面と整合」と確認済みで、文面の修正は不要）

### M-3. 週次レポートの送信内容について、コードコメントとポリシー第4条の文言が実装を否定している

本文には `work_logs.activity`（画面解析結果のテキスト）の上位3件が載るが、`lib/weekly-report.ts` 冒頭コメントは「ログの生テキストは含めない」、ポリシー第4条は「画面解析用のデータはいずれの事業者にも送信しません」と書いている。同じポリシーの 1-4 は正しく開示しているので、文書内で不整合。**送信内容は CLAUDE.md の仕様どおりなので実装変更は不要**、文書とコメントのみ修正。

- 根拠: `lib/weekly-report.ts:10-12`（コメント）、`:155-158`、`:212-215` / `app/privacy/page.tsx:239`、`app/privacy/en/page.tsx:252-253` / 正しい開示は 1-4
- 修正案: コメントを「集計値と脱線先の活動名（`work_logs.activity`）上位3件を載せる。`details`・`distraction_check.reason`・画像 URL は載せない」に直す。ポリシー第4条の断定文に「週次レポートを有効にした場合に限り活動名が Resend / Slack へ送信される」旨の例外を日英同時で追記。
- 触るファイル: `lib/weekly-report.ts`、`app/privacy/page.tsx`、`app/privacy/en/page.tsx`
- 出典: P-4

### M-4. `getBaseSession` の in-flight ガードが言語でキー分けされていない

`baseSessions` は言語ごとなのに `creating` は1本しかないため、ja のセッション生成中に en の推論が入ると ja のセッションが返る。`expectedOutputs.languages` は言語ごとに違うので、英語 UI で日本語出力（逆も）が返る。設定で言語は実行中に切り替えられるため、ダウンロード直後に切り替えると踏む。

- 根拠: `lib/local-ai.ts:82-87`、`lib/local-ai.ts:27-33`
- 修正案: `creating` を `Map<string, Promise<LanguageModelSession>>` にし、`finally` でそのキーだけ削除する。
- 触るファイル: `lib/local-ai.ts`
- 出典: C-2

### M-5. `extractJsonObject` の貪欲マッチが、スキーマ無し解析の唯一のパーサになっている

`/\{[\s\S]*\}/` は最初の `{` から最後の `}` までを1個の JSON とみなす。解析呼び出しは意図的に `responseConstraint` を付けないので形式保証はこの関数だけ。プロンプト内に JSON テンプレートがあるため、モデルがテンプレートを復唱する／後ろに `{` を含む補足を付けると `JSON.parse` が失敗し、そのキャプチャは丸ごと破棄される。解析成功まで `prevImageDataRef` が更新されないので、失敗が続くと差分スキップのベースも進まない（精度ではなくログのカバレッジが落ちる）。

- 根拠: `lib/local-ai.ts:205` / スキーマ無しの意図は `components/work-log-panel.tsx:481-490`、破棄は `:497-502`、テンプレートは `lib/analysis-prompt.ts:63-75`
- 修正案: 段階的に試す。(1) 現行の貪欲マッチ → (2) 先頭 `{` から括弧の深さを数えて最初に深さ0へ戻る位置まで切り出す（文字列リテラル内の括弧を無視） → (3) 末尾カンマ除去と閉じ括弧補完を1回 → (4) `null`。なお (4) 到達時に「判定不能ログ」を保存する案は採らない（現行の「保存しない」が安全側）。
- 触るファイル: `lib/local-ai.ts`
- 出典: C-3 / A-B-7（両者一致）

### M-6. まとめレポート生成と画面解析が同じ1枠を取り合い、レポートのたびに解析が間引かれる

推論は同時1件に直列化されている。自動まとめレポートはログ3件ごとに発火し `analyzingRef` を取らない。一方 `analyzeScreenshot` は「キューに入る前」に再入ガードを立てるため、レポート実行中のキャプチャはキューで待ちながら `analyzingRef = true` を保持し、その間のキャプチャティックはすべて捨てられる。UI は「解析中」のままログだけが出ない。`timeoutMs` は順番待ちを含めないので待ち時間は打ち切られない。

- 根拠: `components/work-log-panel.tsx:579-641`、`:411-577`、`:418-424`、`:404` / `lib/local-ai.ts:125-131`、`:141-144` / 日報は `lib/report-builders.ts:287` の 60 件プロンプト
- 推測: レポートに10秒前後かかるとすると30秒間隔で1ティック前後の取りこぼし、日報はさらに長い（未実測）。
- 修正案: (1) 再入ガードを「キュー待ちの間」保持せず、`enqueue` 側に「解析は1件だけ積む・既に積まれていたら新しい方を捨てる」責務を移す / (2) `enqueue` に優先度を持たせ解析をレポートより先に通す / (3) 最小変更として自動レポートの発火を `isAnalyzing === false` かつ直前キャプチャから一定時間空いたタイミングまで遅らせる（`hasAutoGeneratedRef` の節目キー管理があるので節目は失われない）。
- 触るファイル: `components/work-log-panel.tsx`、`lib/local-ai.ts`
- 出典: C-4

### M-7. 純関数3ファイルにテストが無く、テスト基盤そのものが無い

旧サーバールート1020行ぶんの正規化・フォールバック・スキーマ整形をクライアントへ移したのにテストが1件もない。入力はモデルの非定型出力で受け口はすべて `analysis: any` / `raw: any`。`ignoreBuildErrors: true` のため型チェックでもビルドでも守られていない。

- 根拠: `package.json` の scripts は build/dev/lint/start のみ、`vitest|jest|@testing-library|playwright` のヒット 0、テストファイル 0 件
- テストすべき順: (1) `normalizeAnalysis`（`lib/analysis-prompt.ts:108`。`task_alignment: 0` が 0.5 に化けない、文字列・欠落・NaN・範囲外のクランプ、`currentTask` 空で `forceDistracted` が立たない＝`3f556ec` の退行検知、`work_category` 一覧外、`category` の大文字・空白付き、`apps` の型混在と20件上限、`forceDistracted` 時の `category` 上書き）→ (2) `extractJsonObject`（`lib/local-ai.ts:199`。コードフェンス付き／前置き文付き／**JSON 2個**＝M-5 の退行検知／壊れた JSON／空文字列）→ (3) `sampleDailyLogs`（`lib/report-builders.ts:289`）→ (4) `normalizeSummaryReport`（`:171`）/ `normalizeDailyReport`（`:393`。`strArray` の空配列扱いが前者と非対称なのでどちらが仕様かをテストで固定）→ (5) フォールバック生成2関数 → (6) `buildDailyMarkdown`（`:336`）→ (7) `buildAnalysisPrompt`（`lib/analysis-prompt.ts:39`）
- 基盤: `package.json` / `pnpm-lock.yaml` の変更は CLAUDE.md で禁止なので、依存追加なしの `node --experimental-strip-types --test focus-guardian/lib/*.test.ts` を推奨。`local-reports.ts` は `LanguageModel` グローバルに依存するのでテスト対象から外し、`extractJsonObject` だけ `local-ai.ts` から import する（モジュール読み込み時にグローバルを参照しないので import は通る）。
- fixtures は**手で書いた合成データ**にする（実出力の `raw` には `details` 経由で画面内容が入るためコミットしない）。
- 触るファイル: 新規 `lib/analysis-prompt.test.ts`、`lib/report-builders.test.ts`、`lib/local-ai.test.ts`、`CLAUDE.md`（検証コマンドに1行追加）
- 出典: C-5（fixtures の方針は A-D-5）

### M-8. 閾値 0.35 をプロンプトに書いているため、モデルが閾値を意識した数値を返す

`task_alignment` は本来「一致度の素点」だが、閾値を教えると「結論を通すための値」になる。閾値はコード側にも書かれていて二重管理。推測: 0.3／0.4 付近に貼り付くか、`is_distracted` と整合させるため 0.1/0.9 に二値化する（未実測）。

- 根拠: `lib/analysis-prompt.ts:59` / コード側は `:117`
- 修正案: プロンプトから閾値の記述を削り「予定作業とどれくらい関係があるかを 0.0〜1.0 で」とだけ書く。判定はコード側に一元化。
- 触るファイル: `lib/analysis-prompt.ts`
- 出典: A-3

### M-9. `details` のフォールバックが「作業中」と断定してしまう

`details` が欠落した回は distracted と判定されていても詳細欄が「『○○』の作業中」になる。日報・まとめレポートは `details` をそのままモデルに食わせるので、下流に矛盾した説明が伝播する。

- 根拠: `components/work-log-panel.tsx:507`、`lib/analysis-prompt.ts:152` / 下流は `lib/report-builders.ts:205` 付近
- 修正案: フォールバックを常に `wlp_noDetails` にするか、`wlp_unknownScreen`（「画面の内容を判定できませんでした」）を新設（ja/en 両方に追加）。
- 触るファイル: `components/work-log-panel.tsx`、`lib/translations/ja.ts`、`lib/translations/en.ts`
- 出典: A-4

### M-10. `work_category` を番号で返させ、未使用の `ANALYSIS_SCHEMA` を整理する

英語 UI では「文章は英語で書け」と「一覧の表記をそのまま／翻訳しない」が同じ出力の中で衝突する（`DEFAULT_CATEGORIES` は日本語固定）。推測: `work_category` が英訳されて返り、その場合 H-3 のとおり全件がフォールバックへ落ちる（未実測。`/local-ai-check` を英語 UI で回せば確認可能）。あわせて `ANALYSIS_SCHEMA` は参照箇所ゼロのデッドコードで、解析経路では `runLocalPrompt` の「スキーマを外して再試行」が実質セッション再生成のみとして機能している。

- 根拠: `lib/analysis-prompt.ts:48`、`:62`、`:66`、`:17-37` / `lib/local-ai.ts:160`、`:182-193` / `components/activity-breakdown.tsx:19-26`、`app/local-ai-check/page.tsx:125`
- 修正案: (a) `work_category_index` として**番号で返させ**、正規化側で `categories[index-1]`、範囲外は「未分類」。表記ゆれと英訳を根本から消せる。(b) `ANALYSIS_SCHEMA` を削除し「解析ではスキーマを使わない」方針をコメントで一本化、再試行コメントも「セッション再生成のため」に直す。(c) 中期: プロンプト本体を `lang` で日英切り替え（`lib/report-builders.ts` の文言テーブル方式に揃える）。浅いフラットなスキーマを採用し直す案は `/local-ai-check` で成功率を実測してから。
- 触るファイル: `lib/analysis-prompt.ts`、`lib/local-ai.ts`、`components/work-log-panel.tsx`、`app/local-ai-check/page.tsx`
- 出典: A-5 / A-C-1

### M-11. `category` の表記ゆれが無言で neutral に落ち、脱線統計だけが過小になる

日本語プロンプトで英語 enum を要求しているため `"生産的"` `"脱線"` `"Productive."` `"distraction"` 等は neutral になる。`is_distracted` は別経路なので、**通知とアラート音は鳴るのに DB の category は neutral** という不整合が起き、週次レポートが実態より良く見える。

- 根拠: `lib/analysis-prompt.ts:132-133` / 集計への伝播は `lib/log-stats.ts:72-73`
- 修正案: 同義語マップ（`productive/生産的/作業中/work`、`distracted/distraction/脱線/気が散っている`、`neutral/中立/不明`）を置き、句読点・空白を除去して突き合わせる。「`is_distracted === true` かつ `category === "neutral"`」のときどちらを正とするかを1箇所で決める（推奨は category を distracted に寄せる。通知と保存値の食い違いの方が問題）。
- 触るファイル: `lib/analysis-prompt.ts`
- 出典: A-B-3

### M-12. `apps` が文字列やオブジェクトで返ると無言で空配列になる

`Array.isArray` 以外は `[]`。推測: スキーマ無し運用では `"apps": "Chrome, VS Code"` や `[{"name":"Chrome"}]` が混ざりやすい（未実測）。`applications` は脱線フィードバックのルール雛形に使われるので空だと UX も落ちる。

- 根拠: `lib/analysis-prompt.ts:139-141` / 用途は `components/work-log-panel.tsx:238-241`
- 修正案: 文字列なら区切り文字で split、要素がオブジェクトなら `.name` を拾う。`trim().filter(Boolean).slice(0, 20)`。
- 触るファイル: `lib/analysis-prompt.ts`
- 出典: A-B-4

### M-13. `activity` / `details` の長さ上限がプロンプトだけで、コード側に無い

「20文字以内」「40文字以内」は指示のみで正規化は `trim()` だけ。推測: 小型モデルは文字数制約を守りにくい（未実測）。長文が `work_logs.activity` に入ると一覧 UI を崩し、レポートのログ羅列プロンプトを膨らませて入力枠を食う。**プライバシー観点の多重防御でもある**: モデルが指示を無視してメール件名・氏名・画面の文章を入れた場合、そのまま Supabase に保存され、`activity` は週次レポート経由で Resend / Slack にも出る。ポリシーは保存内容を「40文字程度の短い要約」と説明している。

- 根拠: `lib/analysis-prompt.ts:64`、`:74`、`:77`、`:149`、`:150-162` / 週次への伝播は `lib/weekly-report.ts:155-158` / ポリシー文面は `app/privacy/page.tsx:175`
- 修正案: `activity` 30〜40 文字、`details` 60〜120 文字で切って `…` を付ける。英語は語数ベースなので `lang === "en"` では緩める値を `ctx` 経由で渡し、プロンプトの「20文字以内」も `en` では "within 10 words" にする。明らかなメールアドレス形式（`@` を含むトークン）のマスクも検討。
- 触るファイル: `lib/analysis-prompt.ts`、`components/work-log-panel.tsx`
- 出典: A-B-5 / P-5（同一箇所）

### M-14. `distraction_check.planned_task` が型と UI にあるのに誰も値を入れていない

`normalizeAnalysis` は `planned_task` を設定しない。結果、ログ項目の「予定作業」表示が常に出ず、フィードバック雛形が**今**の `currentTask` にフォールバックするため過去ログに誤った作業名のルールが生成されうる。精度観点では「そのログを判定したときの予定作業」が残らず、後から誤報を検証できない（一致率評価でも必要）。

- 根拠: `lib/supabase.ts:74`、`components/work-log-item.tsx:156`、`components/work-log-panel.tsx:238`、`lib/analysis-prompt.ts:88-93`
- 修正案: `normalizeAnalysis` の `distractionCheck` に常に `planned_task: ctx.currentTask` を含める。**ただし `distraction_check` は insert 前に丸ごと落とされる**（`lib/supabase.ts:531`）ため永続化には列追加が必要で、それは CLAUDE.md の禁止事項（Supabase への変更）。**提案に留め、実施判断はユーザーに委ねる。**
- 触るファイル: `lib/analysis-prompt.ts`（永続化は保留）
- 出典: A-B-6

### M-15. `distraction_check` のネストと未使用の `confidence` が小型モデルには不要な負荷

出力は7項目（うち1つはネスト3項目）で計9値。`confidence` は保存されるだけで閾値判定にもレポートにも使われていない。推測: 出力トークンが減るほど形式崩れとタイムアウトは減る（未実測）。推論は直列化されており1件の所要時間がスループット上限になる。

- 根拠: `lib/analysis-prompt.ts:63-75`、`:153` / 直列化は `lib/local-ai.ts:135-141`、タイムアウト90秒は `components/work-log-panel.tsx:486`
- 修正案: `distraction_check` をフラット化し `confidence` は廃止または `task_alignment` に統合。`normalizeAnalysis` は旧形式（ネスト）も読める両対応にして既存ログの表示を壊さない。
- 触るファイル: `lib/analysis-prompt.ts`、`components/work-log-item.tsx`、`lib/supabase.ts`（型定義のみ）
- 出典: A-C-2

### M-16. few-shot が1つも無い

現行は指示＋項目説明のみ。推測: 小型モデルでは出力例1〜2件で JSON 形式と文字数の遵守率が上がる（未実測）。

- 根拠: `lib/analysis-prompt.ts:50-77`
- 修正案: 末尾に1行 JSON の出力例を2件（作業中／脱線）。**例のカテゴリ名は必ず `categoriesList` の要素から組み立てる**（ユーザーがカテゴリを編集できるので、存在しないカテゴリを例示すると H-3 のフォールバックを誘発する）。
- 触るファイル: `lib/analysis-prompt.ts`
- 出典: A-C-3

### M-17. 一致率の「分布比較」を先に回して、どの不具合が実際に起きているか確認する

画像ペアを作らず Supabase の**読み取りのみ**で、H-3 / H-4 / M-11 の症状を確認できる費用対効果の高い手順。CLAUDE.md の不変条件も禁止事項も踏まない。

- 見る指標: `category` の構成比、`focus_score` のヒストグラム（**35 前後の不自然な段差**＝M-8 の閾値漏洩、**100 への張り付き**＝H-4 のスケール混入）、`work_category` の構成比とくに「一覧末尾カテゴリ」比率（H-3）、`activity` のユニーク語彙数、1時間あたりログ件数（M-5 による欠落）
- 触るファイル: なし（Supabase ダッシュボードの `select` と手元の集計のみ。`insert` / `update` / SQL 実行はしない）
- 出典: A-D-2 / A-E-5

### M-18. 旧版ログとの一致率を測るペア付きオフライン評価の基盤（`/local-ai-check` 評価モード）

M-17 で傾向を掴んだ後、プロンプト改訂の採否を判断するために必要。設計のみで未実装。

- 不変条件の守り方: 評価用画像は評価者のローカルディスク（git 管理外）に置き `/local-ai-check` のファイル読み込み経路から投入。リポジトリにも Supabase にも入れない。旧版ラベルは Supabase から**読み取り専用**でテキスト列のみ取得。
- 評価モードの要件: 複数ファイル一括選択、`currentTask` の CSV 読み込み／一括指定、1枚ごとに `buildAnalysisPrompt` → `runLocalPrompt` → `extractJsonObject` → `normalizeAnalysis`、**同一画像を N=3 回**実行して self-agreement も測る、結果をローカル blob としてダウンロード（サーバーへ送らない）、プロンプト版の選択
- 指標: `category` の 3×3 混同行列・一致率・Cohen's κ、**脱線検知の precision / recall / F1 と偽陽性率（precision を主指標）**、`work_category` の一致率＋フォールバック選択率、`focus_score` の MAE・相関・`<35` 二値化一致率、`activity` の bigram Jaccard＋人手50件、`applications` の Jaccard と空配列率、self-agreement、1枚あたり所要時間 p50/p95・タイムアウト率・パース失敗率・再試行率
- サンプル数: 最小構成60枚（distracted 20 / productive 30 / neutral 10）→ 本番200枚。脱線の precision/recall を ±10pt（95%CI）で見るなら各クラス100件。A/B は**必ず同じ画像セットで対応のある比較**（McNemar）にすれば n=150〜200 で足る。層化は「予定作業あり/なし」「1画面/2画面合成」「ja/en」の3軸で、**予定作業がショッピング・SNS・動画と同分野のケースを10〜20件は意図的に入れる**（H-5 / H-6 の誤報が測れない）
- 既知の弱点: `distraction_check` は insert 時に捨てられているため旧版ログに `is_distracted` / `task_alignment` / `planned_task` は残っていない（M-14）。旧版の脱線ラベルは `category == "distracted"` で代用し、予定作業は評価者が1件ずつ指定するか全件「未設定」で統一する。**この弱点は評価レポートに明記すること。**
- 採否基準: 「脱線の precision が上がり recall が 5pt 以上落ちない」「`focus_score` の MAE が悪化しない」「所要時間 p95 が悪化しない」を同時に満たすものだけ採用
- 触るファイル: `app/local-ai-check/page.tsx`、`lib/translations/ja.ts`、`lib/translations/en.ts`（評価用スクリプトと画像はリポジトリ外）
- 出典: A-D-1 / A-D-3 / A-D-4 / A-D-5

---

## 重要度：低

### L-1. `distraction_check` がオブジェクト以外でもスプレッドされる

真偽値だけを見てスプレッドするため、`"distraction_check": "true"` で `{0:"t",1:"r",...}` が DB に入る（配列でも同様）。

- 根拠: `lib/analysis-prompt.ts:118-124`
- 修正案: 条件を `typeof === "object" && !== null && !Array.isArray()` にする。
- 触るファイル: `lib/analysis-prompt.ts`
- 出典: C-6

### L-2. `reason` の空文字が下流のフォールバックを素通りする

モデルが `distraction_check` を返した場合、`reason` が `""` でも文言に差し替わらない（オブジェクト無しの経路だけが入れる）。強制 distracted にしたのに理由が空になる。

- 根拠: `lib/analysis-prompt.ts:121`、`:126-128`
- 修正案: `reason: str || (forceDistracted ? ctx.reasonLowAlignment : ctx.reasonUnknown)`。
- 触るファイル: `lib/analysis-prompt.ts`
- 出典: A-B-8

### L-3. `generateFallbackSummaryReport` は logs が空だと NaN を返す

`total === 0` で `productivePct` / `avgFocus` が NaN になり `overall_score: NaN` が DB へ行く。現在の呼び出し元は3件未満で throw するため未到達だが、エクスポートされた純関数で `normalizeSummaryReport` からも無条件に呼ばれる。

- 根拠: `lib/report-builders.ts:112-121`、`:172` / ガードは `lib/local-reports.ts:47`
- 修正案: 関数先頭に `total === 0` ガードを置き 0% / score 0 の定型レポートを返す。
- 触るファイル: `lib/report-builders.ts`
- 出典: C-7

### L-4. `disposeLocalAi` が未使用で、言語を切り替えるとベースセッションが解放されない

宣言のみでヒット1件。ja と en のセッションが同時に残り続ける。

- 根拠: `lib/local-ai.ts:214-224`
- 修正案: `hooks/use-local-ai.ts` の effect クリーンアップでは呼べない（モジュール状態を共有）ので、言語切替ハンドラ（`as_language` の変更箇所）とログアウト処理から呼ぶ。
- 触るファイル: `lib/local-ai.ts`、`components/app-settings.tsx`、`app/page.tsx`
- 出典: C-8

### L-5. `ensureLocalAiReady` の失敗後に `downloadProgress` が 0 のまま残る

`getBaseSession` の catch が `downloadProgress` を戻さないため「ダウンロード中… 0%」が固定表示される。

- 根拠: `lib/local-ai.ts:119-122`、`:106-110` / 表示側は `components/local-ai-settings.tsx:78`、`components/work-log-panel.tsx:1086-1087`、`app/local-ai-check/page.tsx:228`
- 修正案: catch で `downloadProgress: null` も戻す。
- 触るファイル: `lib/local-ai.ts`
- 出典: C-9

### L-6. `DEFAULT_CATEGORY_NAMES` が `DEFAULT_CATEGORIES` の重複定義

同じ7カテゴリが別々に定義されている。片方を直すと静かにずれ、`validCategory` が常にフォールバックに落ちる形で現れる。英語 UI 用のカテゴリ名出し分け（L-7）と併せて対応するのが筋がよい。

- 根拠: `lib/analysis-prompt.ts:5`、`components/activity-breakdown.tsx:18-26` / 影響は `lib/analysis-prompt.ts:110`
- 修正案: `activity-breakdown.tsx` 側が `lib/analysis-prompt.ts` の配列から組み立てる向き（lib → component）にする。逆向きは lib がコンポーネントを import するので避ける。
- 触るファイル: `lib/analysis-prompt.ts`、`components/activity-breakdown.tsx`
- 出典: C-10

### L-7. `/local-ai-check` が英語 UI でも日本語のカテゴリ一覧を使う

`language` に関係なく `DEFAULT_CATEGORY_NAMES`（日本語のみ）を渡すため、結果表に `リサーチ` / `未分類` が出る。本体も日本語なので新規の退行ではないが、このページは英語話者に動作確認を依頼する用途。

- 根拠: `app/local-ai-check/page.tsx:125`、`:137`、`:331-332` / 用途は `docs/local-ai.md:70`
- 修正案: 英語用カテゴリ名配列を用意して `language` で出し分ける。
- 触るファイル: `app/local-ai-check/page.tsx`、`lib/analysis-prompt.ts`
- 出典: C-14

### L-8. `report_data` の `as any` が型のずれを隠している

`WorkLog.report_data?: ReportData` に `DailyReportData` を入れるため `as any` が付いている。表示側は `report_type === "daily"` で別構造として読むので、`ignoreBuildErrors: true` と併せると構造ずれがコンパイルでも実行前にも検出されない。

- 根拠: `app/page.tsx:541-553` / 型は `lib/supabase.ts:79`、`:42` / 表示側は `components/reports-tab.tsx:398`、`:41`
- 修正案: `report_data?: ReportData | DailyReportData` のユニオンにして `as any` を外す。日報用の型を `reports-tab.tsx` からエクスポートして使い回す。
- 触るファイル: `lib/supabase.ts`、`app/page.tsx`、`components/reports-tab.tsx`
- 出典: C-11

### L-9. `inCooldown` が常に false の死にパラメータ

`cooldownUntilRef.current` への書き込みがどこにもないため常に false で、関連する2つの式は定数式。**挙動の退行はない**が、コメントは「429クールダウン中」のままで、この版では起こり得ない状態を説明している（CLAUDE.md に意図的な残置と記載があることは確認済み）。

- 根拠: `components/work-log-panel.tsx:197`、`:749`、`lib/nudge-logic.ts:29-30`、`:73`、`:100`
- 修正案: `NudgeInput.inCooldown` ごと落とすか、コメントを「ローカル動作版では常に false」に直す。
- 触るファイル: `lib/nudge-logic.ts`、`components/work-log-panel.tsx`
- 出典: C-12

### L-10. レポート用プロンプトの時刻整形がロケール固定で ja-JP

`lang === "en"` でも和式表記になる。`formatLogTime` は hour/minute のみで実質無害だが、まとめレポートの `toLocaleString` は `2026/10/4 9:00:00` のような表記を英語プロンプトに混ぜる。ファイル冒頭が「純関数・日英対応」を謳っている点との不一致。

- 根拠: `lib/report-builders.ts:203`、`:300-301` / 呼び出しは `:376`、`:432`
- 修正案: 両方に `lang === "en" ? "en-US" : "ja-JP"` を渡す。`formatLogTime` に `lang` 引数を追加。
- 触るファイル: `lib/report-builders.ts`
- 出典: C-13

### L-11. CSP に `form-action` が無く、`script-src` が `'unsafe-inline'`

`connect-src` で fetch/XHR の宛先は絞られているが `form-action` 未指定のため、注入されたフォームからの任意ホストへの POST は CSP では止まらない。`connect-src` の `https://*.supabase.co` は自プロジェクト以外も許す。**現行コードに注入点は見つからなかった**（画面由来 URL の描画箇所はスキームを前方一致検証して `javascript:` を弾く）ので多重防御の話。

- 根拠: `vercel.json:34` / 検証箇所は `components/reports-tab.tsx:92`、`components/work-summary-report.tsx:32`
- 修正案: `form-action 'self'` を追加。可能なら `'unsafe-inline'` を nonce / hash に、Supabase を自プロジェクトのサブドメインに固定。
- 触るファイル: `vercel.json`
- 出典: P-6

### L-12. 規約第2条・第6条が週次レポート配信に触れていない

機能一覧が5つで、実装にある週次レポートのメール・Slack 配信が挙がっていない。ポリシー側は開示済みなので規約の記述不足。M-3 と同じ修正セットで扱える。

- 根拠: `app/terms/page.tsx` 第2条・第6条、`app/terms/en/page.tsx` Article 2・6 / 実装は `app/api/weekly-report/cron/route.ts`、`lib/weekly-report.ts`
- 修正案: 第2条の機能一覧に「作業ログ集計の週次レポート配信（任意。メールまたは Slack）」を1項追記（日英同時）。
- 触るファイル: `app/terms/page.tsx`、`app/terms/en/page.tsx`
- 出典: P-7

### L-13. コンソールに解析結果テキストが丸ごと出る（端末内の痕跡・不変条件違反ではない）

解析結果オブジェクト（activity / details / applications / reason）がブラウザコンソールに出る。**画像の dataURL・base64・Blob 本体・プロンプト全文は出していないことを確認済み**。端末内に留まるが、ブラウザ拡張から読める点は事実として記録。

- 根拠: `components/work-log-panel.tsx:512`、`:531` / 画像関連のログは文字列のみ（`:457`、`:486`）、`lib/local-ai.ts:180` の再試行ログもエラーのみ
- 修正案: 本番ビルドで `details` を含むオブジェクト丸ごとのログを落とし、件数やカテゴリのみにする。解析ループのデバッグ価値とのトレードオフなので強い推奨ではない。
- 触るファイル: `components/work-log-panel.tsx`
- 出典: P-8

### L-14. `app/debug/page.tsx` が本番でも配信される

表示値は `NEXT_PUBLIC_*` と `***SET***` マスクのみで**秘密値も画面由来データも出さない**。API 側は本番 404。ただしページ自体は本番でも配信され認証もかかっていない（`localStorage` 全消去ボタンを含む）。

- 根拠: `app/debug/page.tsx:122-131`、`lib/debug-utils.ts:20-32`、`app/api/debug/supabase-test/route.ts:6`
- 修正案: ページ側でも本番時に `notFound()` を返す。
- 触るファイル: `app/debug/page.tsx`
- 出典: P-9

### L-15. `components/api-usage-monitor.tsx` が旧クラウド版のクォータ計測ごと残っている（差分外）

どこからも import されておらず（参照は自ファイル内のみ）`fetch` も Supabase 呼び出しも無い死んだコード。`gemini_daily_usage` 等の localStorage 書き込みも**実行されない**ので privacy 上の実害はないが、「Gemini API の無料枠使用量」という UI と `gemini_*` キーがローカル版に残っているのは監査者・将来の編集者の誤解を招く。`sub` から未変更のため今回の差分には含まれない。

- 根拠: `components/api-usage-monitor.tsx:28-68`、`:11`、`:16`
- 修正案: このブランチで削除し、CLAUDE.md の削除済みリストに追記する。
- 触るファイル: `components/api-usage-monitor.tsx`（削除）、`CLAUDE.md`
- 出典: C-15 / P-（2点目の確認回答）

### L-16. `screenshot_url` に `blob:` URL が DB へ保存されようとする（差分外・事実確認）

`createObjectURL` の結果を `addWorkLog` に渡し `source_screenshots` にも集めているが、**insert 時に `blob:` は除去される**ので DB には入らない。privacy-auditor は失効管理（`registerObjectUrl` の上限 revoke、アンマウント時の全件 revoke、縮小処理中の都度 revoke）も確認済みで、ポリシー文面「画像はどこにも保存されず…ページを閉じると消えます」は実装どおりと判断。`sub` から未変更。**実体のある対応は M-2（許可リストへの反転）に含まれる。**

- 根拠: `components/work-log-panel.tsx:514-528`、`:620-623`、`:178-190`、`:324-337`、`:359-367` / 除去は `lib/supabase.ts:534-535`、`:540-544` / 文面は `app/privacy/page.tsx:172-176`
- 修正案: 保存時に `screenshot_url` を渡さない（表示用 blob URL はメモリ上のエントリにだけ持つ）。
- 触るファイル: `components/work-log-panel.tsx`、`lib/supabase.ts`
- 出典: C-16 / P-3

---

## 着手順の推奨

1. **M-17**（分布比較。コード変更なし・Supabase 読み取りのみ）で H-3 / H-4 / M-11 が実際に起きているか確認
2. **H-3 / H-4**（数行で副作用がほぼ無く実害が大きい）
3. **H-1 / M-1 / M-3 / L-12**（文書の事実誤り。日英セットで一度に直す）
4. **H-2**（ダウンロードのブロック。`signal` 伝播＋レポート経路の readiness チェック）
5. **M-7**（テスト基盤。以降の修正を回帰から守る）
6. **H-5 / H-6 / M-11 / M-8**（誤報の主因。プロンプトと正規化をセットで）
7. **M-10 / M-5**（表記ゆれとパース失敗の根本対処）
8. 残りの中・低

## 保留（ユーザー判断が必要）

- **M-14 の永続化**: `distraction_check.planned_task` を残すには Supabase の列追加が必要で、CLAUDE.md の禁止事項（本番と共用の DB への変更）に当たる。提案のみ。
- **M-18**: 評価基盤の実装規模が大きい。M-17 の結果を見てから着手判断。
