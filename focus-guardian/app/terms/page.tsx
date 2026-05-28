import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "利用規約 | FlowNudge",
  description: "FlowNudge の利用規約",
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* ヘッダー */}
        <div className="mb-10">
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← FlowNudge トップへ
          </Link>
          <h1 className="mt-4 text-3xl font-bold text-gray-900">利用規約</h1>
          <p className="mt-2 text-sm text-gray-500">最終更新日：2026年5月28日</p>
        </div>

        <div className="space-y-8 text-gray-700 leading-relaxed">
          {/* 第1条 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">第1条（総則）</h2>
            <p>
              本利用規約（以下「本規約」）は、株式会社Actra（以下「当社」）が提供するサービス「FlowNudge」（以下「本サービス」）の利用条件を定めるものです。
              ユーザーの皆様（以下「ユーザー」）は、本サービスを利用することにより、本規約に同意したものとみなされます。
            </p>
          </section>

          {/* 第2条 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">第2条（サービスの概要）</h2>
            <p>本サービスは、以下の機能を提供します。</p>
            <ul className="mt-3 list-disc list-inside space-y-1">
              <li>Google アカウントを用いた認証・ログイン機能</li>
              <li>Google カレンダーと連携した当日の予定取得・表示機能</li>
              <li>Toggl Track と連携した作業時間の取得・表示機能</li>
              <li>画面テキスト解析による作業脱線検知・通知機能</li>
              <li>作業ログの記録・管理機能</li>
            </ul>
          </section>

          {/* 第3条 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">第3条（利用資格）</h2>
            <ol className="list-decimal list-inside space-y-2">
              <li>本サービスは、本規約に同意した個人または法人が利用できます。</li>
              <li>未成年者がご利用される場合は、親権者または法定代理人の同意を得た上でご利用ください。</li>
              <li>
                当社は、ユーザーが以下のいずれかに該当すると判断した場合、事前の通知なしにサービスの利用を制限または停止することができます。
                <ul className="mt-2 ml-6 list-disc space-y-1">
                  <li>本規約に違反した場合</li>
                  <li>不正行為・不正アクセスを行った場合</li>
                  <li>その他当社が不適切と判断した場合</li>
                </ul>
              </li>
            </ol>
          </section>

          {/* 第4条 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">第4条（Google アカウント連携）</h2>
            <ol className="list-decimal list-inside space-y-2">
              <li>
                本サービスは、Google の OAuth 2.0 認証を通じてユーザーの Google アカウントと連携します。
                連携にあたり、以下のデータへのアクセス許可をお求めします。
                <ul className="mt-2 ml-6 list-disc space-y-1">
                  <li>
                    <strong>Google アカウントの基本情報</strong>（氏名・メールアドレス・プロフィール画像）：ログイン識別および画面表示に使用します。
                  </li>
                  <li>
                    <strong>Google カレンダーの読み取り</strong>（イベントのタイトル・開始・終了日時・説明）：当日の予定を取得し、作業計画の表示に使用します。
                  </li>
                </ul>
              </li>
              <li>
                本サービスが取得する Google データは、上記の目的のみに使用します。
                第三者への売却・提供、および広告目的での利用は一切行いません。
              </li>
              <li>
                Google カレンダーへのアクセスは読み取り専用です。
                本サービスがカレンダーの内容を追加・変更・削除することはありません。
              </li>
              <li>
                ユーザーはいつでも <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Google アカウントのアクセス許可管理ページ</a> から本サービスの連携を解除できます。
                連携を解除した場合、当社が保有するユーザーの Google 関連データは速やかに削除されます。
              </li>
              <li>
                本サービスにおける Google データの取り扱いは、
                <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  Google API サービスのユーザーデータに関するポリシー
                </a>
                （Limited Use 要件を含む）に準拠します。
              </li>
            </ol>
          </section>

          {/* 第5条 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">第5条（Toggl Track 連携）</h2>
            <ol className="list-decimal list-inside space-y-2">
              <li>
                本サービスは、ユーザーが任意で入力した Toggl Track の API トークンおよびワークスペース ID を用いて、現在の作業記録を取得します。
              </li>
              <li>
                Toggl Track の API トークンはユーザーのブラウザ（ローカルストレージ）に保存され、当社のサーバーには保存されません。
              </li>
              <li>
                Toggl Track 連携機能はオプションです。利用しない場合でも、本サービスの基本機能は引き続き利用できます。
              </li>
            </ol>
          </section>

          {/* 第6条 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">第6条（画面解析機能）</h2>
            <ol className="list-decimal list-inside space-y-2">
              <li>
                本サービスの脱線検知機能は、ユーザーの操作により画面から抽出されたテキスト情報を AI モデル（Google Gemma API）に送信して解析します。
              </li>
              <li>
                送信されるデータはユーザー自身が設定した「現在の予定作業」と、画面から抽出されたテキストのみです。
                解析結果は本サービスの機能提供のみに使用し、第三者に提供することはありません。
              </li>
              <li>
                画面解析に使用する Gemini/Gemma API キーはユーザー自身が取得・設定するものであり、当社のサーバーには保存されません。
              </li>
            </ol>
          </section>

          {/* 第7条 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">第7条（禁止事項）</h2>
            <p>ユーザーは、本サービスの利用にあたり、以下の行為を行ってはなりません。</p>
            <ul className="mt-3 list-disc list-inside space-y-1">
              <li>法令または公序良俗に違反する行為</li>
              <li>当社または第三者の知的財産権・プライバシー権・名誉等を侵害する行為</li>
              <li>本サービスのシステムへの不正アクセス・リバースエンジニアリング・改ざん</li>
              <li>他のユーザーまたは第三者を欺く行為</li>
              <li>商業目的での無断転用・再販</li>
              <li>その他当社が不適切と合理的に判断する行為</li>
            </ul>
          </section>

          {/* 第8条 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">第8条（知的財産権）</h2>
            <p>
              本サービスに関するソフトウェア・デザイン・テキスト等の知的財産権は、当社または正当な権利者に帰属します。
              本規約に基づく利用許諾は、これらの権利の譲渡を意味しません。
            </p>
          </section>

          {/* 第9条 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">第9条（免責事項）</h2>
            <ol className="list-decimal list-inside space-y-2">
              <li>
                当社は、本サービスの正確性・完全性・継続性について保証しません。
                本サービスの利用によって生じた損害について、当社の故意または重大な過失による場合を除き、当社は責任を負いません。
              </li>
              <li>
                本サービスは Google カレンダー API および Toggl API などの外部サービスと連携しています。
                これら外部サービスの障害・仕様変更等により本サービスが利用できない場合があっても、当社は責任を負いません。
              </li>
              <li>
                ユーザーが本サービスを通じて取得した情報に基づいて行った判断・行動の結果について、当社は責任を負いません。
              </li>
            </ol>
          </section>

          {/* 第10条 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">第10条（サービスの変更・停止・終了）</h2>
            <p>
              当社は、ユーザーへの事前通知なしに、本サービスの内容を変更、または提供を停止・終了することができます。
              これによってユーザーに生じた損害について、当社は責任を負いません。
            </p>
          </section>

          {/* 第11条 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">第11条（規約の変更）</h2>
            <p>
              当社は必要に応じて本規約を変更できます。変更後の規約は本ページに掲載した時点で効力を生じるものとし、
              ユーザーが変更後に本サービスを利用した場合、変更後の規約に同意したものとみなします。
              重要な変更については、サービス内またはメールにてお知らせします。
            </p>
          </section>

          {/* 第12条 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">第12条（準拠法・管轄裁判所）</h2>
            <p>
              本規約は日本法に準拠して解釈されます。
              本サービスに関して紛争が生じた場合は、東京地方裁判所を第一審の専属的合意管轄裁判所とします。
            </p>
          </section>

          {/* 第13条 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">第13条（お問い合わせ）</h2>
            <p>本規約に関するお問い合わせは、以下の窓口までご連絡ください。</p>
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
            <Link href="/privacy" className="text-blue-600 hover:underline">
              プライバシーポリシー
            </Link>
            <Link href="/terms/en" className="text-blue-600 hover:underline">
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
