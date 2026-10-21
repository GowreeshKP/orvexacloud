export default function StoreNotFound({ slug, error }: { slug?: string; error?: string | null }) {
  const closed = Boolean(error && /has closed|is suspended|is pending|not taking orders/.test(error))
  const title = closed ? 'This store is not available' : 'Store not found'
  const detail = !slug
    ? 'This address is not connected to an Orvexa store.'
    : error?.includes('has closed')
      ? `${slug} has been closed. An Orvexa admin can reopen it from the tenant list (set status to Active).`
      : error?.includes('is suspended')
        ? `${slug} has been suspended. An Orvexa admin can restore it from the tenant list.`
        : error?.includes('is pending')
          ? `${slug} is still under review and is not public yet.`
          : error?.includes('not taking orders')
            ? `${slug} is not taking orders right now.`
            : `Nothing is published at /t/${slug}. Check the address or open it from Orvexa admin.`

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <div className="text-center max-w-md px-6">
        <p className="text-6xl mb-4">🏪</p>
        <h1 className="text-2xl font-serif mb-2">{title}</h1>
        <p className="text-sm text-black/60 mb-6">{detail}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="/admin"
            className="inline-block border border-black text-black text-xs font-bold tracking-widest uppercase px-6 py-3 hover:bg-stone-100 transition-colors"
          >
            Platform admin
          </a>
        </div>
      </div>
    </div>
  )
}
