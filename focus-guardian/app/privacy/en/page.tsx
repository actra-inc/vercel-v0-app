import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Privacy Policy | FlowNudge",
  description: "FlowNudge Privacy Policy",
}

export default function PrivacyEnPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← Back to FlowNudge
          </Link>
          <h1 className="mt-4 text-3xl font-bold text-gray-900">Privacy Policy</h1>
          <p className="mt-2 text-sm text-gray-500">Last updated: May 28, 2026</p>
        </div>

        <div className="space-y-8 text-gray-700 leading-relaxed">
          {/* Introduction */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Introduction</h2>
            <p>
              Actra Inc. (the "Company") describes in this Privacy Policy how personal information and
              Google user data collected through "FlowNudge" (the "Service") are handled.
            </p>
            <p className="mt-3">
              Data obtained through Google API Services is handled in accordance with the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Google API Services User Data Policy
              </a>
              , including its Limited Use requirements.
            </p>
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm space-y-1">
              <p className="font-semibold text-gray-900">Limited Use of Google API Data</p>
              <p>User data obtained through Google APIs is used only for the following purposes:</p>
              <ul className="mt-2 list-disc list-inside space-y-1">
                <li>Providing and improving the Service features for the user</li>
                <li>Complying with applicable laws and regulations</li>
              </ul>
              <p className="mt-2">
                Google API user data will <strong>never be used to develop, train, or improve generalized AI or machine learning models.</strong>{" "}
                Such data will not be sold, shared, or transferred to any third party for any purpose.
              </p>
            </div>
          </section>

          {/* 1. Information We Collect */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Information We Collect</h2>

            <h3 className="text-base font-semibold text-gray-800 mt-4 mb-2">
              1-1. Google Account Information (collected during Google OAuth sign-in)
            </h3>
            <p>When you sign in with a Google account, the following OAuth scopes are requested:</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm border-collapse border border-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-700">OAuth Scope</th>
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-700">Data Accessed</th>
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-700">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="bg-gray-100 px-1 rounded">openid</code></td>
                    <td className="border border-gray-200 px-4 py-2">Google Account ID</td>
                    <td className="border border-gray-200 px-4 py-2">User authentication and unique account identification</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="border border-gray-200 px-4 py-2"><code className="bg-gray-100 px-1 rounded">profile</code></td>
                    <td className="border border-gray-200 px-4 py-2">Name, profile picture URL</td>
                    <td className="border border-gray-200 px-4 py-2">Display the logged-in user's name and avatar in the UI</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2"><code className="bg-gray-100 px-1 rounded">email</code></td>
                    <td className="border border-gray-200 px-4 py-2">Email address</td>
                    <td className="border border-gray-200 px-4 py-2">Account identification and login management</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-base font-semibold text-gray-800 mt-6 mb-2">
              1-2. Google Calendar Data (collected when Calendar integration is active)
            </h3>
            <p>
              The Service uses the{" "}
              <code className="bg-gray-100 px-1 rounded text-sm">
                https://www.googleapis.com/auth/calendar.readonly
              </code>{" "}
              scope to retrieve today's events from the User's primary calendar.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm border-collapse border border-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-700">Data</th>
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-700">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2">Event title</td>
                    <td className="border border-gray-200 px-4 py-2">Display today's schedule list</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="border border-gray-200 px-4 py-2">Start and end time</td>
                    <td className="border border-gray-200 px-4 py-2">Show event times and detect the currently active event</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2">Event description</td>
                    <td className="border border-gray-200 px-4 py-2">Display event details</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="border border-gray-200 px-4 py-2">Color ID</td>
                    <td className="border border-gray-200 px-4 py-2">Visual categorization using calendar colors</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm bg-blue-50 border border-blue-100 rounded p-3">
              Calendar data is used solely for display purposes and is never persistently stored on our
              servers. The Service will never add, modify, or delete calendar entries.
            </p>

            <h3 className="text-base font-semibold text-gray-800 mt-6 mb-2">
              1-3. Toggl Track Data (optional integration)
            </h3>
            <p>If you choose to connect Toggl Track, we access the following:</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm border-collapse border border-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-700">Data</th>
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-700">Purpose</th>
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-700">Storage</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2">Toggl API token</td>
                    <td className="border border-gray-200 px-4 py-2">Toggl API authentication</td>
                    <td className="border border-gray-200 px-4 py-2">Browser (local storage) only</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="border border-gray-200 px-4 py-2">Workspace ID</td>
                    <td className="border border-gray-200 px-4 py-2">Toggl API authentication</td>
                    <td className="border border-gray-200 px-4 py-2">Browser (local storage) only</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2">Current time entry (task name, start time)</td>
                    <td className="border border-gray-200 px-4 py-2">Display the work timer</td>
                    <td className="border border-gray-200 px-4 py-2">Not stored on our servers</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-base font-semibold text-gray-800 mt-6 mb-2">
              1-4. Screen Analysis Data (when distraction detection is used)
            </h3>
            <p>
              When you use the distraction-detection feature, text extracted from your screen—triggered
              by your own action—along with your configured "current task" is sent to the Google Gemma
              API for analysis. The analysis result is displayed on screen only and is never stored on
              our servers. The Gemini/Gemma API key is stored in your browser only.
            </p>

            <h3 className="text-base font-semibold text-gray-800 mt-6 mb-2">
              1-5. Work Log Data
            </h3>
            <p>
              Work logs recorded within the Service (task name, category, timestamp, notes, etc.) are
              stored in Supabase (our database). Only you can access your own log data.
            </p>
          </section>

          {/* 2. Information We Do NOT Collect */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Information We Do Not Collect</h2>
            <p>The Service does not collect or store the following data:</p>
            <ul className="mt-3 list-disc list-inside space-y-1">
              <li>Google Calendar events from past or future dates (only today's events are fetched)</li>
              <li>Data from other Google services such as Contacts, Gmail, or Drive</li>
              <li>Detailed Toggl Track work history (displayed only, never stored)</li>
              <li>Raw text used for screen analysis</li>
              <li>Payment information such as credit card or bank account details</li>
            </ul>
          </section>

          {/* 3. How We Use Your Information */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">3. How We Use Your Information</h2>
            <p>Collected information is used exclusively for the following purposes:</p>
            <ul className="mt-3 list-disc list-inside space-y-1">
              <li>Providing login and authentication for the Service</li>
              <li>Displaying today's schedule via Google Calendar integration</li>
              <li>Displaying the work timer via Toggl Track integration</li>
              <li>Providing distraction detection and notification features</li>
              <li>Recording, managing, and generating summary reports of work logs</li>
              <li>Responding to service issues and improving service quality</li>
            </ul>
            <p className="mt-3 font-medium text-gray-900">
              Data obtained from Google APIs will not be used for advertising, sold to third parties, or
              used for any purpose other than providing the Service to you.
            </p>
          </section>

          {/* 4. Sharing with Third Parties */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Sharing with Third Parties</h2>
            <p>
              The Company does not sell, rent, or share your personal information or Google user data
              with third parties, except in the following cases:
            </p>
            <ul className="mt-3 list-disc list-inside space-y-2">
              <li>
                <strong>Legal requirements:</strong> When we receive a legally binding disclosure order
                from a court or government authority.
              </li>
              <li>
                <strong>Service infrastructure providers:</strong> The Service uses Supabase
                (authentication and database) and Vercel (hosting) as infrastructure. Appropriate data
                processing agreements are in place with these providers.
              </li>
            </ul>
          </section>

          {/* 5. Data Retention and Deletion */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Data Retention and Deletion</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse border border-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-700">Data Type</th>
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-700">Retention Period</th>
                    <th className="border border-gray-200 px-4 py-2 text-left font-medium text-gray-700">Deletion Trigger</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2">Google account information</td>
                    <td className="border border-gray-200 px-4 py-2">While account is active</td>
                    <td className="border border-gray-200 px-4 py-2">Account deletion or Google access revocation</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="border border-gray-200 px-4 py-2">Google Calendar data</td>
                    <td className="border border-gray-200 px-4 py-2">Not stored (display only)</td>
                    <td className="border border-gray-200 px-4 py-2">—</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2">Toggl API token</td>
                    <td className="border border-gray-200 px-4 py-2">Until user deletes it</td>
                    <td className="border border-gray-200 px-4 py-2">User clears browser local storage</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="border border-gray-200 px-4 py-2">Work logs</td>
                    <td className="border border-gray-200 px-4 py-2">While account is active</td>
                    <td className="border border-gray-200 px-4 py-2">User deletes individual logs or account</td>
                  </tr>
                  <tr>
                    <td className="border border-gray-200 px-4 py-2">Screen analysis text</td>
                    <td className="border border-gray-200 px-4 py-2">Not stored (API request only)</td>
                    <td className="border border-gray-200 px-4 py-2">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* 6. Your Rights */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Your Rights</h2>
            <p>You can exercise the following rights at any time:</p>
            <ul className="mt-3 list-disc list-inside space-y-2">
              <li>
                <strong>Revoke Google access:</strong> Visit the{" "}
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Google Account Permissions page
                </a>{" "}
                to revoke the Service's access. All Google-related data held by the Company will be
                promptly deleted.
              </li>
              <li>
                <strong>Delete work logs:</strong> You can delete individual logs directly within the
                Service.
              </li>
              <li>
                <strong>Delete your account:</strong> Contact us at the address below to request full
                account deletion. All data associated with your account will be removed.
              </li>
              <li>
                <strong>Data access request:</strong> Contact us at the address below to request
                disclosure of the personal data we hold about you.
              </li>
            </ul>
          </section>

          {/* 7. Cookies and Local Storage */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Cookies and Local Storage</h2>
            <p>The Service uses cookies and local storage for the following purposes:</p>
            <ul className="mt-3 list-disc list-inside space-y-1">
              <li>
                <strong>Session cookie:</strong> Maintaining your logged-in state (up to 30 days)
              </li>
              <li>
                <strong>Local storage:</strong> Storing your Toggl API token, workspace ID, Gemini API
                key, and user preferences
              </li>
            </ul>
            <p className="mt-3">
              You may disable cookies in your browser settings, but this may prevent the login feature
              from working properly.
            </p>
          </section>

          {/* 8. Security */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Security</h2>
            <p>
              The Company implements the following measures to prevent unauthorized access to, leakage
              of, and tampering with collected information:
            </p>
            <ul className="mt-3 list-disc list-inside space-y-1">
              <li>HTTPS encryption for all communications</li>
              <li>Row-level security (RLS) enforced by Supabase</li>
              <li>HttpOnly and SameSite attributes on session cookies</li>
              <li>
                Sensitive credentials (API tokens, keys) are never stored on the server — only in the
                user's browser local storage
              </li>
            </ul>
          </section>

          {/* 9. Children's Privacy */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Children's Privacy</h2>
            <p>
              The Service is not directed at children under the age of 13, and we do not knowingly
              collect data from children under 13. If we become aware that data from a child under 13
              has been collected unintentionally, we will delete it promptly.
            </p>
          </section>

          {/* 10. Third-Party Privacy Policies */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">
              10. Third-Party Service Privacy Policies
            </h2>
            <p>
              Please review the privacy policies of the third-party services the Service integrates
              with:
            </p>
            <ul className="mt-3 list-disc list-inside space-y-1">
              <li>
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Google Privacy Policy
                </a>
              </li>
              <li>
                <a
                  href="https://toggl.com/track/privacy-policy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Toggl Track Privacy Policy
                </a>
              </li>
              <li>
                <a
                  href="https://supabase.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Supabase Privacy Policy
                </a>
              </li>
            </ul>
          </section>

          {/* 11. Changes to This Policy */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">11. Changes to This Policy</h2>
            <p>
              The Company may update this Privacy Policy from time to time. Material changes will be
              communicated within the Service or by email. The updated policy takes effect when posted
              on this page.
            </p>
          </section>

          {/* 12. Contact */}
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">12. Contact</h2>
            <p>
              For questions about this policy, data deletion or access requests, or any other
              privacy-related inquiries, please contact us at:
            </p>
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
            <Link href="/terms/en" className="text-blue-600 hover:underline">
              Terms of Service
            </Link>
            <Link href="/privacy" className="text-blue-600 hover:underline">
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
