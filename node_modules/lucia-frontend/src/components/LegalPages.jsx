// src/pages/LegalPages.jsx
import React from 'react'
import '../styles/legal-pages.css'

const LAST_UPDATED = 'September 20, 2025' // Asia/Manila

function BackButton({ onClick }) {
  return (
    <button className="legal-back-btn" onClick={onClick} title="Back to chat">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
      </svg>
      Back to chat
    </button>
  )
}

// -------------------- TERMS OF SERVICE --------------------
function TermsOfService({ onBack }) {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <div className="legal-header">
          <BackButton onClick={onBack} />
          <h1>LUCIA Terms of Service</h1>
          <p className="legal-updated">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="legal-content">
          <section>
            <h2>1. The Service</h2>
            <p>
              LUCIA is an AI-powered assistant that provides context and perspective to users’ situations through what we call Digital Intuition.
              LUCIA infers meaning from minimal details, may sometimes generate responses that feel highly accurate, and at other times may introduce noise or lose coherence.
              LUCIA also includes a random, statistical component in her reasoning. The underlying AI never gives the same answer twice, and this variability is not under our control.
              LUCIA’s role is to highlight blind spots and create perspective. She does not provide medical, legal, or financial advice.
              You should not rely on her outputs as absolute truth, and you remain responsible for your decisions.
              A helpful analogy: LUCIA is like GPS navigation — she guides you, but you remain the driver.
              You don’t drive off a cliff just because the map says the road continues, and you don’t enter a path too narrow for cars only because it looks shorter.
            </p>
          </section>

          <section>
            <h2>2. Plans</h2>
            <h3>2A. Fair Use</h3>
            <p>
              To protect service quality, system stability, and long-term sustainability, LUCIA applies fair-use limits across all available plans.
              Usage patterns that materially exceed typical individual use, including but not limited to automated or scripted interactions,
              unusually high request rates, or activity that degrades service performance for other users, may be considered abusive.
            </p>
            <p>
              In such cases, LUCIA may apply technical measures to mitigate the impact on service availability, including temporary rate limiting or throttling.
              Where reasonable, we will notify you and may suggest adjustments to your usage or plan.
            </p>
            <p>
              If excessive usage persists after notice, we may apply additional charges disclosed in advance or temporarily suspend access in order to restore normal service levels.
              These measures also help us comply with external AI provider rate limits and service policies.
            </p>
          </section>

          <section>
            <h2>3. Acceptable Use</h2>
            <p>
              Note: Your use of LUCIA must also comply with applicable third-party AI service usage policies and service terms.
              If such third-party services restrict or suspend access due to policy or rate-limit violations, we may need to limit, throttle, or suspend your access accordingly.
            </p>
            <p>
              You agree not to use LUCIA to engage in illegal activities, transmit harmful or abusive content, or attempt to interfere with the system’s operation.
              We reserve the right to suspend or terminate accounts that violate these Terms.
            </p>
          </section>

          <section>
            <h2>4. Availability</h2>
            <p>
              We aim to keep LUCIA available and functioning, but we do not guarantee uninterrupted service. Downtime, updates, or technical issues may occur.
            </p>
          </section>

          <section>
            <h2>5. Disclaimers</h2>
            <p>
              LUCIA is provided “as is.” While we strive for accuracy, outputs may be incomplete, inaccurate, or inconsistent.
              We disclaim all warranties to the maximum extent permitted by law.
              LUCIA does not provide medical, legal, or financial advice. Any outputs are for context and perspective only.
              All decisions remain the sole responsibility of the user.
              Outputs are provided for context and perspective only and must not be relied upon as a substitute for professional advice of any kind.
            </p>
          </section>

          <section>
            <h2>6. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, LUCIA and its operators shall not be liable for any damages arising from use of the service,
              including lost profits, data loss, or other indirect, incidental, or consequential damages.
            </p>
          </section>

          <section>
            <h2>7. Termination</h2>
            <p>
              We may suspend or terminate your access to LUCIA at any time if you violate these Terms.
              You may also request account termination and deletion of your data at any time by contacting <a href="mailto:lucia.decode@proton.me">lucia.decode@proton.me</a>.
            </p>
          </section>

          <section>
            <h2>8. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of Spain and the European Union.
            </p>
          </section>

          <section>
            <h2>9. Contact Information</h2>
            <p>
              If you have questions about these Terms, please contact us at <a href="mailto:lucia.decode@proton.me">lucia.decode@proton.me</a>.
            </p>
          </section>

          <section>
            <h2>10. Fiscal Residence</h2>
            <p>
              Users are responsible for providing accurate information about their country of fiscal residence.
              Access to Lucía may be restricted in certain countries.
              If a user provides false or misleading information in order to access the service, they assume full responsibility,
              and Lucía and its operators are not liable for any consequences.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

// -------------------- PRIVACY POLICY --------------------
function PrivacyPolicy({ onBack }) {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <div className="legal-header">
          <BackButton onClick={onBack} />
          <h1>Privacy Policy</h1>
          <p className="legal-updated">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="legal-content">
          <section>
            <h2>1. Your Account</h2>
            <p>
              To use LUCIA, you must register for an account using either Google Sign-In, email and password, or email link.
              You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account.
              LUCIA is not liable for unauthorized use of your account.
              You must ensure your email is valid and accessible, as deletion requests can only be processed if sent from the registered email.
            </p>
          </section>

          <section>
            <h2>2. Third-Party Services</h2>
            <p>
              LUCIA integrates with third-party services, including cloud infrastructure, authentication, analytics, and external AI processing providers.
              These third-party services are used strictly to operate and deliver the functionality of the application.
            </p>
            <p>
              LUCIA is not responsible for the availability, security, continuity, or data practices of such third-party services.
              Users acknowledge that interactions processed through external AI processing providers are subject to the technical and legal conditions of those providers.
            </p>
            <p>
              This section should be read together with Section 4 (Content and Privacy).
            </p>
          </section>

          <section>
            <h2>3. Signup Data</h2>
            <ul>
              <li>– Email + Fiscal Residence = mandatory at signup.</li>
              <li>– Full Name + Physical Address = fields must exist but remain optional at signup.</li>
              <li>– When a user requests a formal invoice, then the system must force Full Name + Address before issuing it.</li>
            </ul>
            <p>
              During its initial launch phase, LUCIA may not be available to users located in the European Union.
              This limitation applies exclusively to the launch phase and is temporary in nature.
            </p>
            <p>
              Once LUCIA becomes available within the European Union, this limitation shall automatically cease to apply without requiring an update or replacement of this Privacy Policy.
            </p>
          </section>

          <section>
            <h2>4. Content and Privacy</h2>
            <h3>Fair-Use Enforcement Metrics</h3>
            <p>
              To enforce fair-use across available subscription plans (including weekly and monthly plans) and protect service availability,
              we process limited usage metadata (for example, message counts, token totals, request rate, and plan tier).
              This process does not involve reading or analyzing the content of your messages.
            </p>
            <p>
              Your messages are transmitted using industry-standard encryption and stored securely within our database infrastructure.
              LUCIA administrators cannot read your threads, prompts, past conversations, or access deleted chats.
            </p>
            <p>
              While we guarantee privacy and data protection within our systems, we do not control how external AI processing providers may process text strictly for the purpose of generating responses.
            </p>
            <p>
              You have the right to request deletion of your email and account data at any time by contacting <a href="mailto:lucia.decode@proton.me">lucia.decode@proton.me</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

export default function LegalPages({ page, onBack }) {
  if (page === 'terms') return <TermsOfService onBack={onBack} />
  if (page === 'privacy') return <PrivacyPolicy onBack={onBack} />
  return null
}
