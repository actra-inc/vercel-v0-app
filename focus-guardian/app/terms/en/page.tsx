import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Terms of Service | FlowNudge",
  description: "FlowNudge Terms of Service",
}

export default function TermsEnPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← Back to FlowNudge
          </Link>
          <h1 className="mt-4 text-3xl font-bold text-gray-900">Terms of Service</h1>
          <p className="mt-2 text-sm text-gray-500">Last updated: May 28, 2026</p>
        </div>

        <div className="space-y-8 text-gray-700 leading-relaxed">
          {/* Article 1 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Article 1 (General Provisions)</h2>
            <p>
              These Terms of Service (the "Terms") govern the use of "FlowNudge" (the "Service") provided by
              Actra Inc. (the "Company"). By accessing or using the Service, you (the "User") agree to be
              bound by these Terms.
            </p>
          </section>

          {/* Article 2 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Article 2 (Service Overview)</h2>
            <p>The Service provides the following features:</p>
            <ul className="mt-3 list-disc list-inside space-y-1">
              <li>Authentication and login via Google account</li>
              <li>Fetching and displaying today's events from Google Calendar</li>
              <li>Fetching and displaying tracked time via Toggl Track integration</li>
              <li>Detecting off-task behavior through screen text analysis and sending notifications</li>
              <li>Recording and managing work logs</li>
            </ul>
          </section>

          {/* Article 3 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Article 3 (Eligibility)</h2>
            <ol className="list-decimal list-inside space-y-2">
              <li>The Service is available to individuals or entities who agree to these Terms.</li>
              <li>
                Minors must obtain consent from a parent or legal guardian before using the Service.
              </li>
              <li>
                The Company may restrict or suspend a User's access without prior notice if the User is
                found to:
                <ul className="mt-2 ml-6 list-disc space-y-1">
                  <li>Violate these Terms</li>
                  <li>Engage in fraudulent or unauthorized access</li>
                  <li>Otherwise act in a manner the Company deems inappropriate</li>
                </ul>
              </li>
            </ol>
          </section>

          {/* Article 4 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Article 4 (Google Account Integration)</h2>
            <ol className="list-decimal list-inside space-y-2">
              <li>
                The Service integrates with the User's Google account via Google OAuth 2.0. The following
                permissions are requested:
                <ul className="mt-2 ml-6 list-disc space-y-1">
                  <li>
                    <strong>Google account basic profile</strong> (name, email address, profile picture):
                    used for login identification and on-screen display.
                  </li>
                  <li>
                    <strong>Google Calendar read access</strong> (event title, start/end time,
                    description): used to fetch today's schedule for task planning display.
                  </li>
                </ul>
              </li>
              <li>
                Google data accessed by the Service is used solely for the purposes described above. The
                Company will never sell, share with third parties, or use this data for advertising
                purposes.
              </li>
              <li>
                Google Calendar access is read-only. The Service will never add, modify, or delete
                calendar entries.
              </li>
              <li>
                Users may revoke the Service's access at any time from the{" "}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Google Account Permissions page
                </a>
                . Upon revocation, all Google-related data held by the Company will be promptly deleted.
              </li>
              <li>
                The Company's use of Google data complies with the{" "}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements.
              </li>
            </ol>
          </section>

          {/* Article 5 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Article 5 (Toggl Track Integration)</h2>
            <ol className="list-decimal list-inside space-y-2">
              <li>
                The Service uses a Toggl Track API token and workspace ID voluntarily provided by the User
                to retrieve current time-tracking records.
              </li>
              <li>
                The Toggl Track API token is stored in the User's browser (local storage) and is never
                sent to or stored on the Company's servers.
              </li>
              <li>
                Toggl Track integration is optional. The core features of the Service remain available
                without it.
              </li>
            </ol>
          </section>

          {/* Article 6 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Article 6 (Screen Analysis Feature)</h2>
            <ol className="list-decimal list-inside space-y-2">
              <li>
                The distraction-detection feature sends text extracted from the User's screen—initiated
                by the User's own action—to an AI model (Google Gemma API) for analysis.
              </li>
              <li>
                The only data transmitted is the User's configured "current task" and the text extracted
                from the screen. Analysis results are used solely to provide the Service's features and
                are never shared with third parties.
              </li>
              <li>
                The Gemini/Gemma API key used for screen analysis is obtained and configured by the User
                themselves and is never stored on the Company's servers.
              </li>
            </ol>
          </section>

          {/* Article 7 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Article 7 (Prohibited Conduct)</h2>
            <p>Users must not engage in any of the following when using the Service:</p>
            <ul className="mt-3 list-disc list-inside space-y-1">
              <li>Any act that violates applicable laws or public policy</li>
              <li>
                Any act that infringes the intellectual property rights, privacy rights, or reputation of
                the Company or any third party
              </li>
              <li>
                Unauthorized access, reverse engineering, or tampering with the Service's systems
              </li>
              <li>Any act intended to deceive other Users or third parties</li>
              <li>Unauthorized commercial resale or redistribution of the Service</li>
              <li>Any other act the Company reasonably deems inappropriate</li>
            </ul>
          </section>

          {/* Article 8 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Article 8 (Intellectual Property)</h2>
            <p>
              All intellectual property rights in the Service, including software, design, and text,
              belong to the Company or their respective rights holders. The license granted under these
              Terms does not constitute a transfer of any such rights.
            </p>
          </section>

          {/* Article 9 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Article 9 (Disclaimer)</h2>
            <ol className="list-decimal list-inside space-y-2">
              <li>
                The Company makes no warranties regarding the accuracy, completeness, or continuity of
                the Service. Except in cases of the Company's willful misconduct or gross negligence, the
                Company shall not be liable for any damages arising from the use of the Service.
              </li>
              <li>
                The Service integrates with external services such as the Google Calendar API and Toggl
                API. The Company shall not be liable for any unavailability of the Service caused by
                failures or specification changes in those external services.
              </li>
              <li>
                The Company shall not be liable for any outcome resulting from decisions or actions taken
                by the User based on information obtained through the Service.
              </li>
            </ol>
          </section>

          {/* Article 10 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Article 10 (Changes, Suspension, and Termination)
            </h2>
            <p>
              The Company may modify, suspend, or terminate the Service without prior notice to Users.
              The Company shall not be liable for any damages incurred by Users as a result of such
              actions.
            </p>
          </section>

          {/* Article 11 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Article 11 (Amendments to Terms)</h2>
            <p>
              The Company may amend these Terms as necessary. Amendments take effect when posted on this
              page. Continued use of the Service after an amendment constitutes the User's acceptance of
              the revised Terms. Material changes will be communicated within the Service or by email.
            </p>
          </section>

          {/* Article 12 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              Article 12 (Governing Law and Jurisdiction)
            </h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of Japan. Any
              disputes arising from the Service shall be subject to the exclusive jurisdiction of the
              Tokyo District Court as the court of first instance.
            </p>
          </section>

          {/* Article 13 */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Article 13 (Contact)</h2>
            <p>For inquiries regarding these Terms, please contact us at:</p>
            <div className="mt-3 p-4 bg-gray-50 rounded-lg text-sm">
              <p className="font-medium text-gray-900">Actra Inc.</p>
              <p className="mt-1">
                Email:{" "}
                <a
                  href="mailto:claude-admin@actra.co.jp"
                  className="text-blue-600 hover:underline"
                >
                  claude-admin@actra.co.jp
                </a>
              </p>
            </div>
          </section>

          {/* Footer links */}
          <div className="pt-6 border-t border-gray-200 flex gap-6 text-sm">
            <Link href="/privacy/en" className="text-blue-600 hover:underline">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-blue-600 hover:underline">
              日本語版
            </Link>
            <Link href="/" className="text-blue-600 hover:underline">
              Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
