// Example override for the homepage hero. Enable it in ../store.tsx.
// `Default` is the platform's hero: wrap it to add things around it, or return your own
// markup instead to replace it completely.

import type { SlotProps } from '@/tenants/store-module'

export default function Hero({ Default, ...props }: SlotProps<'Hero'>) {
  return (
    <div className="relative">
      <Default {...props} />
      <div className="absolute top-6 left-6 z-20 bg-white/90 px-4 py-2 text-[10px] font-bold tracking-[0.25em] uppercase">
        New season
      </div>
    </div>
  )
}
