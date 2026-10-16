// --- Orvexa Cloud E-Commerce Platform Application ---
// Standalone application dedicated to the Orvexa Cloud Commerce Platform.
// Features 1-Tap UPI/Razorpay demo checkout, interactive milestone journeys,
// live brand showcase, transparent pricing calculator, and store onboarding.

import PlatformWebsite from './components/platform/PlatformWebsite'

export default function App() {
  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans antialiased selection:bg-blue-100 selection:text-blue-900">
      <PlatformWebsite />
    </div>
  )
}
