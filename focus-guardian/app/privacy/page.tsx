import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "プライバシーポリシー | FlowNudge",
  description: "FlowNudge のプライバシーポリシー",
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* ヘッダー */}
        <div className="mb-10">
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← FlowNudge トップへ
          </Link>
          <h1 className="mt-4 text-3xl font-bold text-gray-900">プライバシーポリシー</h1>
          <p className="mt-2 text-sm text-gray-500">最終更新日：2026年5月28日</p>
        </div>

        <div className="space-y-8 text-gray-700 leading-relaxed">
          {/* はじめに */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">はじめに</h2>
            <p>
              株式会社Actra（以下「当社」）は、「FlowNudge」（以下「本サービス」）において収集するユーザーの個人情報および Google
              ユーザーデータの取り扱いについて、本プライバシーポリシーに定めます。
            </p>
            <p className="mt-3">
              本サービスは、Google API サービスを通じて取得したデータを、
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Google API サービスのユーザーデータに関するポリシー
              </a>
              （Limited Use 要件を含む）に従って取り扱います。
            </p>
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm space-y-1">
              <p className="font-semibold text-gray-900">Google API データの利用制限（Limited Use）</p>
              <p>本サービスが Google API を通じて取得したユーザーデータは、以下の目的にのみ使用します。</p>
              <ul className="mt-2 list-disc list-inside space-y-1">
                <li>ユーザーへの本サービス機能の提供・改善</li>
                <li>適用される法令の遵守</li>
              </ul>
              <p className="mt-2">
                Google API から取得したユーザーデータを、<strong>汎用的な AI モデルまたは機械学習モデルの開発・学習・改善を目的として使用することは一切ありません。</strong>
                また、当該データを第三者に販売・共有・転用することはありません。
              </p>
            </div>
          </section>

          {/* 1. 収集する情報 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. 収集する情報</h2>

            <h3 className="text-base font-semibold text-gray-800 mt-4 mb-2">
              1-1. Google アカウント情報（Google OAuth 認証時）
            </h3>
            <p>
              Google アカウントでログインする際、以下の OAuth スコープを通じて情報を取得します。
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm border-collapse border border-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-700">OAuth スコープ</th>
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-700">取得するデータ</th>
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-700">使用目的</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="bg-gray-100 px-1 rounded">openid</code></td>
                    <td className="border border-gray-200 px-4 py-2">Google アカウント ID</td>
                    <td className="border border-gray-200 px-4 py-2">ユーザー認証・アカウントの一意識別</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="border border-gray-200 px-4 py-2"><code className="bg-gray-100 px-1 rounded">profile</code></td>
                    <td className="border border-gray-200 px-4 py-2">氏名・プロフィール画像 URL</td>
                    <td className="border border-gray-200 px-4 py-2">ログイン中ユーザーの画面表示・アバター表示</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="bg-gray-100 px-1 rounded">email</code></td>
                    <td className="border border-gray-200 px-4 py-2">メールアドレス</td>
                    <td className="border border-gray-200 px-4 py-2">アカウント識別・ログイン管理</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-base font-semibold text-gray-800 mt-6 mb-2">
              1-2. Google カレンダーデータ（カレンダー連携時）
            </h3>
            <p>
              本サービスは <code className="bg-gray-100 px-1 rounded text-sm">https://www.googleapis.com/auth/calendar.readonly</code> スコープを使用して、ユーザーのプライマリカレンダーから当日の予定を取得します。
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm border-collapse border border-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-700">取得するデータ</th>
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-700">使用目的</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2">イベントタイトル</td>
                    <td className="border border-gray-200 px-4 py-2">当日の予定一覧の表示</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="border border-gray-200 px-4 py-2">開始・終了日時</td>
                    <td className="border border-gray-200 px-4 py-2">予定の時刻表示・現在進行中の予定検知</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2">イベントの説明文</td>
                    <td className="border border-gray-200 px-4 py-2">予定の詳細表示</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="border border-gray-200 px-4 py-2">カラー ID</td>
                    <td className="border border-gray-200 px-4 py-2">カレンダーカラーによる視覚的な分類表示</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm bg-blue-50 border border-blue-100 rounded p-3">
              カレンダーデータは表示目的のみに使用し、当社のサーバーに永続的に保存しません。
              本サービスがカレンダーの内容を追加・変更・削除することはありません。
            </p>

            <h3 className="text-base font-semibold text-gray-800 mt-6 mb-2">
              1-3. Toggl Track データ（任意連携）
            </h3>
            <p>ユーザーが任意で Toggl Track 連携を設定した場合、以下を取得します。</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm border-collapse border border-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-700">取得するデータ</th>
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-700">使用目的</th>
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-700">保存場所</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2">Toggl API トークン</td>
                    <td className="border border-gray-200 px-4 py-2">Toggl API 認証</td>
                    <td className="border border-gray-200 px-4 py-2">ブラウザ（ローカルストレージ）のみ</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="border border-gray-200 px-4 py-2">ワークスペース ID</td>
                    <td className="border border-gray-200 px-4 py-2">Toggl API 認証</td>
                    <td className="border border-gray-200 px-4 py-2">ブラウザ（ローカルストレージ）のみ</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2">現在の作業記録（タスク名・開始時刻）</td>
                    <td className="border border-gray-200 px-4 py-2">作業タイマーの表示</td>
                    <td className="border border-gray-200 px-4 py-2">当社サーバーに保存しない</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-base font-semibold text-gray-800 mt-6 mb-2">
              1-4. 画面解析データ（脱線検知機能使用時）
            </h3>
            <p>
              脱線検知機能を使用した際、ユーザー操作によって画面から抽出されたテキストと、ユーザーが設定した「現在の予定作業」を
              Google Gemma API に送信して解析します。この解析結果は画面上に表示されるのみで、当社のサーバーには保存されません。
              Gemini/Gemma API キーはユーザーのブラウザ内にのみ保存されます。
            </p>

            <h3 className="text-base font-semibold text-gray-800 mt-6 mb-2">
              1-5. 作業ログデータ
            </h3>
            <p>
              ユーザーが本サービス内で記録した作業ログ（タスク名・カテゴリ・時刻・メモ等）は、
              Supabase（データベース）に保存されます。これらのデータはユーザー本人のみがアクセスできます。
            </p>
          </section>

          {/* 2. 収集しない情報 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. 収集しない情報</h2>
            <p>本サービスは以下のデータを収集・保存しません。</p>
            <ul className="mt-3 list-disc list-inside space-y-1">
              <li>Google カレンダーの過去・未来のイベント（取得するのは当日分のみ）</li>
              <li>Google の連絡先・メール・ドライブ等の他サービスデータ</li>
              <li>Toggl Track の詳細な作業履歴（表示のみで保存しない）</li>
              <li>画面解析に使用したテキストの生データ</li>
              <li>クレジットカード情報・銀行口座情報等の決済情報</li>
            </ul>
          </section>

          {/* 3. 情報の利用目的 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. 情報の利用目的</h2>
            <p>収集した情報は以下の目的にのみ使用します。</p>
            <ul className="mt-3 list-disc list-inside space-y-1">
              <li>本サービスのログイン・認証機能の提供</li>
              <li>Google カレンダー連携による当日予定の表示</li>
              <li>Toggl Track 連携による作業タイマー表示</li>
              <li>作業脱線の検知・通知機能の提供</li>
              <li>作業ログの記録・管理・集計レポートの生成</li>
              <li>サービスの障害対応・品質向上</li>
            </ul>
            <p className="mt-3 font-medium text-gray-900">
              Google API から取得したデータを、広告配信や第三者への提供に使用することは一切ありません。取得したデータは本サービスの機能提供・改善のみに使用します。
            </p>
          </section>

          {/* 4. 第三者への情報提供 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. 第三者への情報提供</h2>
            <p>
              当社は、ユーザーの個人情報および Google ユーザーデータを第三者に販売・賃貸・共有しません。
              ただし、以下の場合を除きます。
            </p>
            <ul className="mt-3 list-disc list-inside space-y-2">
              <li>
                <strong>法令に基づく場合：</strong>裁判所・行政機関等から法令に基づく開示命令を受けた場合
              </li>
              <li>
                <strong>サービス提供に必要な委託先：</strong>本サービスのインフラとして Supabase（認証・データベース）および
                Vercel（ホスティング）を利用しています。これらのサービスプロバイダーとは適切なデータ処理契約を締結しています。
              </li>
            </ul>
          </section>

          {/* 5. データの保持と削除 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. データの保持と削除</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse border border-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-700">データの種類</th>
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-700">保持期間</th>
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-700">削除タイミング</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2">Google アカウント情報</td>
                    <td className="border border-gray-200 px-4 py-2">アカウント存続中</td>
                    <td className="border border-gray-200 px-4 py-2">アカウント削除時・連携解除時</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="border border-gray-200 px-4 py-2">Google カレンダーデータ</td>
                    <td className="border border-gray-200 px-4 py-2">保存しない（表示のみ）</td>
                    <td className="border border-gray-200 px-4 py-2">—</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2">Toggl API トークン</td>
                    <td className="border border-gray-200 px-4 py-2">ユーザーが削除するまで</td>
                    <td className="border border-gray-200 px-4 py-2">ユーザーによるブラウザ削除時</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="border border-gray-200 px-4 py-2">作業ログ</td>
                    <td className="border border-gray-200 px-4 py-2">アカウント存続中</td>
                    <td className="border border-gray-200 px-4 py-2">ユーザーによる個別削除時・アカウント削除時</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2">画面解析テキスト</td>
                    <td className="border border-gray-200 px-4 py-2">保存しない（API送信のみ）</td>
                    <td className="border border-gray-200 px-4 py-2">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 6. ユーザーの権利 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. ユーザーの権利</h2>
            <p>ユーザーはいつでも以下の操作を行うことができます。</p>
            <ul className="mt-3 list-disc list-inside space-y-2">
              <li>
                <strong>Google 連携の解除：</strong>
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Google アカウントのアクセス許可管理ページ
                </a>
                から本サービスの連携を解除できます。解除後、当社が保有する Google 関連データは速やかに削除されます。
              </li>
              <li>
                <strong>作業ログの削除：</strong>本サービスの画面上から個別のログを削除できます。
              </li>
              <li>
                <strong>アカウントの削除：</strong>アカウント削除を希望する場合は、下記のお問い合わせ先までご連絡ください。
                アカウントに紐づくすべてのデータを削除します。
              </li>
              <li>
                <strong>データの開示請求：</strong>当社が保有するご自身のデータの開示を希望する場合も、下記のお問い合わせ先までご連絡ください。
              </li>
            </ul>
          </section>

          {/* 7. Cookie とローカルストレージ */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Cookie およびローカルストレージ</h2>
            <p>本サービスは以下の目的で Cookie およびローカルストレージを使用します。</p>
            <ul className="mt-3 list-disc list-inside space-y-1">
              <li>
                <strong>セッション Cookie：</strong>ログイン状態の維持（最大30日間）
              </li>
              <li>
                <strong>ローカルストレージ：</strong>Toggl API トークン・ワークスペース ID・Gemini API キー・ユーザー設定の保存
              </li>
            </ul>
            <p className="mt-3">
              ブラウザの設定から Cookie を無効にすることができますが、ログイン機能が正常に動作しなくなる場合があります。
            </p>
          </section>

          {/* 8. セキュリティ */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">8. セキュリティ</h2>
            <p>
              当社は、収集した情報への不正アクセス・漏洩・改ざんを防止するため、以下の措置を講じています。
            </p>
            <ul className="mt-3 list-disc list-inside space-y-1">
              <li>通信の HTTPS 暗号化</li>
              <li>Supabase による行レベルセキュリティ（RLS）の適用</li>
              <li>セッション Cookie の HttpOnly・SameSite 属性設定</li>
              <li>センシティブな認証情報のサーバー非保存（ブラウザ側ローカルストレージのみ）</li>
            </ul>
          </section>

          {/* 9. 子どものプライバシー */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">9. 子どものプライバシー</h2>
            <p>
              本サービスは13歳未満の子どもを対象としておらず、意図的に13歳未満の子どものデータを収集することはありません。
              13歳未満の子どものデータが誤って収集されていることが判明した場合は、速やかに削除します。
            </p>
          </section>

          {/* 10. 外部サービス */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">10. 外部サービスのプライバシーポリシー</h2>
            <p>本サービスが連携する外部サービスのプライバシーポリシーは以下をご確認ください。</p>
            <ul className="mt-3 list-disc list-inside space-y-1">
              <li>
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Google プライバシーポリシー
                </a>
              </li>
              <li>
                <a
                  href="https://toggl.com/track/privacy-policy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Toggl Track プライバシーポリシー
                </a>
              </li>
              <li>
                <a
                  href="https://supabase.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Supabase プライバシーポリシー
                </a>
              </li>
            </ul>
          </section>

          {/* 11. ポリシーの変更 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">11. プライバシーポリシーの変更</h2>
            <p>
              当社は必要に応じて本ポリシーを変更することがあります。重要な変更がある場合は、サービス内またはメールにてお知らせします。
              変更後のポリシーは本ページに掲載した時点で効力を生じます。
            </p>
          </section>

          {/* 12. お問い合わせ */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">12. お問い合わせ</h2>
            <p>
              本ポリシーに関するご質問、データの削除・開示請求、その他プライバシーに関するお問い合わせは以下までご連絡ください。
            </p>
            <div className="mt-3 p-4 bg-gray-50 rounded-lg text-sm">
              <p className="font-medium text-gray-900">株式会社Actra</p>
              <p className="mt-1">
                メールアドレス：
                <a href="mailto:claude-admin@actra.co.jp" className="text-blue-600 hover:underline">
                  claude-admin@actra.co.jp
                </a>
              </p>
            </div>
          </section>

          {/* フッターリンク */}
          <div className="pt-6 border-t border-gray-200 flex gap-6 text-sm">
            <Link href="/terms" className="text-blue-600 hover:underline">
              利用規約
            </Link>
            <Link href="/privacy/en" className="text-blue-600 hover:underline">
              English
            </Link>
            <Link href="/" className="text-blue-600 hover:underline">
              トップページ
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
