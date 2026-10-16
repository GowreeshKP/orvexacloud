// Example homepage section that only this store shows. Enable it in ../store.tsx.

import type { StoreSectionProps } from '@/tenants/store-module'

export default function PromoBanner({ tenant, onNavigate }: StoreSectionProps) {
  return (
    <section className="py-14 px-6 text-center text-white" style={{ background: tenant.theme.primaryColor }}>
      <h2 className="text-3xl md:text-4xl mb-3" style={{ fontFamily: 'var(--font-display)' }}>
        {tenant.brandName} festive edit
      </h2>
      <p className="text-sm text-white/80 mb-6">Limited pieces, made in small batches.</p>
      <button
        onClick={() => onNavigate('catalog', 'all')}
        className="bg-white text-black text-[11px] font-bold tracking-[0.25em] uppercase px-8 py-3 cursor-pointer"
      >
        Shop the edit
      </button>
    </section>
  )
}
