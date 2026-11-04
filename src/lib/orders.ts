import type { TrackedOrder } from '@/types'

/** Normalize API / mongoose order documents into the TrackedOrder shape both portals use. */
export function normalizeTrackedOrder(raw: any): TrackedOrder | null {
  if (!raw || typeof raw !== 'object') return null
  const id = String(raw.id || '').trim()
  if (!id) return null

  const addr = raw.shippingAddress && typeof raw.shippingAddress === 'object' ? raw.shippingAddress : {}
  const items = Array.isArray(raw.items)
    ? raw.items.map((item: any) => ({
        productId: typeof item?.productId === 'number' ? item.productId : undefined,
        name: String(item?.name || item?.product?.name || 'Product'),
        price: Number(item?.price) || 0,
        quantity: Math.max(1, Number(item?.quantity) || 1),
        size: String(item?.size || item?.selectedSize || ''),
        lining: item?.lining ? String(item.lining) : undefined,
        zip: item?.zip ? String(item.zip) : undefined,
        length: item?.length ? String(item.length) : undefined,
        image: String(item?.image || item?.imgMain || ''),
      }))
    : []

  const statusRaw = String(raw.status || 'Processing')
  const status = (
    ['Processing', 'In Transit', 'Out for Delivery', 'Delivered', 'Cancelled'].includes(statusRaw)
      ? statusRaw
      : 'Processing'
  ) as TrackedOrder['status']

  const dateRaw = String(raw.date || '')
  let date = dateRaw
  if (/^\d{4}-\d{2}-\d{2}/.test(dateRaw) || dateRaw.includes('T')) {
    const parsed = new Date(dateRaw)
    if (!Number.isNaN(parsed.getTime())) {
      date = parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    }
  }

  return {
    id,
    date,
    status,
    courier: String(raw.courier || ''),
    awb: String(raw.awb || ''),
    estimatedDelivery: String(raw.estimatedDelivery || ''),
    items,
    subtotal: Number(raw.subtotal) || items.reduce((s: number, i: { price: number; quantity: number }) => s + i.price * i.quantity, 0),
    discount: Number(raw.discount) || 0,
    discountCode: raw.discountCode ? String(raw.discountCode) : undefined,
    shipping: Number(raw.shipping) || 0,
    total: Number(raw.total) || 0,
    paymentMethod: String(raw.paymentMethod || 'UPI'),
    customerEmail: raw.customerEmail ? String(raw.customerEmail) : undefined,
    shippingAddress: {
      name: String(addr.name || ''),
      phone: String(addr.phone || ''),
      address: String(addr.address || ''),
      city: String(addr.city || ''),
      state: String(addr.state || ''),
      pincode: String(addr.pincode || ''),
    },
    timeline: Array.isArray(raw.timeline)
      ? raw.timeline.map((step: any, i: number) => ({
          title: String(step?.title || ''),
          time: String(step?.time || ''),
          desc: String(step?.desc || ''),
          completed: Boolean(step?.completed),
          current: i === 0 ? true : undefined,
        }))
      : [],
  }
}
