import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import type { CatalogProduct } from '@orvexa/theme'
import { submitStorefrontOrder } from '@/api/storefront-analytics'
import { storeInbox } from '@/api/store-messages'

type CartLine = {
  productId: number
  title: string
  priceMinor: number
  quantity: number
  size?: string
  image?: string
}

type Props = {
  slug: string
  tenantId: string
  products: CatalogProduct[]
  children: ReactNode
}

function formatInr(minor: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(minor / 100)
}

/**
 * Wires published Studio storefront HTML forms (buy / newsletter / contact / cart)
 * into Orvexa Cloud APIs so Orders, Customers and Messages update in the seller portal.
 */
export default function StudioLiveCommerce({ slug, tenantId, products, children }: Props) {
  const [cart, setCart] = useState<CartLine[]>([])
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'cart' | 'checkout' | 'done'>('cart')
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState('')
  const [orderId, setOrderId] = useState('')
  const [toast, setToast] = useState('')
  const [contactOpen, setContactOpen] = useState(false)
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const totalMinor = cart.reduce((sum, line) => sum + line.priceMinor * line.quantity, 0)
  const count = cart.reduce((sum, line) => sum + line.quantity, 0)

  const flash = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast((current) => (current === message ? '' : current)), 3500)
  }, [])

  const addToCart = useCallback((productId: string, variantId?: string) => {
    const product = productById.get(productId)
    if (!product) {
      flash('That product is no longer available.')
      return
    }
    const numericId = Number(product.id)
    if (!Number.isFinite(numericId) || numericId < 1) {
      flash('This product cannot be ordered yet. Ask the store to re-save it.')
      return
    }
    const variant = product.variants.find((v) => v.id === variantId) || product.variants[0]
    const size = variant?.title
    setCart((prev) => {
      const keyMatch = (line: CartLine) => line.productId === numericId && (line.size || '') === (size || '')
      const existing = prev.find(keyMatch)
      if (existing) {
        return prev.map((line) => (keyMatch(line) ? { ...line, quantity: Math.min(99, line.quantity + 1) } : line))
      }
      return [
        ...prev,
        {
          productId: numericId,
          title: product.title,
          priceMinor: product.priceMinor,
          quantity: 1,
          size,
          image: product.images[0]?.url,
        },
      ]
    })
    setStep('cart')
    setOpen(true)
    setError('')
  }, [flash, productById])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const bag = target?.closest?.('a[aria-label="Bag"]')
      if (bag) {
        event.preventDefault()
        setStep('cart')
        setOpen(true)
      }
      const contactLink = target?.closest?.('a[href$="/pages/contact"], a[href$="/contact"]')
      if (contactLink && (contactLink as HTMLAnchorElement).pathname.includes('contact')) {
        // Allow navigation; contact form is injected on the contact page via children wrapper.
      }
    }

    const onSubmit = (event: Event) => {
      const form = event.target as HTMLFormElement | null
      if (!form) return
      const action = (form.getAttribute('action') || '').toLowerCase()

      if (form.classList.contains('oxs-buy-form') || action.includes('/cart/add')) {
        event.preventDefault()
        const data = new FormData(form)
        const productId = String(data.get('productId') || '')
        const variantId = String(data.get('variantId') || '')
        addToCart(productId, variantId || undefined)
        return
      }

      if (form.classList.contains('oxs-newsletter__form') || action.includes('/newsletter')) {
        event.preventDefault()
        const data = new FormData(form)
        const email = String(data.get('email') || '').trim()
        if (!email) return
        void storeInbox.subscribeRemote(slug, tenantId, email)
          .then((created) => flash(created ? 'Thanks — you are on the list.' : 'You are already subscribed.'))
          .catch((err) => flash(err instanceof Error ? err.message : 'Could not subscribe.'))
        form.reset()
        return
      }

      if (form.classList.contains('oxs-contact-form')) {
        event.preventDefault()
        const data = new FormData(form)
        void storeInbox.submitMessage(slug, tenantId, {
          name: String(data.get('name') || '').trim(),
          email: String(data.get('email') || '').trim(),
          phone: String(data.get('phone') || '').trim(),
          subject: String(data.get('subject') || 'Storefront message').trim(),
          message: String(data.get('message') || '').trim(),
        })
          .then(() => {
            flash('Message sent. The store will reply by email.')
            form.reset()
            setContactOpen(false)
          })
          .catch((err) => flash(err instanceof Error ? err.message : 'Could not send your message.'))
      }
    }

    document.addEventListener('click', onClick, true)
    document.addEventListener('submit', onSubmit, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('submit', onSubmit, true)
    }
  }, [addToCart, flash, slug, tenantId])

  // On contact page, inject a working form under the studio contact card.
  useEffect(() => {
    const path = window.location.pathname.toLowerCase()
    setContactOpen(path.includes('/contact') || path.endsWith('/pages/contact'))
  }, [])

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cart.length || placing) return
    setPlacing(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const payment = String(form.get('paymentMethod') || 'UPI')
    const result = await submitStorefrontOrder(slug, {
      items: cart.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        size: line.size,
      })),
      shippingAddress: {
        name: String(form.get('name') || ''),
        phone: String(form.get('phone') || ''),
        address: String(form.get('address') || ''),
        city: String(form.get('city') || ''),
        state: String(form.get('state') || ''),
        pincode: String(form.get('pincode') || ''),
      },
      customerEmail: String(form.get('email') || '') || undefined,
      paymentMethod: payment,
    })
    setPlacing(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setOrderId(String(result.order.id || result.order.orderId || ''))
    setCart([])
    setStep('done')
  }

  return (
    <>
      {children}

      {contactOpen && (
        <div className="oxs-live-contact" style={sheet.contactWrap}>
          <form className="oxs-contact-form" style={sheet.contactCard}>
            <h2 style={sheet.h2}>Send a message</h2>
            <p style={sheet.muted}>Questions about orders, shipping or your products — we reply by email.</p>
            <label style={sheet.label}>Name<input name="name" required maxLength={120} style={sheet.input} /></label>
            <label style={sheet.label}>Email<input name="email" type="email" required maxLength={254} style={sheet.input} /></label>
            <label style={sheet.label}>Phone (optional)<input name="phone" maxLength={40} style={sheet.input} /></label>
            <label style={sheet.label}>Subject<input name="subject" maxLength={200} defaultValue="Storefront message" style={sheet.input} /></label>
            <label style={sheet.label}>Message<textarea name="message" required maxLength={4000} rows={4} style={sheet.textarea} /></label>
            <button type="submit" style={sheet.primaryBtn}>Send message</button>
          </form>
        </div>
      )}

      {open && (
        <div style={sheet.scrim} role="dialog" aria-modal="true" aria-label="Bag" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div style={sheet.panel}>
            <header style={sheet.panelHead}>
              <strong>{step === 'done' ? 'Order placed' : step === 'checkout' ? 'Checkout' : `Bag (${count})`}</strong>
              <button type="button" style={sheet.ghostBtn} onClick={() => setOpen(false)}>Close</button>
            </header>

            {step === 'cart' && (
              <div style={sheet.body}>
                {cart.length === 0 ? (
                  <p style={sheet.muted}>Your bag is empty. Add a product from the store.</p>
                ) : (
                  <ul style={sheet.list}>
                    {cart.map((line) => (
                      <li key={`${line.productId}-${line.size || ''}`} style={sheet.line}>
                        <div>
                          <strong>{line.title}</strong>
                          <p style={sheet.muted}>{line.size ? `Size ${line.size} · ` : ''}{formatInr(line.priceMinor)}</p>
                        </div>
                        <div style={sheet.qty}>
                          <button type="button" style={sheet.ghostBtn} onClick={() => setCart((prev) => prev.map((l) => l === line ? { ...l, quantity: Math.max(1, l.quantity - 1) } : l))}>−</button>
                          <span>{line.quantity}</span>
                          <button type="button" style={sheet.ghostBtn} onClick={() => setCart((prev) => prev.map((l) => l === line ? { ...l, quantity: Math.min(99, l.quantity + 1) } : l))}>+</button>
                          <button type="button" style={sheet.ghostBtn} onClick={() => setCart((prev) => prev.filter((l) => l !== line))}>Remove</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <footer style={sheet.footer}>
                  <p><strong>Total</strong> {formatInr(totalMinor)}</p>
                  <button type="button" style={sheet.primaryBtn} disabled={!cart.length} onClick={() => setStep('checkout')}>Checkout</button>
                </footer>
              </div>
            )}

            {step === 'checkout' && (
              <form style={sheet.body} onSubmit={(e) => void placeOrder(e)}>
                <label style={sheet.label}>Full name<input name="name" required maxLength={100} style={sheet.input} /></label>
                <label style={sheet.label}>Phone<input name="phone" required maxLength={20} inputMode="tel" style={sheet.input} /></label>
                <label style={sheet.label}>Email<input name="email" type="email" maxLength={254} style={sheet.input} /></label>
                <label style={sheet.label}>Address<textarea name="address" required maxLength={500} rows={2} style={sheet.textarea} /></label>
                <div style={sheet.row}>
                  <label style={sheet.label}>City<input name="city" required maxLength={100} style={sheet.input} /></label>
                  <label style={sheet.label}>State<input name="state" required maxLength={100} style={sheet.input} /></label>
                </div>
                <label style={sheet.label}>PIN code<input name="pincode" required maxLength={10} inputMode="numeric" style={sheet.input} /></label>
                <fieldset style={sheet.fieldset}>
                  <legend>Payment</legend>
                  <label><input type="radio" name="paymentMethod" value="UPI" defaultChecked /> UPI</label>
                  <label><input type="radio" name="paymentMethod" value="COD" /> Cash on delivery</label>
                  <label><input type="radio" name="paymentMethod" value="Card" /> Card</label>
                </fieldset>
                {error && <p style={sheet.error} role="alert">{error}</p>}
                <footer style={sheet.footer}>
                  <button type="button" style={sheet.ghostBtn} onClick={() => setStep('cart')}>Back</button>
                  <button type="submit" style={sheet.primaryBtn} disabled={placing}>{placing ? 'Placing…' : `Pay ${formatInr(totalMinor)}`}</button>
                </footer>
              </form>
            )}

            {step === 'done' && (
              <div style={sheet.body}>
                <p>Thank you. Your order{orderId ? ` ${orderId}` : ''} is confirmed. The store can see it under Orders.</p>
                <button type="button" style={sheet.primaryBtn} onClick={() => setOpen(false)}>Continue shopping</button>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && <div style={sheet.toast} role="status">{toast}</div>}
    </>
  )
}

const sheet: Record<string, CSSProperties> = {
  scrim: { position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(18,22,58,0.45)', display: 'grid', placeItems: 'end center', padding: 16 },
  panel: { width: 'min(100%, 420px)', maxHeight: 'min(92dvh, 720px)', background: '#fff', borderRadius: 16, overflow: 'auto', boxShadow: '0 24px 60px rgba(18,22,58,0.28)', display: 'grid', gridTemplateRows: 'auto 1fr' },
  panelHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid #e8eaf3' },
  body: { padding: 16, display: 'grid', gap: 12, alignContent: 'start' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 },
  line: { display: 'grid', gap: 8, paddingBottom: 10, borderBottom: '1px solid #eef0f7' },
  qty: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 8 },
  label: { display: 'grid', gap: 6, fontWeight: 600, fontSize: 13 },
  input: { minHeight: 40, padding: '0 10px', border: '1px solid #d9dcec', borderRadius: 10, font: 'inherit' },
  textarea: { padding: 10, border: '1px solid #d9dcec', borderRadius: 10, font: 'inherit', resize: 'vertical' },
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  fieldset: { border: '1px solid #e8eaf3', borderRadius: 10, padding: 10, display: 'grid', gap: 6 },
  primaryBtn: { minHeight: 42, padding: '0 16px', border: 0, borderRadius: 10, background: '#12163a', color: '#fff', fontWeight: 700, cursor: 'pointer' },
  ghostBtn: { minHeight: 36, padding: '0 10px', border: '1px solid #d9dcec', borderRadius: 8, background: '#fff', cursor: 'pointer' },
  muted: { margin: 0, color: '#596083', fontSize: 13 },
  error: { margin: 0, color: '#c92f36', fontWeight: 600 },
  toast: { position: 'fixed', zIndex: 95, left: '50%', bottom: 24, transform: 'translateX(-50%)', background: '#12163a', color: '#fff', padding: '10px 16px', borderRadius: 12, maxWidth: '92vw' },
  contactWrap: { maxWidth: 720, margin: '0 auto 3rem', padding: '0 1.25rem' },
  contactCard: { display: 'grid', gap: 12, padding: 20, borderRadius: 16, background: '#fff', border: '1px solid #e8eaf3' },
  h2: { margin: 0, fontSize: '1.35rem' },
}
