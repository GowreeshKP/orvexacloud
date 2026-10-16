import React, { useState } from 'react'

export type ComplianceDocType = 'gdpr' | 'dpdp' | 'ai-act' | 'privacy' | 'cookies' | 'accessibility'

interface LegalComplianceModalProps {
  isOpen: boolean
  initialTab?: ComplianceDocType
  onClose: () => void
  theme?: 'light' | 'dark'
}

export function LegalComplianceModal({
  isOpen,
  initialTab = 'gdpr',
  onClose,
  theme = 'light',
}: LegalComplianceModalProps) {
  const [activeTab, setActiveTab] = useState<ComplianceDocType>(initialTab)
  const [cookiePrefs, setCookiePrefs] = useState({
    necessary: true,
    analytics: true,
    functional: true,
    marketing: false,
  })
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [erasureRequest, setErasureRequest] = useState({
    name: '',
    email: '',
    phone: '',
    type: 'erasure',
    message: '',
    submitted: false,
  })

  // Keep active tab in sync if initialTab changes when opening
  React.useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab)
      setSaveSuccess(false)
    }
  }, [isOpen, initialTab])

  if (!isOpen) return null

  const tabs: { id: ComplianceDocType; label: string; tag?: string }[] = [
    { id: 'gdpr', label: 'GDPR Compliance', tag: 'EU Reg 2016/679' },
    { id: 'dpdp', label: 'India DPDP Act', tag: 'DPDPA 2023' },
    { id: 'ai-act', label: 'EU AI Act Ready', tag: '2026/2027' },
    { id: 'privacy', label: 'Privacy Policy' },
    { id: 'cookies', label: 'Cookie Preferences' },
    { id: 'accessibility', label: 'Accessibility', tag: 'WCAG 2.1 AA' },
  ]

  const handleSaveCookiePrefs = () => {
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 3000)
  }

  const handleSubmitDataRequest = (e: React.FormEvent) => {
    e.preventDefault()
    setErasureRequest((prev) => ({ ...prev, submitted: true }))
  }

  const isDark = theme === 'dark'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-10 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog Container (Clean Light Crisp White Theme) */}
      <div
        className={`relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200 border ${
          isDark
            ? 'bg-slate-900 border-white/10 text-slate-100'
            : 'bg-white border-slate-200/90 text-slate-900'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            isDark
              ? 'bg-slate-950/70 border-white/10'
              : 'bg-slate-50/90 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono text-sm font-bold ${
                isDark
                  ? 'bg-blue-500/20 border border-blue-500/30 text-blue-400'
                  : 'bg-blue-50 border border-blue-200 text-blue-600'
              }`}
            >
              §
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  className={`text-base font-bold tracking-tight ${
                    isDark ? 'text-white' : 'text-slate-950 font-display'
                  }`}
                >
                  Orvexa Tech Trust & Compliance Center
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold ${
                    isDark
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  Security-First
                </span>
              </div>
              <p
                className={`text-xs font-mono mt-0.5 ${
                  isDark ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                Legal Frameworks, Data Protection, AI Safety & Accessibility
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors cursor-pointer ${
              isDark
                ? 'text-slate-400 hover:text-white hover:bg-white/10'
                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/70'
            }`}
            aria-label="Close dialog"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          className={`flex items-center gap-1.5 px-6 pt-3 pb-2 border-b overflow-x-auto no-scrollbar ${
            isDark
              ? 'bg-slate-950/40 border-white/10'
              : 'bg-slate-50/50 border-slate-200'
          }`}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/25'
                    : isDark
                    ? 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                    : 'text-slate-600 hover:text-slate-950 hover:bg-slate-200/60'
                }`}
              >
                <span>{tab.label}</span>
                {tab.tag && (
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-medium ${
                      isActive
                        ? 'bg-blue-700 text-blue-100'
                        : isDark
                        ? 'bg-white/5 text-slate-400'
                        : 'bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    {tab.tag}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Modal Body */}
        <div
          className={`p-6 md:p-8 overflow-y-auto text-sm leading-relaxed space-y-6 flex-1 ${
            isDark ? 'text-slate-300' : 'text-slate-600 bg-white'
          }`}
        >
          {/* TAB 1: GDPR */}
          {activeTab === 'gdpr' && (
            <div className="space-y-6">
              <div
                className={`p-4 rounded-xl text-xs flex items-start gap-3 border ${
                  isDark
                    ? 'bg-blue-500/10 border-blue-500/20 text-blue-200'
                    : 'bg-blue-50/80 border-blue-200 text-blue-900'
                }`}
              >
                <span className="text-xl mt-0.5">🛡️</span>
                <div>
                  <p className={`font-bold ${isDark ? 'text-blue-100' : 'text-blue-950 font-display'}`}>
                    EU General Data Protection Regulation (GDPR) Commitment
                  </p>
                  <p className={`mt-0.5 ${isDark ? 'text-blue-300/90' : 'text-blue-800'}`}>
                    Orvexa Tech operates as a compliant Data Processor for merchants and a Data Controller for our direct account holders, in full adherence to EU Regulation 2016/679.
                  </p>
                </div>
              </div>

              <div>
                <h3 className={`text-base font-bold mb-1.5 ${isDark ? 'text-white' : 'text-slate-950 font-display'}`}>
                  1. Dedicated Database & Schema Isolation
                </h3>
                <p className="text-xs leading-relaxed">
                  Every merchant store provisioned on the Orvexa Platform is allocated a fully isolated MongoDB schema (
                  <code className="px-1.5 py-0.5 rounded font-mono text-[11px] bg-blue-50 text-blue-700 border border-blue-200">
                    orvexa_tenant_&#123;slug&#125;
                  </code>
                  ). Customer Personally Identifiable Information (PII), order history, and product catalogs are never stored in shared tables. Platform Super Administrators are restricted from accessing consumer PII or unmasking customer credentials without cryptographic audit logging.
                </p>
              </div>

              <div>
                <h3 className={`text-base font-bold mb-1.5 ${isDark ? 'text-white' : 'text-slate-950 font-display'}`}>
                  2. Lawful Basis & Special Category Data
                </h3>
                <p className="text-xs leading-relaxed">
                  Processing is conducted strictly under Article 6(1)(b) (performance of contract for order fulfillment) and Article 6(1)(a) (explicit consent for marketing & consultation bookings). Clinic and specialized appointment data are treated as special category data under Article 9, safeguarded by end-to-end encryption at rest (AES-256) and in transit (TLS 1.3).
                </p>
              </div>

              <div>
                <h3 className={`text-base font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-950 font-display'}`}>
                  3. Exercise Your GDPR Data Subject Rights
                </h3>
                <p className="text-xs leading-relaxed mb-4">
                  Under Articles 15 through 22, you have the Right to Access, Rectification, Erasure ("Right to be Forgotten"), Data Portability, and Restriction of Processing.
                </p>

                {erasureRequest.submitted ? (
                  <div
                    className={`p-4 rounded-xl text-xs border ${
                      isDark
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-900 font-medium'
                    }`}
                  >
                    ✓ Your data request has been received. Our Data Protection Officer (DPO) will process your request within 30 statutory days and notify you at the provided email address.
                  </div>
                ) : (
                  <form
                    onSubmit={handleSubmitDataRequest}
                    className={`p-5 rounded-xl border space-y-3 text-xs ${
                      isDark
                        ? 'bg-slate-950/60 border-white/10'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <p className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-950'}`}>
                      Submit a Data Subject Request (DSR)
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-500 mb-1 text-[11px] font-medium">Full Name</label>
                        <input
                          type="text"
                          required
                          value={erasureRequest.name}
                          onChange={(e) => setErasureRequest({ ...erasureRequest, name: e.target.value })}
                          placeholder="Jane Doe"
                          className={`w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 ${
                            isDark
                              ? 'bg-slate-900 border-white/10 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-blue-500'
                              : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:ring-blue-600'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 mb-1 text-[11px] font-medium">Email Address</label>
                        <input
                          type="email"
                          required
                          value={erasureRequest.email}
                          onChange={(e) => setErasureRequest({ ...erasureRequest, email: e.target.value })}
                          placeholder="jane@example.com"
                          className={`w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 ${
                            isDark
                              ? 'bg-slate-900 border-white/10 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-blue-500'
                              : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:ring-blue-600'
                          }`}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-slate-500 mb-1 text-[11px] font-medium">Request Type</label>
                      <select
                        value={erasureRequest.type}
                        onChange={(e) => setErasureRequest({ ...erasureRequest, type: e.target.value })}
                        className={`w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 ${
                          isDark
                            ? 'bg-slate-900 border-white/10 text-white focus:border-blue-500 focus:ring-blue-500'
                            : 'bg-white border-slate-300 text-slate-900 focus:border-blue-600 focus:ring-blue-600'
                        }`}
                      >
                        <option value="erasure">Right to Erasure (Delete all personal data)</option>
                        <option value="access">Right of Access (Download full personal data export)</option>
                        <option value="rectification">Right to Rectification (Correct inaccurate records)</option>
                        <option value="opt-out">Opt-out of Automated Processing & Profiling</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-500 mb-1 text-[11px] font-medium">Additional Details (Optional)</label>
                      <textarea
                        rows={2}
                        value={erasureRequest.message}
                        onChange={(e) => setErasureRequest({ ...erasureRequest, message: e.target.value })}
                        placeholder="Mention specific order numbers, consultation notes, or merchant storefront names..."
                        className={`w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 ${
                          isDark
                            ? 'bg-slate-900 border-white/10 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-blue-500'
                            : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:ring-blue-600'
                        }`}
                      />
                    </div>
                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs transition-all shadow-sm shadow-blue-500/20 cursor-pointer"
                    >
                      Submit Verified Request
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: INDIA DPDP */}
          {activeTab === 'dpdp' && (
            <div className="space-y-6">
              <div
                className={`p-4 rounded-xl text-xs flex items-start gap-3 border ${
                  isDark
                    ? 'bg-orange-500/10 border-orange-500/20 text-orange-200'
                    : 'bg-orange-50/80 border-orange-200 text-orange-950'
                }`}
              >
                <span className="text-xl mt-0.5">🇮🇳</span>
                <div>
                  <p className={`font-bold ${isDark ? 'text-orange-100' : 'text-orange-950 font-display'}`}>
                    Digital Personal Data Protection Act (DPDP), 2023
                  </p>
                  <p className={`mt-0.5 ${isDark ? 'text-orange-300/90' : 'text-orange-900'}`}>
                    Orvexa Tech is engineered for India's DPDP Act with sovereign Indian cloud data localization, explicit consent notices, and verifiable consent withdrawal workflows.
                  </p>
                </div>
              </div>

              <div>
                <h3 className={`text-base font-bold mb-1.5 ${isDark ? 'text-white' : 'text-slate-950 font-display'}`}>
                  1. Sovereign Cloud Residency (ap-south-1)
                </h3>
                <p className="text-xs leading-relaxed">
                  All Indian merchant data, customer addresses, phone numbers, and payment reconciliation records are strictly stored and processed in sovereign Indian data center regions (
                  <span className="font-mono font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                    AWS Mumbai / ap-south-1
                  </span>
                  ). Data is not transferred across borders except where explicitly authorized under central government regulations.
                </p>
              </div>

              <div>
                <h3 className={`text-base font-bold mb-1.5 ${isDark ? 'text-white' : 'text-slate-950 font-display'}`}>
                  2. Itemized Consent & Withdrawal
                </h3>
                <p className="text-xs leading-relaxed">
                  Under Section 6 of the DPDP Act, every consent request is presented in clear, plain language with specific purposes (e.g. order delivery, SMS OTP verification, transactional WhatsApp notifications). Data Principals may withdraw consent at any time through our portal or by messaging the Grievance Redressal Officer.
                </p>
              </div>

              <div>
                <h3 className={`text-base font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-950 font-display'}`}>
                  3. Grievance Redressal Officer (India)
                </h3>
                <div
                  className={`p-4 rounded-xl border text-xs space-y-1.5 font-mono ${
                    isDark
                      ? 'bg-slate-950/60 border-white/10'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <p className="text-slate-950 font-bold font-sans text-sm">Grievance & Data Protection Contact:</p>
                  <p><span className="text-slate-500">Designation:</span> Grievance Officer, Orvexa Tech Private Limited</p>
                  <p><span className="text-slate-500">Email:</span> <a href="mailto:grievance@orvexatech.in" className="text-blue-600 underline font-semibold">grievance@orvexatech.in</a></p>
                  <p><span className="text-slate-500">Address:</span> DB Road, RS Puram, Coimbatore, Tamil Nadu, 641002, India</p>
                  <p><span className="text-slate-500">Response SLA:</span> Within 48 business hours</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: EU AI ACT */}
          {activeTab === 'ai-act' && (
            <div className="space-y-6">
              <div
                className={`p-4 rounded-xl text-xs flex items-start gap-3 border ${
                  isDark
                    ? 'bg-purple-500/10 border-purple-500/20 text-purple-200'
                    : 'bg-purple-50/80 border-purple-200 text-purple-950'
                }`}
              >
                <span className="text-xl mt-0.5">🤖</span>
                <div>
                  <p className={`font-bold ${isDark ? 'text-purple-100' : 'text-purple-950 font-display'}`}>
                    EU Artificial Intelligence Act (EU AI Act) Ready
                  </p>
                  <p className={`mt-0.5 ${isDark ? 'text-purple-300/90' : 'text-purple-900'}`}>
                    Our AI models, AI Voice Receptionists, and automated recommendation engines are developed under transparent, safety-tested, and human-supervised guardrails aligned with EU AI Act 2026/2027 timelines.
                  </p>
                </div>
              </div>

              <div>
                <h3 className={`text-base font-bold mb-1.5 ${isDark ? 'text-white' : 'text-slate-950 font-display'}`}>
                  1. AI Transparency & Direct Disclosure
                </h3>
                <p className="text-xs leading-relaxed">
                  Under Article 50 transparency obligations, users are always explicitly informed when they are interacting with an AI voice receptionist, AI chat assistant, or synthetic automated agent. We provide visible visual indicators and audible voice disclosures before any conversational AI session begins.
                </p>
              </div>

              <div>
                <h3 className={`text-base font-bold mb-1.5 ${isDark ? 'text-white' : 'text-slate-950 font-display'}`}>
                  2. Mandatory Human-in-the-Loop Oversight
                </h3>
                <p className="text-xs leading-relaxed">
                  No automated AI system makes irreversible clinical, medical, or discriminatory commercial decisions. All complex patient inquiries, treatment recommendations, prescription requests, and payment discrepancies trigger instant fallback to human clinical staff or store operators.
                </p>
              </div>

              <div>
                <h3 className={`text-base font-bold mb-1.5 ${isDark ? 'text-white' : 'text-slate-950 font-display'}`}>
                  3. Model Governance & Audit Logging
                </h3>
                <p className="text-xs leading-relaxed">
                  Every prompt, transcription, tool call, and latency metric is logged in cryptographically hashed immutable audit logs (
                  <code className="px-1.5 py-0.5 rounded font-mono text-[11px] bg-purple-50 text-purple-700 border border-purple-200">
                    PlatformAuditLogs
                  </code>
                  ) to ensure complete traceability and continuous bias testing.
                </p>
              </div>
            </div>
          )}

          {/* TAB 4: PRIVACY */}
          {activeTab === 'privacy' && (
            <div className="space-y-6">
              <div>
                <h3 className={`text-base font-bold mb-1 ${isDark ? 'text-white' : 'text-slate-950 font-display'}`}>
                  Orvexa Tech Privacy Policy
                </h3>
                <p className="text-slate-400 text-xs font-mono mb-4">Last updated: September 2026</p>
                <p className="text-xs leading-relaxed">
                  Orvexa Tech Private Limited ("Orvexa", "we", "us") values the trust you place in us when using our multi-store commerce cloud, storefront engines, and clinic growth platforms. This Privacy Policy details how we collect, safeguard, and manage information.
                </p>
              </div>

              <div>
                <h4 className={`text-sm font-bold mb-1.5 ${isDark ? 'text-white' : 'text-slate-950'}`}>
                  1. Information We Collect
                </h4>
                <ul className="list-disc list-inside text-xs space-y-1.5 ml-1">
                  <li><strong className="text-slate-900">Merchant Account Data:</strong> Name, business registration, GSTIN, business email, store domain, and credentials.</li>
                  <li><strong className="text-slate-900">Order & Checkout Data:</strong> Shipping addresses, customer name, email, phone number, and transaction identifiers passed to secure payment gateways (Razorpay, Stripe, UPI).</li>
                  <li><strong className="text-slate-900">Technical Telemetry:</strong> IP addresses, browser fingerprint, session cookies, and performance logs for latency optimization and fraud prevention.</li>
                </ul>
              </div>

              <div>
                <h4 className={`text-sm font-bold mb-1.5 ${isDark ? 'text-white' : 'text-slate-950'}`}>
                  2. Zero Sale of Personal Data
                </h4>
                <p className="text-xs leading-relaxed">
                  Orvexa Tech does not sell, rent, monetize, or trade merchant or end-consumer personal data to third-party data brokers or advertising networks. Data is strictly processed for the execution of storefront commerce and requested services.
                </p>
              </div>

              <div>
                <h4 className={`text-sm font-bold mb-1.5 ${isDark ? 'text-white' : 'text-slate-950'}`}>
                  3. Security Standards
                </h4>
                <p className="text-xs leading-relaxed">
                  We employ bank-grade security: AES-256 database encryption at rest, TLS 1.3 in-transit encryption, automated rate limiting, dual-token JWT authentication with token rotation, and 24/7 DDoS mitigation.
                </p>
              </div>
            </div>
          )}

          {/* TAB 5: COOKIES */}
          {activeTab === 'cookies' && (
            <div className="space-y-6">
              <div>
                <h3 className={`text-base font-bold mb-1 ${isDark ? 'text-white' : 'text-slate-950 font-display'}`}>
                  Cookie Policy & Consent Center
                </h3>
                <p className="text-xs leading-relaxed">
                  We use cookies and similar browser storage mechanisms to authenticate active sessions, ensure cart persistence across store navigation, and analyze platform performance. Customize your cookie preferences below.
                </p>
              </div>

              <div className="space-y-3">
                {/* Essential */}
                <div
                  className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                    isDark
                      ? 'bg-slate-950/60 border-white/10'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-950 text-xs font-bold">Strictly Necessary Cookies</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold">
                        Always Active
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Required for secure user authentication (JWT session cookies), cart state, tenant routing, and CSRF protection.
                    </p>
                  </div>
                  <input type="checkbox" checked disabled className="w-4 h-4 accent-blue-600 cursor-not-allowed opacity-70" />
                </div>

                {/* Analytics */}
                <div
                  className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                    isDark
                      ? 'bg-slate-950/60 border-white/10'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div>
                    <span className="text-slate-950 text-xs font-bold">Performance & Analytics Cookies</span>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Helps us analyze site traffic, page load speed, error rates, and checkout funnel conversion.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={cookiePrefs.analytics}
                    onChange={(e) => setCookiePrefs({ ...cookiePrefs, analytics: e.target.checked })}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                </div>

                {/* Functional */}
                <div
                  className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                    isDark
                      ? 'bg-slate-950/60 border-white/10'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div>
                    <span className="text-slate-950 text-xs font-bold">Functional & Theme Preferences</span>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Remembers your currency selection, dark/light theme choices, and recently viewed products.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={cookiePrefs.functional}
                    onChange={(e) => setCookiePrefs({ ...cookiePrefs, functional: e.target.checked })}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                </div>

                {/* Marketing */}
                <div
                  className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                    isDark
                      ? 'bg-slate-950/60 border-white/10'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div>
                    <span className="text-slate-950 text-xs font-bold">Marketing & Attribution</span>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Enables campaign conversion tracking for clinics and merchants (Meta Pixel / Google Ads conversion API).
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={cookiePrefs.marketing}
                    onChange={(e) => setCookiePrefs({ ...cookiePrefs, marketing: e.target.checked })}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleSaveCookiePrefs}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs transition-colors shadow-sm shadow-blue-500/20 cursor-pointer"
                >
                  Save Cookie Preferences
                </button>
                {saveSuccess && (
                  <span className="text-xs text-emerald-600 font-semibold">✓ Preferences saved successfully!</span>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: ACCESSIBILITY */}
          {activeTab === 'accessibility' && (
            <div className="space-y-6">
              <div
                className={`p-4 rounded-xl text-xs flex items-start gap-3 border ${
                  isDark
                    ? 'bg-teal-500/10 border-teal-500/20 text-teal-200'
                    : 'bg-teal-50/80 border-teal-200 text-teal-950'
                }`}
              >
                <span className="text-xl mt-0.5">♿</span>
                <div>
                  <p className={`font-bold ${isDark ? 'text-teal-100' : 'text-teal-950 font-display'}`}>
                    Accessibility Statement (WCAG 2.1 Level AA)
                  </p>
                  <p className={`mt-0.5 ${isDark ? 'text-teal-300/90' : 'text-teal-900'}`}>
                    Orvexa Tech is dedicated to ensuring digital accessibility for people of all abilities, continually optimizing our platforms against the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA.
                  </p>
                </div>
              </div>

              <div>
                <h3 className={`text-base font-bold mb-1.5 ${isDark ? 'text-white' : 'text-slate-950 font-display'}`}>
                  1. Key Accessibility Features
                </h3>
                <ul className="list-disc list-inside text-xs space-y-1.5 ml-1">
                  <li><strong className="text-slate-900">Full Keyboard Navigability:</strong> All interactive elements, checkout buttons, modal dialogues, and dropdowns can be navigated using Tab, Shift+Tab, Enter, and Escape keys.</li>
                  <li><strong className="text-slate-900">Screen Reader Compatibility:</strong> Semantic HTML5 tags (<code className="px-1.5 py-0.5 rounded font-mono text-[11px] bg-teal-50 text-teal-700 border border-teal-200">&lt;nav&gt;</code>, <code className="px-1.5 py-0.5 rounded font-mono text-[11px] bg-teal-50 text-teal-700 border border-teal-200">&lt;main&gt;</code>, <code className="px-1.5 py-0.5 rounded font-mono text-[11px] bg-teal-50 text-teal-700 border border-teal-200">&lt;footer&gt;</code>) and descriptive ARIA landmarks are implemented.</li>
                  <li><strong className="text-slate-900">Color Contrast & Typography:</strong> Text meets a minimum contrast ratio of 4.5:1 against backgrounds, paired with scalable font units.</li>
                  <li><strong className="text-slate-900">Reduced Motion Support:</strong> Respects the user's OS-level <code className="px-1.5 py-0.5 rounded font-mono text-[11px] bg-teal-50 text-teal-700 border border-teal-200">prefers-reduced-motion</code> setting to disable heavy animations.</li>
                </ul>
              </div>

              <div>
                <h3 className={`text-base font-bold mb-1.5 ${isDark ? 'text-white' : 'text-slate-950 font-display'}`}>
                  2. Feedback & Assistance
                </h3>
                <p className="text-xs leading-relaxed">
                  If you encounter any accessibility barrier on our website or merchant storefronts, please let us know at <a href="mailto:accessibility@orvexatech.in" className="text-blue-600 underline font-semibold">accessibility@orvexatech.in</a>. We strive to remediate issues within 5 business days.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          className={`px-6 py-3.5 border-t flex items-center justify-between text-xs ${
            isDark
              ? 'bg-slate-950/80 border-white/10 text-slate-400'
              : 'bg-slate-50 border-slate-200 text-slate-500'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-mono text-[11px] font-semibold">Orvexa Tech Compliance Engine v2.6</span>
          </div>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg font-semibold text-xs transition-colors cursor-pointer ${
              isDark
                ? 'bg-white/10 hover:bg-white/15 text-white'
                : 'bg-slate-900 hover:bg-slate-800 text-white shadow-xs'
            }`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

interface ComplianceFooterLinksProps {
  onOpenComplianceDoc: (doc: ComplianceDocType) => void
  theme?: 'dark' | 'light'
}

/**
 * Reusable Compliance & Legal Links strip exactly matching orvexatech.io design:
 * Row 1: GDPR · INDIA DPDP · EU AI ACT READY (dotted underline)
 * Row 2: Privacy · Cookies · Accessibility
 */
export function ComplianceFooterLinks({
  onOpenComplianceDoc,
  theme = 'dark',
}: ComplianceFooterLinksProps) {
  const isDark = theme === 'dark'

  return (
    <div className="flex flex-col gap-2.5">
      {/* Row 1: Framework Badges (Dotted Underline, Monospace, Uppercase) */}
      <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
        <button
          type="button"
          onClick={() => onOpenComplianceDoc('gdpr')}
          className={`font-mono text-[11px] uppercase tracking-wider underline decoration-dotted underline-offset-4 cursor-pointer transition-colors ${
            isDark
              ? 'text-sky-400/80 hover:text-sky-300 decoration-sky-400/50 hover:decoration-sky-300'
              : 'text-sky-700/90 hover:text-sky-900 decoration-sky-600/50 hover:decoration-sky-700'
          }`}
        >
          GDPR
        </button>

        <button
          type="button"
          onClick={() => onOpenComplianceDoc('dpdp')}
          className={`font-mono text-[11px] uppercase tracking-wider underline decoration-dotted underline-offset-4 cursor-pointer transition-colors ${
            isDark
              ? 'text-sky-400/80 hover:text-sky-300 decoration-sky-400/50 hover:decoration-sky-300'
              : 'text-sky-700/90 hover:text-sky-900 decoration-sky-600/50 hover:decoration-sky-700'
          }`}
        >
          INDIA DPDP
        </button>

        <button
          type="button"
          onClick={() => onOpenComplianceDoc('ai-act')}
          className={`font-mono text-[11px] uppercase tracking-wider underline decoration-dotted underline-offset-4 cursor-pointer transition-colors ${
            isDark
              ? 'text-sky-400/80 hover:text-sky-300 decoration-sky-400/50 hover:decoration-sky-300'
              : 'text-sky-700/90 hover:text-sky-900 decoration-sky-600/50 hover:decoration-sky-700'
          }`}
        >
          EU AI ACT READY
        </button>
      </div>

      {/* Row 2: Standard Legal Links (Clean text) */}
      <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
        <button
          type="button"
          onClick={() => onOpenComplianceDoc('privacy')}
          className={`text-xs font-medium cursor-pointer transition-colors ${
            isDark ? 'text-sky-400/70 hover:text-sky-200' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Privacy
        </button>

        <button
          type="button"
          onClick={() => onOpenComplianceDoc('cookies')}
          className={`text-xs font-medium cursor-pointer transition-colors ${
            isDark ? 'text-sky-400/70 hover:text-sky-200' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Cookies
        </button>

        <button
          type="button"
          onClick={() => onOpenComplianceDoc('accessibility')}
          className={`text-xs font-medium cursor-pointer transition-colors ${
            isDark ? 'text-sky-400/70 hover:text-sky-200' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Accessibility
        </button>
      </div>
    </div>
  )
}
