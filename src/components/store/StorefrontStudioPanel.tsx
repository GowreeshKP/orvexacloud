import EmbeddedStorefrontStudio from '@/components/store/EmbeddedStorefrontStudio'

/**
 * Tenant admin → Storefront.
 * Embeds orvexa-storefront-studio editor in-place (no external STUDIO_URL / launch JWT).
 */
export default function StorefrontStudioPanel({ onToast }: { onToast: (msg: string) => void }) {
  return <EmbeddedStorefrontStudio onToast={onToast} />
}
