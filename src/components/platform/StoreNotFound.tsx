export default function StoreNotFound({ slug }: { slug?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <div className="text-center max-w-md px-6">
        <p className="text-6xl mb-4">🏪</p>
        <h1 className="text-2xl font-serif mb-2">Store not found</h1>
        <p className="text-sm text-black/60 mb-6">
          {slug
            ? `Nothing is published at /t/${slug}. Check the address or open it from the seller portal.`
            : 'This address is not connected to an Orvexa store.'}
        </p>
        <a
          href="/admin"
          className="inline-block bg-black text-white text-xs font-bold tracking-widest uppercase px-6 py-3 hover:bg-stone-800 transition-colors"
        >
          Platform admin
        </a>
      </div>
    </div>
  )
}
