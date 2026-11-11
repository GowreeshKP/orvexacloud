import { sellerPortalUrl, platformAdminUrl, storefrontUrl } from '@/lib/store-urls'

export default function StoreNotFound({
  slug,
  temporary = false,
}: {
  slug?: string
  temporary?: boolean
}) {
  const clean = slug?.trim().toLowerCase()
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <div className="text-center max-w-md px-6">
        <p className="text-6xl mb-4">{temporary ? '⏳' : '🏪'}</p>
        <h1 className="text-2xl font-serif mb-2">
          {temporary ? 'Store temporarily unavailable' : 'Store not found'}
        </h1>
        <p className="text-sm text-black/60 mb-6">
          {temporary
            ? clean
              ? `“${clean}” exists but the platform could not load it just now. Retry, or open the seller dashboard from Platform admin.`
              : 'The platform could not load this store just now. Please retry in a moment.'
            : clean
              ? `We could not load “${clean}”. Use the seller dashboard link below, or open Platform admin and launch the store from there.`
              : 'This address is not connected to an Orvexa store.'}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {temporary && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-block bg-black text-white text-xs font-bold tracking-widest uppercase px-6 py-3 hover:bg-stone-800 transition-colors"
            >
              Retry
            </button>
          )}
          {clean && !temporary && (
            <a
              href={sellerPortalUrl(clean)}
              className="inline-block bg-black text-white text-xs font-bold tracking-widest uppercase px-6 py-3 hover:bg-stone-800 transition-colors"
            >
              Open seller dashboard
            </a>
          )}
          {clean && (
            <a
              href={storefrontUrl(clean)}
              className="inline-block border border-black/20 text-black text-xs font-bold tracking-widest uppercase px-6 py-3 hover:bg-stone-100 transition-colors"
            >
              Open storefront
            </a>
          )}
          <a
            href={platformAdminUrl()}
            className="inline-block border border-black/20 text-black text-xs font-bold tracking-widest uppercase px-6 py-3 hover:bg-stone-100 transition-colors"
          >
            Platform admin
          </a>
        </div>
      </div>
    </div>
  )
}
