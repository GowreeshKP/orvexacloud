import { Fragment, useState, useMemo, useEffect, useRef, type ComponentProps, type ComponentType, type CSSProperties } from 'react'
import DashboardApp from './layers/DashboardApp'
import AdminApp from './layers/AdminApp'
import { useApplicationLayer, useTenant, useSwitchLayer } from './context/TenantContext'
import { mockStore } from './api/mock-store'
import { auditLogger } from './api/audit-logger'
import { DEMO_MODE } from './api/auth'
import { DEMO_SHOPPER, shopperAccounts } from './api/shopper-accounts'
import { storeInbox } from './api/store-messages'
import { MOCK_TENANTS } from './data/mock-tenants'
import {
  getStoreCategories,
  getCategoryLabel,
  getStorefrontCopy,
  getShippingConfig,
  getHomeSections,
  isPdpOptionEnabled,
  isTemplateStore,
} from './data/store-niches'
import type { HomeSectionId, TenantConfig } from './types/tenant'
import ResetPasswordModal from './components/auth/ResetPasswordModal'
import { LegalComplianceModal, ComplianceFooterLinks, type ComplianceDocType } from './components/compliance/LegalComplianceModal'
import { StoreModuleContext, applyStoreTheme, useStoreComponent, useStoreModule } from './tenants/loader'
import type { StoreModule, StoreSection } from './tenants/store-module'
import StoreNotFound from './components/platform/StoreNotFound'
import { submitStorefrontOrder, trackStorefrontEvent } from './api/storefront-analytics'
import { storefrontUrl } from './lib/store-urls'
import { apiClient } from './api/client'

// --- THE LUNAR CLOTHING OFFICIAL PRODUCT DATASET ---
export interface Product {
  id: number
  name: string
  category: string
  sculptLevel: string
  fabricTech: string
  fabricDesc: string
  compression: string
  price: number
  priceFormatted: string
  rating: number
  reviewsCount: number
  badge?: string
  colors: { name: string; hex: string }[]
  sizes: string[]
  imgMain: string
  images: string[]
  desc: string
  details: string[]
  fitInfo: string
}

export interface CartItem {
  product: Product
  selectedColor: { name: string; hex: string }
  selectedSize: string
  selectedLining: string
  selectedZip: string
  selectedLength: string
  quantity: number
}

export interface Review {
  id: number
  productId: number
  author: string
  rating: number
  date: string
  title: string
  comment: string
  verified: boolean
}

export interface UserAccount {
  name: string
  email: string
  phone: string
  verified: boolean
}

export interface OrderItem {
  name: string
  price: number
  quantity: number
  size: string
  lining?: string
  zip?: string
  length?: string
  image: string
}

export interface TrackedOrder {
  id: string
  date: string
  status: 'Processing' | 'In Transit' | 'Out for Delivery' | 'Delivered'
  courier: string
  awb: string
  estimatedDelivery: string
  items: OrderItem[]
  subtotal: number
  shipping: number
  total: number
  paymentMethod: string
  customerEmail?: string
  shippingAddress: {
    name: string
    phone: string
    address: string
    city: string
    state: string
    pincode: string
  }
  timeline: {
    title: string
    time: string
    desc: string
    completed: boolean
    current?: boolean
  }[]
}

const INITIAL_ORDERS: TrackedOrder[] = [
  {
    id: 'LUNAR-892410',
    date: '09 Sep 2026',
    status: 'In Transit',
    courier: 'Blue Dart Express',
    awb: 'BD8912401IN',
    estimatedDelivery: 'Tomorrow, by 7:00 PM',
    subtotal: 2198,
    shipping: 0,
    total: 2198,
    paymentMethod: 'Instant UPI (GPay)',
    shippingAddress: {
      name: 'Priya Sharma',
      phone: '+91 98765 43210',
      address: 'Flat 402, Sunshine Heights, Jubilee Hills',
      city: 'Hyderabad',
      state: 'Telangana',
      pincode: '500033',
    },
    items: [
      {
        name: 'Yellow Petal Cotton Maxi',
        price: 1099,
        quantity: 1,
        size: 'M',
        lining: 'No Lining',
        zip: 'Both Sides Vertical Feeding Zip (+₹100)',
        length: '44 inch',
        image: 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5227_1.jpg?v=1778607243',
      },
      {
        name: 'Teal Floral Cotton Maxi',
        price: 1099,
        quantity: 1,
        size: 'M',
        lining: 'Cotton Lining (+₹150)',
        zip: 'None',
        length: '44 inch',
        image: 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_2171_1.jpg?v=1766941862',
      },
    ],
    timeline: [
      {
        title: 'Order Confirmed & Payment Verified',
        time: '09 Sep 2026, 11:30 AM',
        desc: 'Payment received via UPI. Order registered with The Lunar Clothing online studio.',
        completed: true,
      },
      {
        title: 'Artisan Tailoring & Quality Inspection',
        time: '10 Sep 2026, 03:15 PM',
        desc: 'Handcrafted garments passed QC inspection and wrapped in Lunar eco-packaging.',
        completed: true,
      },
      {
        title: 'Dispatched with Blue Dart Express',
        time: '10 Sep 2026, 07:45 PM',
        desc: 'Handed over to Blue Dart Express (Hyderabad Hub). Tracking AWB: BD8912401IN.',
        completed: true,
      },
      {
        title: 'In Transit to Destination Delivery Hub',
        time: '11 Sep 2026, 08:30 AM',
        desc: 'Shipment arrived at destination city hub and is out for route sorting.',
        completed: true,
        current: true,
      },
      {
        title: 'Out for Doorstep Delivery',
        time: 'Expected Tomorrow, 10:00 AM',
        desc: 'Delivery agent will attempt delivery to your address.',
        completed: false,
      },
      {
        title: 'Delivered',
        time: 'Expected Tomorrow, by 7:00 PM',
        desc: 'Package delivered to recipient.',
        completed: false,
      },
    ],
  },
  {
    id: 'LUNAR-719324',
    date: '22 Aug 2026',
    status: 'Delivered',
    courier: 'Delhivery',
    awb: 'DL839210492',
    estimatedDelivery: 'Delivered on 25 Aug 2026',
    subtotal: 1299,
    shipping: 0,
    total: 1299,
    paymentMethod: 'Cash on Delivery (COD)',
    shippingAddress: {
      name: 'Priya Sharma',
      phone: '+91 98765 43210',
      address: 'Flat 402, Sunshine Heights, Jubilee Hills',
      city: 'Hyderabad',
      state: 'Telangana',
      pincode: '500033',
    },
    items: [
      {
        name: 'Red Checked Soft Mul Chanderi Dress',
        price: 1299,
        quantity: 1,
        size: 'M',
        lining: 'Included Breathable Cotton Lining',
        zip: 'None',
        length: 'Standard 44 inch',
        image: 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5234.jpg?v=1778607246',
      },
    ],
    timeline: [
      {
        title: 'Order Confirmed',
        time: '22 Aug 2026, 04:10 PM',
        desc: 'COD order confirmed via SMS.',
        completed: true,
      },
      {
        title: 'Dispatched via Delhivery',
        time: '23 Aug 2026, 01:20 PM',
        desc: 'Courier AWB: DL839210492.',
        completed: true,
      },
      {
        title: 'Delivered to Doorstep',
        time: '25 Aug 2026, 02:40 PM',
        desc: 'Package safely handed over and COD payment received.',
        completed: true,
      },
    ],
  },
]

const PRODUCTS: Product[] = [
  {
    id: 1,
    name: 'Yellow Petal Cotton Maxi',
    category: 'maxis',
    sculptLevel: '100% SOFT COTTON',
    fabricTech: 'Handcrafted Soft Cotton',
    fabricDesc: 'Pure breathable cotton woven for airy comfort with attached side ropes and functional deep pockets.',
    compression: 'Relaxed Fit',
    price: 1099,
    priceFormatted: '₹1,099',
    rating: 4.9,
    reviewsCount: 142,
    badge: 'Bestseller',
    colors: [
      { name: 'Sunflower Yellow', hex: '#F4C430' },
      { name: 'Pastel Cream', hex: '#FFF8DC' },
    ],
    sizes: ['S', 'M', 'L', 'XL', 'XXL', '3XL'],
    imgMain: 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5227_1.jpg?v=1778607243',
    images: [
      'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5227_1.jpg?v=1778607243',
      'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5205.jpg?v=1778607246',
      'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5223_1.jpg?v=1778607242',
    ],
    desc: 'The Yellow Petal Cotton Maxi by The Lunar Clothing offers effortless summer elegance with 44-inch flowing length, side tie-up ropes, and deep utility pockets.',
    details: [
      'Length: 44 Inches (Extra charges for lining)',
      'Side waist tie-up ropes & deep functional pocket attached',
      'Material: 100% Premium Soft Breathable Cotton',
      'Model Wearing: Size S / Pre-shrunk fabric',
    ],
    fitInfo: 'True to size. Flowing flared maxi silhouette.',
  },
  {
    id: 2,
    name: 'Teal Floral Cotton Maxi',
    category: 'maxis',
    sculptLevel: '100% SOFT COTTON',
    fabricTech: 'Teal Floral Print Cotton',
    fabricDesc: 'Lightweight premium cotton with hand-printed floral motifs and adjustable waist ropes.',
    compression: 'Relaxed Fit',
    price: 1099,
    priceFormatted: '₹1,099',
    rating: 4.9,
    reviewsCount: 98,
    badge: 'Trending',
    colors: [
      { name: 'Teal Blue', hex: '#008080' },
      { name: 'Ocean Green', hex: '#2E8B57' },
    ],
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    imgMain: 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_2171_1.jpg?v=1766941862',
    images: [
      'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_2171_1.jpg?v=1766941862',
      'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_2175.jpg?v=1766941862',
      'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_2197.jpg?v=1766941862',
    ],
    desc: 'Deep teal floral prints combined with featherlight soft cotton for everyday lounge and outing perfection.',
    details: [
      'Length: 44 Inches',
      'Convenient side pocket & tie ropes attached',
      'Material: 100% Soft Cotton',
      'Color fastness guaranteed with gentle hand wash',
    ],
    fitInfo: 'Comfortable relaxed fit.',
  },
  {
    id: 3,
    name: 'Grey Kalamkari Cotton Maxi',
    category: 'kalamkari',
    sculptLevel: 'ARTISANAL KALAMKARI',
    fabricTech: 'Handblock Kalamkari Print',
    fabricDesc: 'Artisanal Kalamkari block print on natural grey cotton yarn.',
    compression: 'Regular Fit',
    price: 1099,
    priceFormatted: '₹1,099',
    rating: 5.0,
    reviewsCount: 124,
    badge: 'Artisan Pick',
    colors: [
      { name: 'Charcoal Grey', hex: '#36454F' },
      { name: 'Earth Brown', hex: '#5C4033' },
    ],
    sizes: ['S', 'M', 'L', 'XL', 'XXL', '3XL'],
    imgMain: 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5223_1.jpg?v=1778607242',
    images: [
      'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5223_1.jpg?v=1778607242',
      'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5232.jpg?v=1778607247',
    ],
    desc: 'Ethically crafted Kalamkari motif maxi dress featuring authentic Indian heritage craftsmanship and modern functional pockets.',
    details: [
      'Authentic Kalamkari Block Print',
      'Length: 44 Inches with side pocket',
      '100% Natural Cotton Yarn',
    ],
    fitInfo: 'Relaxed flared maxi fit.',
  },
  {
    id: 4,
    name: 'Dark Violet Floral Cotton Maxi',
    category: 'maxis',
    sculptLevel: 'PREMIUM COTTON',
    fabricTech: 'Soft Violet Cotton',
    fabricDesc: 'Rich dark violet shade accented with intricate floral motifs and adjustable waist ropes.',
    compression: 'Relaxed Fit',
    price: 1199,
    priceFormatted: '₹1,199',
    rating: 4.8,
    reviewsCount: 86,
    badge: 'New Season',
    colors: [
      { name: 'Dark Violet', hex: '#4B0082' },
      { name: 'Deep Plum', hex: '#673147' },
    ],
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    imgMain: 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5205.jpg?v=1778607246',
    images: [
      'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5205.jpg?v=1778607246',
      'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5234.jpg?v=1778607246',
    ],
    desc: 'Regal dark violet maxi dress designed for festive gatherings and casual day wear.',
    details: [
      'Length: 44 Inches with attached side pocket',
      '100% Premium Soft Cotton',
      'Adjustable side cinch ropes',
    ],
    fitInfo: 'True to size with flared waist.',
  },
  {
    id: 5,
    name: 'Red Checked Soft Mul Chanderi Dress',
    category: 'dresses',
    sculptLevel: 'MUL CHANDERI SILK',
    fabricTech: 'Soft Mul Chanderi Silk',
    fabricDesc: 'Luxurious Mul Chanderi fabric lined with soft cotton for a weightless festive silhouette.',
    compression: 'Festive Flare',
    price: 1299,
    priceFormatted: '₹1,299',
    rating: 5.0,
    reviewsCount: 64,
    badge: 'Exclusive',
    colors: [
      { name: 'Crimson Red', hex: '#990000' },
      { name: 'Gold Accent', hex: '#D4AF37' },
    ],
    sizes: ['S', 'M', 'L', 'XL'],
    imgMain: 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5234.jpg?v=1778607246',
    images: [
      'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5234.jpg?v=1778607246',
      'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_2175.jpg?v=1766941862',
    ],
    desc: 'Soft Mul Chanderi dress featuring classic red checks, handcrafted neck piping, and soft cotton lining.',
    details: [
      'Premium Soft Mul Chanderi Silk Blend',
      'Includes breathable inner cotton lining',
      'Side pocket and festive tiered hem',
    ],
    fitInfo: 'Flowing A-line dress silhouette.',
  },
  {
    id: 6,
    name: 'Purple Heart Handloom Cotton Maxi',
    category: 'handloom',
    sculptLevel: 'HANDLOOM WEAVE',
    fabricTech: 'Handloom Soft Cotton',
    fabricDesc: 'Woven on traditional Indian handlooms with delicate purple heart motifs.',
    compression: 'Artisanal Weave',
    price: 1299,
    priceFormatted: '₹1,299',
    rating: 4.9,
    reviewsCount: 78,
    badge: 'Limited Edition',
    colors: [
      { name: 'Dusty Purple', hex: '#7D526E' },
      { name: 'Natural Cotton', hex: '#FDFBF7' },
    ],
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    imgMain: 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_2175.jpg?v=1766941862',
    images: [
      'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_2175.jpg?v=1766941862',
      'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_2197.jpg?v=1766941862',
    ],
    desc: 'Artisanal Handloom Cotton Maxi woven with love and designed for all-day breathability.',
    details: [
      'Length: 44 Inches',
      'Traditional Handloom Weave Texture',
      'Pockets and side tie ropes included',
    ],
    fitInfo: 'Relaxed ethnic maxi fit.',
  },
  {
    id: 7,
    name: 'Royal Blue Blossom Cotton Maxi',
    category: 'maxis',
    sculptLevel: '100% SOFT COTTON',
    fabricTech: 'Royal Blossom Print',
    fabricDesc: 'Vivid royal blue cotton backdrop with bright floral blossom handprints.',
    compression: 'Relaxed Fit',
    price: 1199,
    priceFormatted: '₹1,199',
    rating: 4.8,
    reviewsCount: 52,
    badge: 'Popular',
    colors: [
      { name: 'Royal Blue', hex: '#4169E1' },
      { name: 'Sky Blue', hex: '#87CEEB' },
    ],
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    imgMain: 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_2197.jpg?v=1766941862',
    images: [
      'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_2197.jpg?v=1766941862',
      'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_2199.jpg?v=1766941862',
    ],
    desc: 'Eye-catching Royal Blue Blossom Cotton Maxi featuring side pockets and adjustable waist ties.',
    details: [
      'Length: 44 Inches',
      'Material: 100% Soft Breathable Cotton',
      'Deep side pockets',
    ],
    fitInfo: 'True to size.',
  },
  {
    id: 8,
    name: 'Black Dandelions Cotton Maxi',
    category: 'maxis',
    sculptLevel: '100% SOFT COTTON',
    fabricTech: 'Dandelion Block Print',
    fabricDesc: 'Midnight black cotton fabric adorned with white dandelion seed prints.',
    compression: 'Relaxed Fit',
    price: 1199,
    priceFormatted: '₹1,199',
    rating: 4.9,
    reviewsCount: 110,
    badge: 'Must Have',
    colors: [
      { name: 'Jet Black', hex: '#111111' },
      { name: 'Chalk White', hex: '#FAFAFA' },
    ],
    sizes: ['S', 'M', 'L', 'XL', 'XXL', '3XL'],
    imgMain: 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5232.jpg?v=1778607247',
    images: [
      'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5232.jpg?v=1778607247',
      'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5227_1.jpg?v=1778607243',
    ],
    desc: 'Timeless black dandelion cotton maxi dress with attached side pockets and flattering flared hemline.',
    details: [
      'Length: 44 Inches',
      'Pocket & waist ropes attached',
      '100% Pure Soft Cotton',
    ],
    fitInfo: 'Flattering flared maxi fit.',
  },
]

const INITIAL_REVIEWS: Review[] = [
  {
    id: 1,
    productId: 1,
    author: 'Priya S.',
    rating: 5,
    date: '12 Aug 2026',
    title: 'Super soft & functional pockets!',
    comment: 'The cotton fabric is exceptionally soft and breathable. Pockets are deep enough to comfortably fit my phone. Loved the side ties!',
    verified: true,
  },
  {
    id: 2,
    productId: 1,
    author: 'Ananya R.',
    rating: 5,
    date: '04 Aug 2026',
    title: 'Perfect for Indian summer',
    comment: 'Lightweight and elegant. I ordered with the feeding zip add-on and it is stitched so neatly. 10/10 recommend!',
    verified: true,
  },
  {
    id: 3,
    productId: 2,
    author: 'Meera V.',
    rating: 5,
    date: '28 Jul 2026',
    title: 'Beautiful Teal Shade',
    comment: 'Color is vibrant and exact to picture. Fits true to size with flowing flare.',
    verified: true,
  },
]

// --- INTERACTIVE LUXURY AMBIENT BACKGROUND SYSTEM ---
function InteractiveBackground() {
  const switchLayer = useSwitchLayer()
  const spotlightRef = useRef<HTMLDivElement | null>(null)
  const mouseTargetRef = useRef<{ x: number; y: number }>({ x: -500, y: -500 })
  const mouseCurrentRef = useRef<{ x: number; y: number }>({ x: -500, y: -500 })

  // Track mouse coordinates for the ambient spotlight
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseTargetRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  // Smooth lerp for the ambient mouse glow directly on DOM node for 60fps performance
  useEffect(() => {
    let animId: number
    const updateGlow = () => {
      mouseCurrentRef.current.x += (mouseTargetRef.current.x - mouseCurrentRef.current.x) * 0.08
      mouseCurrentRef.current.y += (mouseTargetRef.current.y - mouseCurrentRef.current.y) * 0.08
      if (spotlightRef.current) {
        const x = Math.round(mouseCurrentRef.current.x)
        const y = Math.round(mouseCurrentRef.current.y)
        spotlightRef.current.style.background = `radial-gradient(650px circle at ${x}px ${y}px, rgba(244, 162, 175, 0.12), rgba(254, 215, 170, 0.06), transparent 70%)`
      }
      animId = requestAnimationFrame(updateGlow)
    }
    animId = requestAnimationFrame(updateGlow)
    return () => cancelAnimationFrame(animId)
  }, [])

  return (
    <>
      {/* 1. Interactive Cursor Light Spotlight (Smooth warm illumination) */}
      <div
        ref={spotlightRef}
        className="fixed inset-0 pointer-events-none z-30 transition-opacity duration-700 select-none"
      />

      {/* 2. Ambient Drifting Mesh Orbs (Ethereal luxury atmosphere) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none">
        {/* Soft Coral Rose Orb */}
        <div className="absolute -top-[12%] -left-[10%] w-[550px] h-[550px] rounded-full bg-gradient-to-br from-rose-300/18 via-pink-200/10 to-transparent blur-3xl animate-orb-1 transform-gpu" />

        {/* Warm Golden Honey Orb */}
        <div className="absolute top-[28%] -right-[12%] w-[620px] h-[620px] rounded-full bg-gradient-to-bl from-amber-200/15 via-orange-100/8 to-transparent blur-3xl animate-orb-2 transform-gpu" />

        {/* Delicate Lunar Lavender Orb */}
        <div className="absolute -bottom-[15%] left-[20%] w-[580px] h-[580px] rounded-full bg-gradient-to-tr from-purple-200/14 via-indigo-100/6 to-transparent blur-3xl animate-orb-3 transform-gpu" />

        {/* Mid-screen Breath Orb */}
        <div className="absolute top-[68%] -left-[10%] w-[480px] h-[480px] rounded-full bg-gradient-to-r from-emerald-100/10 via-rose-100/10 to-transparent blur-3xl animate-orb-2 transform-gpu" />
      </div>
    </>
  )
}

// --- DYNAMIC TENANT BRAND LOGO COMPONENT ---
function BrandLogo({
  tenant,
  className,
  isWhiteText,
}: {
  tenant?: TenantConfig | null
  className?: string
  isWhiteText?: boolean
}) {
  const [imgError, setImgError] = useState(false)
  const logoSrc = tenant?.logo || tenant?.theme?.logoUrl

  useEffect(() => {
    setImgError(false)
  }, [logoSrc])

  if (logoSrc && !imgError) {
    return (
      <img
        src={logoSrc}
        alt={tenant?.brandName || 'Brand Logo'}
        className={className || "h-10 md:h-11 w-auto object-contain rounded-sm shadow-xs"}
        onError={() => setImgError(true)}
      />
    )
  }

  const initial = (tenant?.brandName || 'Lunar').charAt(0).toUpperCase()
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-stone-800 to-black text-white flex items-center justify-center font-bold text-xs shadow-sm border border-white/20">
        {initial}
      </div>
      <span
        className={`font-serif text-lg md:text-xl font-bold uppercase tracking-wider ${
          isWhiteText ? 'text-white' : 'text-black'
        }`}
      >
        {tenant?.brandName || 'The Lunar Clothing'}
      </span>
    </div>
  )
}

// 1. Announcement Bar with Dynamic Moving Marquee Ticker
function AnnouncementBar({
  tenant,
  onDismiss,
}: {
  tenant?: TenantConfig | null
  onDismiss: () => void
}) {
  const switchLayer = useSwitchLayer()
  const brandName = tenant?.brandName || 'The Lunar Clothing'
  const customMessages = tenant?.theme?.announcementMessages

  const tickerItems = useMemo(() => {
    if (customMessages && customMessages.length > 0) {
      return [...customMessages, ...customMessages]
    }
    return [
      `${brandName.toUpperCase()} • EXCLUSIVE ARTISANAL ONLINE COLLECTION`,
      'FREE SHIPPING IN INDIA OVER ₹999',
      `USE CODE: ${(tenant?.slug || 'LUNAR').toUpperCase()}10 FOR 10% OFF`,
      '100% PURE BREATHABLE FABRICS • FUNCTIONAL UTILITY',
      `${brandName.toUpperCase()} • EXCLUSIVE ARTISANAL ONLINE COLLECTION`,
      'FREE SHIPPING IN INDIA OVER ₹999',
      `USE CODE: ${(tenant?.slug || 'LUNAR').toUpperCase()}10 FOR 10% OFF`,
      '100% PURE BREATHABLE FABRICS • FUNCTIONAL UTILITY',
    ]
  }, [tenant, customMessages, brandName])

  return (
    <div className="relative overflow-hidden flex items-center font-sans text-[11px] font-bold tracking-[0.2em] uppercase select-none z-50 shadow-lg" style={{ background: 'linear-gradient(90deg, #0a0a0a 0%, #1a0a2e 30%, #0a0a1a 60%, #1a0f00 90%, #0a0a0a 100%)', color: '#fff', paddingTop: '10px', paddingBottom: '10px' }}>
      {/* Subtle shimmer overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)' }} />
      
      <div className="animate-marquee flex items-center whitespace-nowrap gap-12">
        {tickerItems.map((item, idx) => (
          <div key={idx} className="flex items-center gap-12">
            <span className="text-white/90">{item}</span>
            <span className="text-amber-400/60 text-[9px]">✦</span>
          </div>
        ))}
      </div>

      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 z-20">
        <button
          onClick={onDismiss}
          className="pl-2 pr-1 text-white/60 hover:text-white text-sm font-light leading-none cursor-pointer transition-colors"
          aria-label="Dismiss announcement"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// 2. Navigation Header
function Navigation({
  tenant,
  products = PRODUCTS,
  cartCount,
  wishlistCount,
  user,
  onOpenCart,
  onOpenWishlist,
  onOpenSearch,
  onOpenMobileMenu,
  onOpenAuth,
  onOpenAccount,
  onOpenAbout,
  onOpenContact,
  onNavigate,
  currentCategory,
}: {
  tenant?: TenantConfig | null
  products?: Product[]
  cartCount: number
  wishlistCount: number
  user: UserAccount | null
  onOpenCart: () => void
  onOpenWishlist: () => void
  onOpenSearch: () => void
  onOpenMobileMenu: () => void
  onOpenAuth: () => void
  onOpenAccount: () => void
  onOpenAbout: () => void
  onOpenContact: () => void
  onNavigate: (view: 'home' | 'catalog', category?: string) => void
  currentCategory: string
}) {
  const switchLayer = useSwitchLayer()
  const [megaOpen, setMegaOpen] = useState(false)

  const categoryList = useMemo(() => getStoreCategories(tenant, products), [tenant, products])
  const copy = getStorefrontCopy(tenant)

  const featuredProduct = products[0] || null

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-black/8 transition-all">
      <div className="max-w-screen-2xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Left: Mobile hamburger */}
        <button
          className="md:hidden p-2 text-black cursor-pointer"
          onClick={onOpenMobileMenu}
          aria-label="Toggle Navigation Menu"
        >
          <div className="w-5 h-0.5 bg-black mb-1" />
          <div className="w-5 h-0.5 bg-black mb-1" />
          <div className="w-5 h-0.5 bg-black" />
        </button>

        {/* Brand Official Logo */}
        <div className="flex items-center gap-8">
          <button
            onClick={() => onNavigate('home')}
            className="flex items-center hover:opacity-85 transition-opacity cursor-pointer text-left py-0.5"
            aria-label={`${tenant?.brandName || 'Brand'} Home`}
          >
            <BrandLogo tenant={tenant} />
          </button>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-semibold tracking-[0.18em] uppercase">
            <div
              className="relative py-5 cursor-pointer group"
              onMouseEnter={() => setMegaOpen(true)}
              onMouseLeave={() => setMegaOpen(false)}
            >
              <button
                onClick={() => onNavigate('catalog', 'all')}
                className={`flex items-center gap-1 hover:text-black/60 transition-colors cursor-pointer ${
                  currentCategory ? 'text-black' : 'text-black/80'
                }`}
              >
                SHOP COLLECTIONS
                <span className="text-[9px]">▼</span>
              </button>

              {/* SHOP MEGA MENU */}
              {megaOpen && (
                <div className="absolute top-full left-0 w-[840px] bg-white border border-black/10 shadow-2xl p-8 grid grid-cols-4 gap-8 z-50 normal-case tracking-normal animate-slide-down">
                  {categoryList.slice(0, 3).map((cat) => {
                    const catProducts = products.filter((p) => p.category === cat.slug)
                    return (
                      <div key={cat.slug}>
                        <button
                          onClick={() => {
                            setMegaOpen(false)
                            onNavigate('catalog', cat.slug)
                          }}
                          className="text-xs font-bold tracking-widest uppercase text-black/40 hover:text-black mb-4 cursor-pointer text-left"
                        >
                          {cat.name}
                        </button>
                        <ul className="space-y-2.5 text-sm text-black/80 font-normal">
                          {catProducts.length === 0 && (
                            <li className="text-xs text-black/40 italic">Coming soon</li>
                          )}
                          {catProducts.slice(0, 3).map((p) => (
                            <li key={p.id}>
                              <button
                                onClick={() => {
                                  setMegaOpen(false)
                                  onNavigate('catalog', cat.slug)
                                }}
                                className="hover:font-semibold flex items-center justify-between w-full cursor-pointer text-left"
                              >
                                <span className="truncate pr-2">{p.name}</span>
                                {p.badge && (
                                  <span className="text-[9px] bg-black text-white px-1.5 py-0.5 font-mono flex-shrink-0">
                                    {p.badge.toUpperCase()}
                                  </span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })}

                  <div
                    className="bg-stone-100 p-4 relative group/card overflow-hidden"
                    style={featuredProduct ? undefined : { background: `linear-gradient(135deg, ${tenant?.theme?.primaryColor || '#1f2937'}, ${tenant?.theme?.accentColor || '#6b7280'})` }}
                  >
                    {!featuredProduct && (
                      <div className="relative h-full flex flex-col justify-end text-white">
                        <p className="text-[10px] tracking-widest uppercase font-bold text-white/70">{copy.collectionEyebrow}</p>
                        <p className="text-base font-serif leading-tight mb-2">{copy.comingSoonTitle}</p>
                      </div>
                    )}
                    {featuredProduct && (
                      <>
                        <img
                          src={featuredProduct.imgMain}
                          alt={featuredProduct.name}
                          className="absolute inset-0 w-full h-full object-cover opacity-85 group-hover/card:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                        <div className="relative h-full flex flex-col justify-end text-white">
                          <p className="text-[10px] tracking-widest uppercase font-bold text-white/70">SIGNATURE PIECE</p>
                          <p className="text-base font-serif leading-tight mb-2 truncate">{featuredProduct.name}</p>
                          <button
                            onClick={() => {
                              setMegaOpen(false)
                              onNavigate('catalog', 'all')
                            }}
                            className="text-xs font-semibold uppercase tracking-widest underline underline-offset-4 cursor-pointer"
                          >
                            Explore All →
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={onOpenAbout}
              className="text-black/80 hover:text-black transition-colors cursor-pointer"
            >
              ABOUT
            </button>
            <button
              onClick={onOpenContact}
              className="text-black/80 hover:text-black transition-colors cursor-pointer"
            >
              CONTACT
            </button>
          </nav>
        </div>

        {/* Right Nav Icons */}
        <div className="flex items-center gap-4 md:gap-5">
          {/* User Account / Login & Orders trigger */}
          {user ? (
            <button
              onClick={onOpenAccount}
              className="flex items-center gap-2 text-xs font-bold tracking-wider text-black hover:bg-stone-100 px-2.5 py-1.5 border border-black/20 hover:border-black transition-all cursor-pointer rounded-xs"
              title="My Account & Track Orders"
            >
              <div className="w-5 h-5 rounded-full bg-black text-white text-[10px] flex items-center justify-center font-bold">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <span className="hidden sm:inline uppercase">{user.name.split(' ')[0]}</span>
              <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-xs flex items-center gap-1">
                <span>ORDERS</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
              </span>
            </button>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-black hover:text-black/70 px-2.5 py-1.5 border border-black/25 hover:border-black transition-all cursor-pointer rounded-xs bg-stone-50"
              title="Log in to track orders"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>LOG IN</span>
            </button>
          )}

          {/* Search trigger */}
          <button
            onClick={onOpenSearch}
            className="text-black/80 hover:text-black transition-colors p-1.5 flex items-center gap-1 text-xs font-medium uppercase tracking-wider cursor-pointer"
            aria-label="Search Catalog"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span className="hidden lg:inline">Search</span>
          </button>

          {/* Wishlist count trigger */}
          <button
            onClick={onOpenWishlist}
            className="relative p-1 text-black/80 hover:text-black transition-colors cursor-pointer"
            title="View Wishlist"
            aria-label="View Wishlist"
          >
            <span className="text-sm">♥</span>
            {wishlistCount > 0 && (
              <span className="absolute -top-1 -right-1.5 w-4 h-4 bg-amber-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {wishlistCount}
              </span>
            )}
          </button>

          {/* Cart Bag Icon */}
          <button
            onClick={onOpenCart}
            className="flex items-center gap-2 text-black hover:opacity-75 transition-opacity relative p-1 active:scale-95 duration-150 cursor-pointer"
            aria-label="Open Shopping Bag"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            <span className="bg-black text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center -ml-1 shadow-md">
              {cartCount}
            </span>
          </button>
        </div>
      </div>
    </header>
  )
}

// 2b. Mobile Navigation Side Drawer
function MobileMenuDrawer({
  tenant,
  products = PRODUCTS,
  isOpen,
  onClose,
  onNavigate,
  onOpenWishlist,
  onOpenSearch,
  onOpenAuth,
  onOpenAccount,
  onOpenAbout,
  onOpenContact,
  user,
  wishlistCount,
}: {
  tenant?: TenantConfig | null
  products?: Product[]
  isOpen: boolean
  onClose: () => void
  onNavigate: (view: 'home' | 'catalog', category?: string) => void
  onOpenWishlist: () => void
  onOpenSearch: () => void
  onOpenAuth: () => void
  onOpenAccount: () => void
  onOpenAbout: () => void
  onOpenContact: () => void
  user: UserAccount | null
  wishlistCount: number
}) {
  if (!isOpen) return null

  const switchLayer = useSwitchLayer()
  const categories = getStoreCategories(tenant, products || [])
  const copy = getStorefrontCopy(tenant)

  return (
    <div className="fixed inset-0 z-50 overflow-hidden md:hidden">
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-xs animate-fade-in" />
      <div className="absolute inset-y-0 left-0 max-w-full flex pr-10">
        <div className="w-screen max-w-xs bg-white shadow-2xl flex flex-col justify-between animate-slide-down p-6">
          <div>
            <div className="flex items-center justify-between border-b border-black/10 pb-4 mb-6">
              <BrandLogo tenant={tenant} />
              <button onClick={onClose} className="text-black/60 text-lg cursor-pointer">✕</button>
            </div>

            <nav className="flex flex-col space-y-4 text-xs font-bold tracking-[0.18em] uppercase">
              <button
                onClick={() => { onClose(); onNavigate('home') }}
                className="text-left py-2 hover:text-black/60 border-b border-black/5 cursor-pointer"
              >
                HOME
              </button>
              <button
                onClick={() => { onClose(); onNavigate('catalog', 'all') }}
                className="text-left py-2 hover:text-black/60 border-b border-black/5 flex items-center justify-between cursor-pointer"
              >
                <span>ALL COLLECTIONS</span>
                <span className="text-[10px] bg-black text-white px-2 py-0.5 font-mono">NEW</span>
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.slug}
                  onClick={() => { onClose(); onNavigate('catalog', cat.slug) }}
                  className="text-left py-2 hover:text-black/60 border-b border-black/5 cursor-pointer"
                >
                  {cat.name.toUpperCase()}
                </button>
              ))}
              <button
                onClick={() => { onClose(); onOpenAbout() }}
                className="text-left py-2 hover:text-black/60 border-b border-black/5 cursor-pointer text-amber-900"
              >
                {copy.mobileAboutLabel}
              </button>
              <button
                onClick={() => { onClose(); onOpenContact() }}
                className="text-left py-2 hover:text-black/60 border-b border-black/5 cursor-pointer text-amber-900"
              >
                CONTACT & CARE
              </button>
            </nav>
          </div>

          <div className="border-t border-black/10 pt-6 space-y-3">
            {user ? (
              <button
                onClick={() => { onClose(); onOpenAccount() }}
                className="w-full flex items-center justify-center gap-2 bg-stone-900 text-white py-2.5 text-xs font-bold tracking-widest uppercase hover:bg-black cursor-pointer"
              >
                📦 MY ORDERS & TRACKING ({user.name.split(' ')[0]})
              </button>
            ) : (
              <button
                onClick={() => { onClose(); onOpenAuth() }}
                className="w-full flex items-center justify-center gap-2 bg-black text-white py-2.5 text-xs font-bold tracking-widest uppercase hover:bg-stone-800 cursor-pointer"
              >
                🔐 LOG IN & TRACK ORDERS
              </button>
            )}

            <button
              onClick={() => { onClose(); onOpenSearch() }}
              className="w-full flex items-center justify-center gap-2 border border-black/20 py-2.5 text-xs font-bold tracking-widest uppercase hover:bg-stone-50 cursor-pointer"
            >
              🔍 SEARCH STORE
            </button>
            <button
              onClick={() => { onClose(); onOpenWishlist() }}
              className="w-full flex items-center justify-center gap-2 bg-black text-white py-2.5 text-xs font-bold tracking-widest uppercase hover:bg-stone-800 cursor-pointer"
            >
              ♥ MY WISHLIST ({wishlistCount})
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// 2c. Wishlist Drawer Component
function WishlistDrawer({
  isOpen,
  onClose,
  products,
  wishlistIds,
  onRemoveWishlist,
  onSelectProduct,
}: {
  tenant?: TenantConfig
  isOpen: boolean
  onClose: () => void
  products: Product[]
  wishlistIds: number[]
  onRemoveWishlist: (id: number) => void
  onSelectProduct: (id: number) => void
}) {
  if (!isOpen) return null

  const wishlistedProducts = products.filter((p) => wishlistIds.includes(p.id))

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-xs animate-fade-in" />
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col justify-between animate-slide-in-right">
          <div className="p-6 border-b border-black/10 flex items-center justify-between bg-stone-50">
            <h2 className="text-xl font-serif text-black uppercase tracking-wider">
              MY WISHLIST ({wishlistedProducts.length})
            </h2>
            <button onClick={onClose} className="text-black/60 hover:text-black p-1 text-xl font-light cursor-pointer">
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {wishlistedProducts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-black/50 py-16">
                <span className="text-4xl mb-3">♡</span>
                <p className="text-lg font-serif text-black mb-1">Your wishlist is empty</p>
                <p className="text-xs mb-6 max-w-xs">Save your favorite pieces and custom items here.</p>
                <button
                  onClick={onClose}
                  className="bg-black text-white font-bold text-xs tracking-widest uppercase px-6 py-3 cursor-pointer"
                >
                  DISCOVER PRODUCTS
                </button>
              </div>
            ) : (
              wishlistedProducts.map((product) => (
                <div key={product.id} className="flex gap-4 border-b border-black/10 pb-6">
                  <img
                    src={product.imgMain}
                    alt={product.name}
                    className="w-20 h-26 object-cover bg-stone-100 border border-black/10 cursor-pointer"
                    onClick={() => { onSelectProduct(product.id); onClose() }}
                  />
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <h4
                        onClick={() => { onSelectProduct(product.id); onClose() }}
                        className="font-bold text-sm text-black hover:underline cursor-pointer"
                      >
                        {product.name}
                      </h4>
                      <p className="text-xs font-mono font-bold text-amber-700 mt-1">{product.sculptLevel}</p>
                      <p className="text-sm font-bold text-black mt-1">{product.priceFormatted}</p>
                    </div>

                    <div className="flex items-center justify-between mt-3">
                      <button
                        onClick={() => { onSelectProduct(product.id); onClose() }}
                        className="bg-black text-white px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase hover:bg-stone-800 cursor-pointer"
                      >
                        SELECT OPTIONS & ADD
                      </button>

                      <button
                        onClick={() => onRemoveWishlist(product.id)}
                        className="text-xs text-black/40 hover:text-red-600 underline cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// 3. Hero Section
function HeroSection({
  tenant,
  onShopClick,
}: {
  tenant?: TenantConfig | null
  onShopClick: () => void
}) {
  const copy = getStorefrontCopy(tenant)
  const heroImage =
    tenant?.theme?.heroImage ||
    (isTemplateStore(tenant) ? '' : 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_5227_1.jpg?v=1778607243')
  const brandTitle = tenant?.brandName || 'THE LUNAR CLOTHING'
  const headline = tenant?.theme?.heroHeadline || tenant?.tagline || brandTitle
  const subhead = tenant?.theme?.heroSubhead || copy.heroSubhead
  const ctaText = tenant?.theme?.heroCtaText || 'EXPLORE COLLECTIONS →'
  const announcementSub = tenant?.theme?.copy?.heroBadge?.trim() || tenant?.theme?.announcementMessages?.[0] || copy.heroBadge

  const handleExploreClick = (e: React.MouseEvent<HTMLButtonElement | HTMLDivElement>) => {
    // Dynamic luxury click ripple effect
    const btn = e.currentTarget
    const rect = btn.getBoundingClientRect()
    const ripple = document.createElement('span')
    const size = Math.max(rect.width, rect.height) * 2.2
    ripple.style.width = ripple.style.height = `${size}px`
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`
    ripple.className = 'explore-ripple-effect'
    btn.appendChild(ripple)
    setTimeout(() => {
      ripple.remove()
    }, 850)

    // Smooth cinematic glide to the collections section
    const target = document.getElementById('collections-section')
    if (target) {
      const topOffset = target.getBoundingClientRect().top + window.scrollY - 70
      window.scrollTo({
        top: topOffset,
        behavior: 'smooth',
      })
      target.classList.add('animate-section-highlight')
      setTimeout(() => target.classList.remove('animate-section-highlight'), 1800)
    } else {
      onShopClick()
    }
  }

  return (
    <section className="relative h-[92vh] min-h-[640px] bg-stone-950 flex items-center justify-center overflow-hidden">
      {heroImage ? (
        <img
          src={heroImage}
          alt={brandTitle}
          className="absolute inset-0 w-full h-full object-cover object-center opacity-65 scale-[1.04] transition-all duration-1000"
        />
      ) : (
        <div
          className="absolute inset-0 opacity-80"
          style={{ background: `radial-gradient(circle at 25% 20%, ${tenant?.theme?.accentColor || '#6b7280'} 0%, transparent 55%), linear-gradient(135deg, ${tenant?.theme?.primaryColor || '#1f2937'} 0%, #0a0a0a 100%)` }}
        />
      )}
      {/* Multi-layer gradient for depth */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.15) 70%, rgba(0,0,0,0.3) 100%)' }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.3) 0%, transparent 40%, transparent 60%, rgba(0,0,0,0.2) 100%)' }} />

      <div className="relative z-10 text-center text-white px-6 max-w-5xl mx-auto">
        <div className="animate-hero-reveal">
          <span className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.3em] uppercase px-5 py-2 mb-8" style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '2px' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            {announcementSub}
          </span>
        </div>
        <h1
          className="animate-hero-reveal-delay-1 text-5xl md:text-7xl lg:text-8xl font-normal tracking-tight uppercase leading-[0.9] mb-6 text-white"
          style={{ fontFamily: 'var(--font-display)', textShadow: '0 4px 40px rgba(0,0,0,0.6)' }}
        >
          {headline}
        </h1>
        <p className="animate-hero-reveal-delay-2 text-sm md:text-base tracking-[0.12em] text-white/75 font-light max-w-2xl mx-auto mb-12 leading-relaxed">
          {subhead}
        </p>
        <div className="animate-hero-reveal-delay-3 flex items-center justify-center gap-5 flex-wrap">
          <button
            onClick={handleExploreClick}
            className="group relative overflow-hidden bg-white text-black font-bold text-[11px] tracking-[0.25em] uppercase px-10 py-4 border border-white transition-all duration-300 shadow-2xl active:scale-95 cursor-pointer transform-gpu hover:shadow-[0_0_35px_rgba(255,255,255,0.4)]"
          >
            <span className="relative z-10 group-hover:text-white transition-colors duration-300 flex items-center justify-center gap-2">
              <span>{ctaText.replace(' →', '').replace('->', '')}</span>
              <span className="animate-arrow-glide text-sm">→</span>
            </span>
            <div className="absolute inset-0 bg-black translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
          </button>
          {tenant?.theme?.secondaryCtaText && (
            <button
              onClick={onShopClick}
              className="text-white/90 hover:text-white font-bold text-[11px] tracking-[0.25em] uppercase px-6 py-4 border border-white/40 hover:border-white transition-all duration-300 active:scale-95 cursor-pointer" style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}
            >
              {tenant.theme.secondaryCtaText}
            </button>
          )}
        </div>

        {/* Scroll indicator */}
        <div
          onClick={handleExploreClick}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-hero-reveal-delay-3 cursor-pointer hover:opacity-100 opacity-60 transition-opacity"
        >
          <span className="text-white/70 text-[9px] font-bold tracking-[0.3em] uppercase">Scroll to Explore</span>
          <div className="w-0.5 h-8 bg-gradient-to-b from-white/70 to-transparent animate-bounce" />
        </div>
      </div>
    </section>
  )
}

// 4. Trust Banner - Moving Ticker
function TrustBar({ tenant }: { tenant?: TenantConfig | null }) {
  const trustItems = getStorefrontCopy(tenant).trustItems
  const items = [...trustItems, ...trustItems]

  return (
    <div className="border-y border-black/8 py-3 overflow-hidden relative select-none z-10" style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)' }}>
      <div className="animate-marquee flex items-center whitespace-nowrap gap-14 text-[10px] font-bold tracking-[0.2em] uppercase text-black">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-14">
            <div className="flex items-center gap-2">
              <span className="text-xs">{item.icon}</span>
              <span className={item.accent ? 'text-amber-700' : 'text-black/75'}>{item.text}</span>
            </div>
            <span className="text-black/15 text-[8px]">◆</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// 5. Product Card (a store can replace it from src/tenants/<slug>/components/)
function ProductCard(props: ComponentProps<typeof DefaultProductCard>) {
  const Custom = useStoreComponent('ProductCard')
  return Custom ? <Custom {...props} Default={DefaultProductCard} /> : <DefaultProductCard {...props} />
}

function DefaultProductCard({
  product,
  isWishlisted,
  onToggleWishlist,
  onSelectProduct,
}: {
  product: Product
  isWishlisted: boolean
  onToggleWishlist: (id: number) => void
  onSelectProduct: (id: number) => void
}) {
  const [hovered, setHovered] = useState(false)
  const secondaryImage = product.images[1] || product.imgMain

  return (
    <div
      className="group cursor-pointer flex-shrink-0 w-64 md:w-72 relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        onClick={() => onSelectProduct(product.id)}
        className="relative aspect-[4/5] bg-stone-100 overflow-hidden mb-3"
        style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
      >
        <img
          src={hovered ? secondaryImage : product.imgMain}
          alt={product.name}
          className="w-full h-full object-cover transition-all duration-700 group-hover:scale-[1.06]"
        />
        {/* Subtle gradient at bottom */}
        <div className="absolute inset-x-0 bottom-0 h-24 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.2), transparent)' }} />

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
          {product.badge && (
            <span className="text-[9px] font-bold tracking-widest uppercase px-2.5 py-1 shadow-sm text-white" style={{ background: '#000' }}>
              {product.badge}
            </span>
          )}
          {product.sculptLevel && (
          <span className="text-[9px] font-mono font-bold tracking-wider px-2 py-0.5 text-black" style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', border: '1px solid rgba(0,0,0,0.08)' }}>
            {product.sculptLevel}
          </span>
          )}
        </div>

        {/* Wishlist Heart Button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleWishlist(product.id)
          }}
          className="absolute top-3 right-3 z-20 w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all active:scale-75 cursor-pointer" style={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
          title="Add to Wishlist"
        >
          <span className={`transition-all ${isWishlisted ? 'text-rose-600 scale-110' : 'text-black/40 hover:text-black'}`}>
            {isWishlisted ? '♥' : '♡'}
          </span>
        </button>

        {/* Rating badge overlay */}
        {product.reviewsCount > 0 && (
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1 px-2 py-0.5" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', borderRadius: '2px' }}>
          <span className="text-amber-400 text-[10px]">★</span>
          <span className="text-white text-[10px] font-bold">{product.rating}</span>
          <span className="text-white/50 text-[9px]">({product.reviewsCount})</span>
        </div>
        )}

        {/* Hover Quick View overlay button */}
        <div className="absolute inset-x-3 bottom-3 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0 z-20">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onSelectProduct(product.id)
            }}
            className="w-full font-bold text-[10px] tracking-widest uppercase py-3 cursor-pointer transition-all" style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(4px)', color: '#000', border: '1px solid rgba(0,0,0,0.08)' }}
          >
            QUICK VIEW & CUSTOMIZE →
          </button>
        </div>
      </div>

      <div onClick={() => onSelectProduct(product.id)}>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <p className="text-[10px] font-bold tracking-wider uppercase text-black/45">{product.fabricTech}</p>
          <div className="flex items-center gap-0.5">
            {product.colors.slice(0, 3).map((c) => (
              <span
                key={c.name}
                className="w-3 h-3 rounded-full border border-black/15 shadow-sm"
                style={{ backgroundColor: c.hex }}
                title={c.name}
              />
            ))}
            {product.colors.length > 3 && <span className="text-[9px] text-black/40 font-bold ml-0.5">+{product.colors.length - 3}</span>}
          </div>
        </div>

        <h3 className="text-sm font-semibold tracking-wide text-black group-hover:text-black/70 transition-colors mb-1 truncate">
          {product.name}
        </h3>

        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-black">{product.priceFormatted}</p>
          {product.badge === 'Bestseller' || product.badge === 'Trending' ? (
            <span className="text-[9px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 border border-emerald-200">
              🔥 {product.badge}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// 6. Bestsellers Section
function BestsellersSection({
  tenant,
  products,
  wishlist,
  onToggleWishlist,
  onSelectProduct,
  onViewAll,
}: {
  tenant?: TenantConfig | null
  products: Product[]
  wishlist: number[]
  onToggleWishlist: (id: number) => void
  onSelectProduct: (id: number) => void
  onViewAll: () => void
}) {
  const copy = getStorefrontCopy(tenant)
  return (
    <section id="collections-section" className="py-20 bg-white/70 backdrop-blur-xs relative z-10 scroll-mt-14 transition-all duration-700">
      <div className="max-w-screen-2xl mx-auto px-6 mb-8 flex items-end justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.25em] uppercase text-black/40 mb-2">{copy.collectionEyebrow}</p>
          <h2 className="text-4xl md:text-5xl font-normal text-black" style={{ fontFamily: 'var(--font-display)' }}>
            {tenant?.brandName ? copy.bestsellersTitle : 'Signature Bestsellers'}
          </h2>
        </div>
        {products.length > 0 && (
          <button
            onClick={onViewAll}
            className="text-xs font-bold tracking-widest uppercase text-black hover:text-black/60 border-b border-black pb-0.5 cursor-pointer"
          >
            {copy.viewAllText}
          </button>
        )}
      </div>

      {products.length === 0 && (
        <div className="max-w-screen-2xl mx-auto px-6">
          <div className="border border-dashed border-black/15 bg-white/80 py-16 px-6 text-center">
            <p className="text-3xl mb-3">🛍️</p>
            <h3 className="text-2xl font-normal text-black mb-2" style={{ fontFamily: 'var(--font-display)' }}>
              {copy.comingSoonTitle}
            </h3>
            <p className="text-sm text-black/55 max-w-md mx-auto">{copy.comingSoonBody}</p>
          </div>
        </div>
      )}

      <div className="pl-6 md:pl-[max(24px,calc((100vw-1536px)/2+24px))] flex gap-6 overflow-x-auto scroll-hide pb-6">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            isWishlisted={wishlist.includes(product.id)}
            onToggleWishlist={onToggleWishlist}
            onSelectProduct={onSelectProduct}
          />
        ))}
      </div>
    </section>
  )
}

// 8. Shop By Category Dark Carousel Section
function ShopByCategorySection({
  tenant,
  products,
  onSelectCategory,
}: {
  tenant?: TenantConfig
  products: Product[]
  onSelectCategory: (cat: string) => void
}) {
  const scrollLeft = () => {
    const el = document.getElementById('category-scroll-container')
    if (el) el.scrollBy({ left: -520, behavior: 'smooth' })
  }

  const scrollRight = () => {
    const el = document.getElementById('category-scroll-container')
    if (el) el.scrollBy({ left: 520, behavior: 'smooth' })
  }

  const categories = useMemo(
    () =>
      getStoreCategories(tenant, products).map((c) => ({
        name: `${c.name.toUpperCase()} →`,
        category: c.slug,
        img: c.image,
      })),
    [tenant, products]
  )

  if (categories.length === 0) return null

  return (
    <section className="py-24 md:py-32 bg-[#141414] text-white border-t border-white/10 select-none">
      <div className="max-w-screen-2xl mx-auto px-6 mb-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm md:text-base font-bold tracking-[0.25em] uppercase text-white/90">
            {getStorefrontCopy(tenant).categoriesTitle}
          </h2>
          <span className="text-sm text-white/50">↘</span>
        </div>

        {/* Arrow Navigation Buttons */}
        <div className="flex items-center gap-4">
          <button
            onClick={scrollLeft}
            className="w-12 h-12 rounded-full bg-white/10 text-white hover:bg-white hover:text-black flex items-center justify-center text-lg font-bold transition-all active:scale-90 border border-white/10 shadow-lg cursor-pointer"
            aria-label="Scroll left"
          >
            ←
          </button>
          <button
            onClick={scrollRight}
            className="w-12 h-12 rounded-full bg-white/10 text-white hover:bg-white hover:text-black flex items-center justify-center text-lg font-bold transition-all active:scale-90 border border-white/10 shadow-lg cursor-pointer"
            aria-label="Scroll right"
          >
            →
          </button>
        </div>
      </div>

      <div
        id="category-scroll-container"
        className="pl-6 md:pl-[max(24px,calc((100vw-1536px)/2+24px))] flex gap-6 md:gap-8 overflow-x-auto scroll-hide pb-4"
      >
        {categories.map((cat, idx) => (
          <div
            key={idx}
            onClick={() => onSelectCategory(cat.category)}
            className="flex-shrink-0 w-[82vw] sm:w-[420px] md:w-[480px] lg:w-[540px] group cursor-pointer"
          >
            <div className="relative aspect-[3/4] md:h-[680px] lg:h-[740px] w-full overflow-hidden bg-stone-900 shadow-2xl border border-white/10 mb-4">
              {cat.img ? (
                <img
                  src={cat.img}
                  alt={cat.name}
                  className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-700"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center p-10 group-hover:scale-105 transition-transform duration-700"
                  style={{ background: `linear-gradient(160deg, ${tenant?.theme?.primaryColor || '#1f2937'} 0%, #0a0a0a 100%)` }}
                >
                  <span
                    className="text-4xl md:text-5xl text-white/90 uppercase text-center leading-tight"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {cat.name.replace(' →', '')}
                  </span>
                </div>
              )}
            </div>
            <p className="text-xs md:text-sm font-bold tracking-[0.2em] uppercase text-white group-hover:underline underline-offset-4 font-sans">
              {cat.name}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

// 9. Fabric Matrix
function LeggingsFabricMatrix({
  tenant,
  products,
  onSelectProduct,
}: {
  tenant?: TenantConfig
  products: Product[]
  onSelectProduct: (id: number) => void
}) {
  const copy = getStorefrontCopy(tenant)
  const isTemplate = isTemplateStore(tenant)
  const fabrics = useMemo(() => {
    return products.slice(0, 4).map((p, idx) => ({
      num: `0${idx + 1}`,
      title: isTemplate ? (p.fabricTech || p.name).toUpperCase() : `${p.fabricTech.toUpperCase()}©`,
      sculpt: p.sculptLevel,
      desc: isTemplate ? p.fabricDesc || p.desc : p.fabricDesc,
      img: p.imgMain,
      id: p.id,
    }))
  }, [products, isTemplate])

  if (fabrics.length === 0) return null

  return (
    <section className="py-20 bg-[#F5F4F1]/75 backdrop-blur-xs relative z-10">
      <div className="max-w-screen-2xl mx-auto px-6 mb-12">
        <p className="text-xs font-bold tracking-[0.25em] uppercase text-black/40 mb-2">{copy.featuredEyebrow}</p>
        <h2 className="text-4xl md:text-5xl font-normal text-black" style={{ fontFamily: 'var(--font-display)' }}>
          {copy.featuredTitle}
        </h2>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {fabrics.map((f) => (
          <div
            key={f.num}
            onClick={() => onSelectProduct(f.id)}
            className="group cursor-pointer relative bg-stone-900 overflow-hidden aspect-[3/4] shadow-lg"
          >
            <img
              src={f.img}
              alt={f.title}
              className="w-full h-full object-cover opacity-75 group-hover:scale-105 transition-transform duration-700"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
            <div className="absolute inset-0 p-6 flex flex-col justify-between text-white">
              <div className="flex items-center justify-between">
                <span className="text-3xl font-serif text-white/50">{f.num}</span>
                {f.sculpt && (
                  <span className="text-[9px] font-mono tracking-widest bg-white/20 backdrop-blur-md text-white px-2 py-0.5">
                    {f.sculpt}
                  </span>
                )}
              </div>
              <div>
                <h3 className="text-2xl font-serif leading-tight mb-1">{f.title}</h3>
                <p className="text-xs text-white/70 leading-relaxed mb-4">{f.desc}</p>
                <span className="text-xs font-bold tracking-widest uppercase underline underline-offset-4 group-hover:text-white">
                  {copy.featuredCta}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// 10. Triptych Category Banner
function ActivityTriptych({
  tenant,
  products,
  onSelectProduct,
}: {
  tenant?: TenantConfig
  products: Product[]
  onSelectProduct: (id: number) => void
}) {
  const copy = getStorefrontCopy(tenant)
  const activities = useMemo(() => {
    return products.slice(0, 3).map((p) => ({
      title: p.name.toUpperCase(),
      img: p.imgMain,
      id: p.id,
    }))
  }, [products])

  if (activities.length === 0) return null

  return (
    <section className="grid grid-cols-1 md:grid-cols-3 h-[65vh] min-h-[480px]">
      {activities.map((a) => (
        <div
          key={a.id}
          onClick={() => onSelectProduct(a.id)}
          className="relative overflow-hidden group cursor-pointer bg-stone-900"
        >
          <img
            src={a.img}
            alt={a.title}
            className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
          <div className="absolute bottom-8 left-8 text-white max-w-xs">
            <p className="text-xs tracking-[0.2em] font-semibold uppercase text-white/60 mb-2">{copy.triptychEyebrow}</p>
            <h3 className="text-3xl md:text-4xl font-serif uppercase tracking-tight line-clamp-2">{a.title}</h3>
          </div>
        </div>
      ))}
    </section>
  )
}

// 11. Mission Block
function MissionBlock({
  tenant,
  onShopClick,
}: {
  tenant?: TenantConfig | null
  onShopClick: () => void
}) {
  const brandName = tenant?.brandName || 'The Lunar Clothing'
  const copy = getStorefrontCopy(tenant)
  const bgImg =
    tenant?.theme?.heroImage ||
    (isTemplateStore(tenant) ? '' : 'https://cdn.shopify.com/s/files/1/0957/7549/0340/files/IMG_2171_1.jpg?v=1766941862')

  return (
    <section className="relative py-36 md:py-48 bg-stone-950 text-center text-white overflow-hidden select-none border-t border-white/10">
      {bgImg ? (
        <img
          src={bgImg}
          alt={`${brandName} Philosophy`}
          className="absolute inset-0 w-full h-full object-cover opacity-25 object-center"
        />
      ) : (
        <div
          className="absolute inset-0 opacity-40"
          style={{ background: `linear-gradient(180deg, ${tenant?.theme?.primaryColor || '#1f2937'} 0%, transparent 100%)` }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/30" />

      <div className="relative z-10 max-w-3xl mx-auto px-6">
        <p className="text-[11px] font-bold tracking-[0.3em] uppercase text-white/70 mb-4 font-mono">
          {copy.missionEyebrow}
        </p>

        <h2
          className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-normal leading-none uppercase mb-6 tracking-tight text-white"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {copy.missionHeadline}
        </h2>

        <p className="text-xs sm:text-sm md:text-base font-light text-white/80 max-w-xl mx-auto mb-10 leading-relaxed font-sans">
          {copy.missionBody}
        </p>

        <div className="flex items-center justify-center">
          <button
            onClick={onShopClick}
            className="bg-white text-black font-bold text-xs tracking-[0.2em] uppercase px-8 py-3.5 hover:bg-black hover:text-white border border-white transition-all shadow-2xl active:scale-95 cursor-pointer"
          >
            {copy.missionCta}
          </button>
        </div>
      </div>
    </section>
  )
}

// 12. Reviews Section & Modal Component
function CustomerReviewsSection({
  productId,
  reviews,
  isTemplate = false,
  onAddReviewClick,
}: {
  productId: number
  reviews: Review[]
  isTemplate?: boolean
  onAddReviewClick: () => void
}) {
  const productReviews = reviews.filter((r) => r.productId === productId || (!isTemplate && r.productId === 1))
  const avgRating = productReviews.length
    ? (productReviews.reduce((sum, r) => sum + r.rating, 0) / productReviews.length).toFixed(1)
    : isTemplate
    ? '–'
    : '4.9'

  return (
    <div className="border-t border-black/10 pt-16 mt-16">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-10">
        <div>
          <p className="text-xs font-bold tracking-[0.25em] uppercase text-black/40 mb-1">VERIFIED REVIEWS</p>
          <h2 className="text-3xl font-serif text-black">Customer Ratings & Reviews</h2>
        </div>

        <button
          onClick={onAddReviewClick}
          className="bg-black text-white font-bold text-xs tracking-widest uppercase px-6 py-3 hover:bg-stone-800 cursor-pointer"
        >
          WRITE A REVIEW +
        </button>
      </div>

      {/* Breakdown Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-12 bg-stone-50 border border-black/10 p-6 md:p-8">
        <div className="md:col-span-4 flex flex-col items-center justify-center text-center border-b md:border-b-0 md:border-r border-black/10 pr-0 md:pr-8 pb-6 md:pb-0">
          <span className="text-5xl font-bold font-serif text-black">{avgRating}</span>
          <div className={`text-lg my-1 ${isTemplate && productReviews.length === 0 ? 'text-stone-300' : 'text-amber-500'}`}>★★★★★</div>
          <p className="text-xs text-black/50 uppercase tracking-wider font-semibold">
            {isTemplate && productReviews.length === 0
              ? 'No reviews yet — be the first'
              : `Based on ${productReviews.length} Verified Buyer Reviews`}
          </p>
        </div>

        <div className="md:col-span-8 flex flex-col justify-center space-y-2 text-xs">
          {[5, 4, 3, 2, 1].map((stars) => {
            const count = productReviews.filter((r) => r.rating === stars).length
            const pct = productReviews.length
              ? Math.round((count / productReviews.length) * 100)
              : isTemplate
              ? 0
              : stars === 5
              ? 85
              : 15
            return (
              <div key={stars} className="flex items-center gap-3">
                <span className="w-10 font-bold text-black">{stars} Stars</span>
                <div className="flex-1 h-2 bg-stone-200 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-10 text-right text-black/50 font-mono">{pct}%</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Review List */}
      <div className="space-y-6">
        {productReviews.map((rev) => (
          <div key={rev.id} className="border-b border-black/10 pb-6 text-xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-amber-500 text-sm">{'★'.repeat(rev.rating)}</span>
                <h4 className="font-bold text-black text-sm">{rev.title}</h4>
              </div>
              <span className="text-black/40">{rev.date}</span>
            </div>

            <p className="text-black/70 leading-relaxed mb-2 font-normal">{rev.comment}</p>

            <div className="flex items-center gap-2 text-[10px] text-black/50 font-medium">
              <span className="font-bold text-black">{rev.author}</span>
              {rev.verified && (
                <span className="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-xs">
                  ✓ VERIFIED BUYER
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function WriteReviewModal({
  isOpen,
  onClose,
  onSaveReview,
  prompt,
}: {
  isOpen: boolean
  prompt: string
  onClose: () => void
  onSaveReview: (review: { author: string; rating: number; title: string; comment: string }) => void
}) {
  const [rating, setRating] = useState(5)
  const [author, setAuthor] = useState('')
  const [title, setTitle] = useState('')
  const [comment, setComment] = useState('')

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!author.trim() || !comment.trim()) return
    onSaveReview({ author, rating, title, comment })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white max-w-lg w-full p-8 border border-black/10 shadow-2xl relative animate-slide-down">
        <button onClick={onClose} className="absolute top-4 right-4 text-black/50 hover:text-black text-xl cursor-pointer">
          ✕
        </button>

        <h3 className="text-2xl font-serif text-black mb-2">Write a Product Review</h3>
        <p className="text-xs text-black/60 mb-6">{prompt}</p>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold uppercase tracking-wider text-black mb-1">Select Rating</label>
            <div className="flex gap-2 text-2xl cursor-pointer">
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  onClick={() => setRating(star)}
                  className={star <= rating ? 'text-amber-500' : 'text-stone-300'}
                >
                  ★
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-bold uppercase tracking-wider text-black mb-1">Your Name *</label>
            <input
              type="text"
              required
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g. Sneha P."
              className="w-full border border-black/20 p-2.5 outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="block font-bold uppercase tracking-wider text-black mb-1">Review Headline</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Exactly what I was looking for!"
              className="w-full border border-black/20 p-2.5 outline-none focus:border-black"
            />
          </div>

          <div>
            <label className="block font-bold uppercase tracking-wider text-black mb-1">Detailed Comment *</label>
            <textarea
              required
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What did you like? How was the quality?"
              className="w-full border border-black/20 p-2.5 outline-none focus:border-black"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-black text-white font-bold text-xs uppercase tracking-widest py-3.5 hover:bg-stone-800 cursor-pointer"
          >
            SUBMIT REVIEW
          </button>
        </form>
      </div>
    </div>
  )
}

// 13. PRODUCT DETAIL PAGE (PDP) WITH MAGNIFIER LENS & LUNAR ADD-ONS
function ProductDetailPage({
  product,
  wishlist,
  reviews,
  products = PRODUCTS,
  tenant,
  onToggleWishlist,
  onAddToCart,
  onBack,
  onSelectProduct,
  onSaveReview,
}: {
  product: Product
  wishlist: number[]
  reviews: Review[]
  products?: Product[]
  tenant?: TenantConfig
  onToggleWishlist: (id: number) => void
  onAddToCart: (
    product: Product,
    color: { name: string; hex: string },
    size: string,
    lining: string,
    zip: string,
    length: string,
    qty: number,
    totalUnitPrice: number
  ) => void
  onBack: () => void
  onSelectProduct: (id: number) => void
  onSaveReview: (review: { author: string; rating: number; title: string; comment: string }) => void
}) {
  const copy = getStorefrontCopy(tenant)
  const isTemplate = isTemplateStore(tenant)
  const showZoom = isPdpOptionEnabled(tenant, 'zoom')
  const showGuarantee = isPdpOptionEnabled(tenant, 'guarantee')
  const showDetails = isPdpOptionEnabled(tenant, 'details')
  const showShipping = isPdpOptionEnabled(tenant, 'shipping')
  const showRelated = isPdpOptionEnabled(tenant, 'related')
  const showReviews = tenant?.theme?.enableReviews ?? true
  const [selectedColor, setSelectedColor] = useState(product.colors[0] || { name: '', hex: '' })
  const availableSizes = isTemplate ? product.sizes || [] : ['XS', 'S', 'M', 'L', 'XL', 'XXL']
  const [selectedSize, setSelectedSize] = useState(isTemplate ? product.sizes?.[0] || '' : 'S')

  const [selectedLining, setSelectedLining] = useState<'No Lining' | 'Lining'>('No Lining')
  const [selectedZip, setSelectedZip] = useState<'None' | 'Double Zip' | 'Center Zip'>('None')
  const [selectedLength, setSelectedLength] = useState<'44 inch' | '46 inch' | '48 inch' | '50 inch'>('44 inch')

  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [openAccordion, setOpenAccordion] = useState<'fabric' | 'fit' | 'shipping' | null>(
    isPdpOptionEnabled(tenant, 'details') ? 'fabric' : 'shipping'
  )
  const [showSizeGuide, setShowSizeGuide] = useState(false)

  useEffect(() => {
    if (!showSizeGuide) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSizeGuide(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showSizeGuide])
  const [showWriteReview, setShowWriteReview] = useState(false)
  const [addedToast, setAddedToast] = useState(false)
  const [isZoomed, setIsZoomed] = useState(false)
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 })

  const liningPrice = !isTemplate && selectedLining === 'Lining' ? 100 : 0
  const zipPrice = isTemplate ? 0 : selectedZip === 'Double Zip' ? 120 : selectedZip === 'Center Zip' ? 100 : 0
  const lengthPrice = isTemplate ? 0 : selectedLength === '46 inch' ? 50 : selectedLength === '48 inch' ? 80 : selectedLength === '50 inch' ? 100 : 0

  const unitPrice = product.price + liningPrice + zipPrice + lengthPrice
  const totalPrice = unitPrice * quantity

  const activeImage = product.images[activeImageIndex] || product.imgMain
  const isWishlisted = wishlist.includes(product.id)
  const isSoldOut = !isTemplate && selectedSize === 'XS'

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setZoomPos({ x, y })
  }

  const handleAdd = () => {
    if (isSoldOut) return
    if (isTemplate) {
      onAddToCart(product, selectedColor, selectedSize, '', '', '', quantity, unitPrice)
    } else {
      onAddToCart(product, selectedColor, selectedSize, selectedLining, selectedZip, selectedLength, quantity, unitPrice)
    }
    setAddedToast(true)
    setTimeout(() => setAddedToast(false), 2500)
  }

  return (
    <div className="bg-white py-10 min-h-screen select-none">
      <div className="max-w-screen-2xl mx-auto px-6">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2 text-xs text-black/50 tracking-wider uppercase">
            <button onClick={onBack} className="hover:text-black transition-colors font-medium cursor-pointer">
              STORE
            </button>
            <span>/</span>
            <span className="capitalize">{getCategoryLabel(tenant, product.category)}</span>
            <span>/</span>
            <span className="text-black font-semibold">{product.name}</span>
          </div>

          <button
            onClick={() => onToggleWishlist(product.id)}
            className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-black/70 hover:text-black cursor-pointer"
          >
            <span className={isWishlisted ? 'text-red-600 text-sm' : ''}>{isWishlisted ? '♥ SAVED' : '♡ SAVE TO WISHLIST'}</span>
          </button>
        </div>

        {/* PDP Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-16">
          {/* Left Gallery */}
          <div className="lg:col-span-7 flex flex-col-reverse md:flex-row gap-4">
            <div className="flex md:flex-col gap-3 overflow-x-auto md:overflow-y-auto max-h-[600px] scroll-hide">
              {product.images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveImageIndex(idx)}
                  className={`relative flex-shrink-0 w-20 aspect-[4/5] bg-stone-100 border-2 transition-all cursor-pointer ${
                    activeImageIndex === idx ? 'border-black opacity-100' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={img} alt={`Angle ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>

            {/* Main Display Image */}
            <div
              className={`relative flex-1 aspect-[4/5] bg-stone-100 overflow-hidden shadow-sm ${showZoom ? 'cursor-zoom-in' : ''}`}
              onMouseEnter={() => showZoom && setIsZoomed(true)}
              onMouseLeave={() => setIsZoomed(false)}
              onMouseMove={handleMouseMove}
            >
              <img
                src={activeImage}
                alt={product.name}
                className={`w-full h-full object-cover transition-transform duration-200 ${
                  isZoomed ? 'scale-150 origin-center' : 'scale-100'
                }`}
                style={isZoomed ? { transformOrigin: `${zoomPos.x}% ${zoomPos.y}%` } : undefined}
              />
              {product.badge && (
                <span className="absolute top-4 left-4 bg-black text-white text-xs font-bold tracking-widest uppercase px-3 py-1.5 shadow-md">
                  {product.badge}
                </span>
              )}
              {isSoldOut && (
                <span className="absolute top-4 right-4 bg-red-600 text-white text-xs font-bold tracking-widest uppercase px-3 py-1.5 shadow-md">
                  SOLD OUT
                </span>
              )}
              {showZoom && (
                <span className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-md text-black text-[10px] font-bold tracking-widest uppercase px-2.5 py-1">
                  {copy.pdpMagnifyHint}
                </span>
              )}
            </div>
          </div>

          {/* Right Product Options & Customizations */}
          <div className="lg:col-span-5 flex flex-col justify-start">
            <div className="flex items-center gap-2 mb-2">
              {product.sculptLevel && (
                <span className="text-[10px] font-mono font-bold bg-black text-white px-2 py-0.5">
                  {product.sculptLevel}
                </span>
              )}
              <span className="text-xs font-bold tracking-[0.25em] uppercase text-black/40">
                {product.fabricTech}
              </span>
            </div>

            <h1 className="text-3xl md:text-4xl font-normal text-black mb-3" style={{ fontFamily: 'var(--font-display)' }}>
              {product.name}
            </h1>

            {/* Rating & Dynamic Price row */}
            <div className="flex items-center justify-between border-b border-black/10 pb-4 mb-6">
              <div className="flex items-center gap-2">
                {!showReviews ? null : product.reviewsCount > 0 ? (
                  <>
                    <div className="flex text-amber-500 text-sm">★★★★★</div>
                    <span className="text-xs font-semibold text-black">{product.rating}</span>
                    <span className="text-xs text-black/40">({product.reviewsCount} verified reviews)</span>
                  </>
                ) : (
                  <span className="text-xs text-black/40">No reviews yet</span>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-black/40 font-medium">Regular Price</p>
                <p className="text-2xl font-bold text-black">₹{unitPrice.toLocaleString()}</p>
              </div>
            </div>

            <p className="text-sm text-black/70 leading-relaxed mb-6">{product.desc}</p>

            {/* Size Selector */}
            {availableSizes.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2.5">
                <label className="block text-xs font-bold tracking-widest uppercase text-black">
                  {isTemplate ? 'Option' : 'Size'}: <span className="text-black/60 font-normal">{selectedSize}</span>
                </label>
                {!isTemplate && (
                  <button
                    onClick={() => setShowSizeGuide(true)}
                    className="text-xs font-medium text-black/60 hover:text-black underline underline-offset-2 cursor-pointer"
                  >
                    Size Guide & Measurements
                  </button>
                )}
              </div>

              <div className={isTemplate ? 'flex flex-wrap gap-2' : 'grid grid-cols-6 gap-2'}>
                {availableSizes.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSelectedSize(s)}
                    className={`py-2.5 ${isTemplate ? 'px-4' : ''} text-xs font-bold uppercase tracking-wider border transition-all cursor-pointer ${
                      selectedSize === s
                        ? 'border-black bg-black text-white'
                        : 'border-black/20 bg-white text-black hover:border-black'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {isSoldOut ? (
                <p className="text-xs font-bold text-red-600 mt-2 flex items-center gap-1">
                  <span>⛔ Size {selectedSize} is currently Sold Out</span>
                </p>
              ) : !isTemplate ? (
                <p className="text-[11px] text-amber-700 font-medium mt-2">
                  ⚡ Stock Alert: Only 3 items left in size {selectedSize}!
                </p>
              ) : null}
            </div>
            )}

            {/* --- ADD-ON CUSTOMIZATIONS (Lunar demo stores only) --- */}
            {!isTemplate && (<>
            <div className="mb-5 bg-stone-50 border border-black/10 p-3.5 rounded-sm">
              <label className="block text-xs font-bold tracking-widest uppercase text-black mb-2 flex items-center justify-between">
                <span>Lining (Add on)</span>
                {liningPrice > 0 && <span className="text-amber-700 font-semibold">+ ₹100.00</span>}
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedLining('No Lining')}
                  className={`py-2 px-3 border font-semibold tracking-wider text-center transition-all cursor-pointer ${
                    selectedLining === 'No Lining'
                      ? 'border-black bg-black text-white'
                      : 'border-black/20 bg-white text-black/80 hover:border-black'
                  }`}
                >
                  No Lining (+ ₹0)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedLining('Lining')}
                  className={`py-2 px-3 border font-semibold tracking-wider text-center transition-all cursor-pointer ${
                    selectedLining === 'Lining'
                      ? 'border-black bg-black text-white'
                      : 'border-black/20 bg-white text-black/80 hover:border-black'
                  }`}
                >
                  Lining (+ ₹100.00)
                </button>
              </div>
            </div>

            <div className="mb-5 bg-stone-50 border border-black/10 p-3.5 rounded-sm">
              <label className="block text-xs font-bold tracking-widest uppercase text-black mb-2 flex items-center justify-between">
                <span>Feeding Zip (Add on)</span>
                {zipPrice > 0 && <span className="text-amber-700 font-semibold">+ ₹{zipPrice}.00</span>}
              </label>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => setSelectedZip('None')}
                  className={`py-2 px-2 border font-semibold tracking-wider text-center transition-all cursor-pointer ${
                    selectedZip === 'None'
                      ? 'border-black bg-black text-white'
                      : 'border-black/20 bg-white text-black/80 hover:border-black'
                  }`}
                >
                  None (+ ₹0)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedZip('Double Zip')}
                  className={`py-2 px-2 border font-semibold tracking-wider text-center transition-all cursor-pointer ${
                    selectedZip === 'Double Zip'
                      ? 'border-black bg-black text-white'
                      : 'border-black/20 bg-white text-black/80 hover:border-black'
                  }`}
                >
                  Double Zip (+ ₹120.00)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedZip('Center Zip')}
                  className={`py-2 px-2 border font-semibold tracking-wider text-center transition-all cursor-pointer ${
                    selectedZip === 'Center Zip'
                      ? 'border-black bg-black text-white'
                      : 'border-black/20 bg-white text-black/80 hover:border-black'
                  }`}
                >
                  Center Zip (+ ₹100.00)
                </button>
              </div>
            </div>

            <div className="mb-6 bg-stone-50 border border-black/10 p-3.5 rounded-sm">
              <label className="block text-xs font-bold tracking-widest uppercase text-black mb-2 flex items-center justify-between">
                <span>Length (Add on)</span>
                {lengthPrice > 0 && <span className="text-amber-700 font-semibold">+ ₹{lengthPrice}.00</span>}
              </label>
              <div className="grid grid-cols-4 gap-2 text-[11px]">
                {(['44 inch', '46 inch', '48 inch', '50 inch'] as const).map((len) => {
                  const addCost = len === '46 inch' ? 50 : len === '48 inch' ? 80 : len === '50 inch' ? 100 : 0
                  return (
                    <button
                      key={len}
                      type="button"
                      onClick={() => setSelectedLength(len)}
                      className={`py-2 px-1 border font-semibold tracking-wider text-center transition-all cursor-pointer ${
                        selectedLength === len
                          ? 'border-black bg-black text-white'
                          : 'border-black/20 bg-white text-black/80 hover:border-black'
                      }`}
                    >
                      {len} {addCost > 0 ? `(+ ₹${addCost})` : '(Standard)'}
                    </button>
                  )
                })}
              </div>
            </div>
            </>)}

            {/* Quantity Stepper & Add to Bag CTA */}
            <div className="flex items-center gap-4 mb-6">
              <div className="flex items-center border border-black/20">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="px-3.5 py-3.5 text-black hover:bg-stone-100 font-bold active:scale-90 cursor-pointer"
                >
                  -
                </button>
                <span className="px-4 py-3.5 font-bold text-xs">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="px-3.5 py-3.5 text-black hover:bg-stone-100 font-bold active:scale-90 cursor-pointer"
                >
                  +
                </button>
              </div>

              <button
                onClick={handleAdd}
                disabled={isSoldOut}
                className={`flex-1 font-bold text-xs tracking-[0.2em] uppercase py-4 px-6 transition-colors shadow-lg active:scale-95 cursor-pointer ${
                  isSoldOut
                    ? 'bg-stone-300 text-stone-600 cursor-not-allowed border border-stone-300'
                    : 'bg-black text-white hover:bg-stone-800'
                }`}
              >
                {isSoldOut
                  ? `SOLD OUT — ₹${totalPrice.toLocaleString()}`
                  : addedToast
                  ? '✓ ADDED TO BAG!'
                  : `${copy.pdpAddToBagText} — ₹${totalPrice.toLocaleString()}`}
              </button>
            </div>

            {/* Guarantee Callout */}
            {showGuarantee && (
              <div className="bg-[#F5F4F1] border border-black/10 p-4 mb-8 flex items-start gap-3 text-xs text-black/80">
                <span className="text-lg">🛡️</span>
                <div>
                  <p className="font-bold uppercase tracking-wider text-black">{copy.pdpGuaranteeTitle}</p>
                  <p className="text-black/60 mt-0.5">{copy.pdpGuaranteeBody}</p>
                </div>
              </div>
            )}

            {/* Expandable Accordions */}
            {(showDetails || showShipping) && (
            <div className="border-t border-black/10 divide-y divide-black/10 text-xs">
              {showDetails && (<>
              <div>
                <button
                  onClick={() => setOpenAccordion(openAccordion === 'fabric' ? null : 'fabric')}
                  className="w-full py-4 flex items-center justify-between font-bold uppercase tracking-wider text-left text-black cursor-pointer"
                >
                  <span>{copy.pdpDetailsTitle}</span>
                  <span>{openAccordion === 'fabric' ? '−' : '+'}</span>
                </button>
                {openAccordion === 'fabric' && (
                  <div className="pb-4 text-black/70 space-y-2 leading-relaxed animate-slide-down">
                    <p className="font-medium text-black">{product.fabricDesc}</p>
                    <ul className="list-disc pl-4 space-y-1">
                      {product.details.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div>
                <button
                  onClick={() => setOpenAccordion(openAccordion === 'fit' ? null : 'fit')}
                  className="w-full py-4 flex items-center justify-between font-bold uppercase tracking-wider text-left text-black cursor-pointer"
                >
                  <span>{copy.pdpFitTitle}</span>
                  <span>{openAccordion === 'fit' ? '−' : '+'}</span>
                </button>
                {openAccordion === 'fit' && (
                  <div className="pb-4 text-black/70 leading-relaxed animate-slide-down">
                    {product.sculptLevel && (
                      <p className="font-semibold text-black mb-1">{isTemplate ? product.sculptLevel : `Sculpt Rating: ${product.sculptLevel}`}</p>
                    )}
                    <p>{product.fitInfo}</p>
                  </div>
                )}
              </div>
              </>)}

              {showShipping && (
              <div>
                <button
                  onClick={() => setOpenAccordion(openAccordion === 'shipping' ? null : 'shipping')}
                  className="w-full py-4 flex items-center justify-between font-bold uppercase tracking-wider text-left text-black cursor-pointer"
                >
                  <span>{copy.pdpShippingTitle}</span>
                  <span>{openAccordion === 'shipping' ? '−' : '+'}</span>
                </button>
                {openAccordion === 'shipping' && (
                  <div className="pb-4 text-black/70 leading-relaxed space-y-1 animate-slide-down">
                    {copy.pdpShippingPoints.map((point, i) => (
                      <p key={i}>• {point}</p>
                    ))}
                  </div>
                )}
              </div>
              )}
            </div>
            )}
          </div>
        </div>

        {/* Customer Reviews Section */}
        {showReviews && (
          <CustomerReviewsSection
            productId={product.id}
            reviews={reviews}
            isTemplate={isTemplate}
            onAddReviewClick={() => setShowWriteReview(true)}
          />
        )}

        {/* Complete the look recommendation carousel */}
        {showRelated && products.some((p) => p.id !== product.id) && (
        <div className="border-t border-black/10 pt-16 mb-16">
          <h2 className="text-3xl font-normal font-serif text-black mb-8">{copy.pdpRelatedTitle}</h2>
          <div className="flex gap-6 overflow-x-auto scroll-hide pb-4">
            {products.filter((p) => p.id !== product.id).map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                isWishlisted={wishlist.includes(p.id)}
                onToggleWishlist={onToggleWishlist}
                onSelectProduct={onSelectProduct}
              />
            ))}
          </div>
        </div>
        )}
      </div>

      {/* Sizing Guide Modal */}
      {showSizeGuide && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white max-w-lg w-full p-8 border border-black/10 shadow-2xl relative animate-slide-down">
            <button
              onClick={() => setShowSizeGuide(false)}
              className="absolute top-4 right-4 text-black/50 hover:text-black text-xl cursor-pointer"
            >
              ✕
            </button>
            <h3 className="text-2xl font-serif text-black mb-2">{tenant?.brandName || tenant?.name || 'The Lunar Clothing'} Size & Fit Guide</h3>
            <p className="text-xs text-black/60 mb-6">Measurements in inches. All cotton maxis feature attached side waist tie-up ropes for an adjustable flared fit.</p>

            <table className="w-full text-xs text-left border-collapse mb-6">
              <thead>
                <tr className="border-b border-black font-bold uppercase">
                  <th className="py-2">Size</th>
                  <th className="py-2">Bust</th>
                  <th className="py-2">Waist</th>
                  <th className="py-2">Length</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10">
                <tr><td className="py-2.5 font-bold">XS</td><td>32-34"</td><td>26-28"</td><td>44" Standard (Up to 50")</td></tr>
                <tr><td className="py-2.5 font-bold">S</td><td>34-36"</td><td>28-30"</td><td>44" Standard (Up to 50")</td></tr>
                <tr><td className="py-2.5 font-bold">M</td><td>36-38"</td><td>30-32"</td><td>44" Standard (Up to 50")</td></tr>
                <tr><td className="py-2.5 font-bold">L</td><td>38-40"</td><td>32-34"</td><td>44" Standard (Up to 50")</td></tr>
                <tr><td className="py-2.5 font-bold">XL</td><td>40-42"</td><td>34-36"</td><td>44" Standard (Up to 50")</td></tr>
                <tr><td className="py-2.5 font-bold">XXL</td><td>42-44"</td><td>36-38"</td><td>44" Standard (Up to 50")</td></tr>
              </tbody>
            </table>

            <button
              onClick={() => setShowSizeGuide(false)}
              className="w-full bg-black text-white font-bold text-xs uppercase tracking-widest py-3 cursor-pointer"
            >
              GOT IT — CLOSE
            </button>
          </div>
        </div>
      )}

      {/* Write Review Modal */}
      <WriteReviewModal
        key={showWriteReview ? 'review-open' : 'review-closed'}
        prompt={copy.reviewPrompt}
        isOpen={showWriteReview}
        onClose={() => setShowWriteReview(false)}
        onSaveReview={onSaveReview}
      />
    </div>
  )
}

function getPromoConfig(tenant?: TenantConfig) {
  const isTemplate = isTemplateStore(tenant)
  const promo = (tenant?.theme?.discountCode || (isTemplate ? `${(tenant?.slug || 'STORE').toUpperCase()}10` : 'LUNAR15')).toUpperCase()
  const promoPercent = tenant?.theme?.discountPercent || (isTemplate ? 10 : 15)
  const acceptedCodes = isTemplate ? [promo] : [promo, 'FIRST15']
  return { promo, promoPercent, acceptedCodes }
}

function getDiscountAmount(tenant: TenantConfig | undefined, appliedPromo: string | null, rawSubtotal: number) {
  const { promo, promoPercent } = getPromoConfig(tenant)
  return appliedPromo === promo ? Math.round(rawSubtotal * (promoPercent / 100)) : 0
}

// 14. SLIDE-OVER CART DRAWER
function CartDrawer({
  tenant,
  isOpen,
  onClose,
  cart,
  appliedPromo,
  onApplyPromo,
  onUpdateQuantity,
  onRemoveItem,
  onStartCheckout,
}: {
  tenant?: TenantConfig
  isOpen: boolean
  onClose: () => void
  cart: CartItem[]
  appliedPromo: string | null
  onApplyPromo: (code: string | null) => void
  onUpdateQuantity: (index: number, delta: number) => void
  onRemoveItem: (index: number) => void
  onStartCheckout: () => void
}) {
  const [promoCode, setPromoCode] = useState('')
  const [promoError, setPromoError] = useState('')

  if (!isOpen) return null

  const copy = getStorefrontCopy(tenant)
  const isTemplate = isTemplateStore(tenant)
  const { promo, promoPercent, acceptedCodes } = getPromoConfig(tenant)
  const setAppliedPromo = onApplyPromo

  const rawSubtotal = cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0)
  const discountAmount = getDiscountAmount(tenant, appliedPromo, rawSubtotal)
  const subtotal = rawSubtotal - discountAmount

  const shipping = getShippingConfig(tenant)
  const freeShippingThreshold = shipping.threshold
  const remainingForFreeShipping = shipping.costFor(subtotal) === 0 ? 0 : Math.max(0, freeShippingThreshold - subtotal)
  const freeShippingPercent = remainingForFreeShipping === 0 ? 100 : Math.min(100, (subtotal / freeShippingThreshold) * 100)

  const handleApplyPromo = (e: React.FormEvent) => {
    e.preventDefault()
    if (acceptedCodes.includes(promoCode.trim().toUpperCase())) {
      setAppliedPromo(promo)
      setPromoError('')
    } else {
      setPromoError(`Invalid code. Use ${promo} for ${promoPercent}% off!`)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-xs animate-fade-in" />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col animate-slide-in-right">
          <div className="p-6 border-b border-black/10 flex items-center justify-between bg-stone-50">
            <h2 className="text-xl font-serif text-black uppercase tracking-wider">
              YOUR BAG ({cart.reduce((sum, i) => sum + i.quantity, 0)})
            </h2>
            <button onClick={onClose} className="text-black/60 hover:text-black p-1 text-xl font-light cursor-pointer">
              ✕
            </button>
          </div>

          <div className="bg-black text-white px-6 py-3.5 text-xs">
            {remainingForFreeShipping > 0 ? (
              <p className="mb-2 tracking-wide font-medium">
                Add <span className="font-bold underline">₹{remainingForFreeShipping}</span> more for Free Delivery in India
              </p>
            ) : (
              <p className="mb-2 font-bold tracking-wide text-emerald-400">🎉 YOU QUALIFY FOR FREE DELIVERY IN INDIA!</p>
            )}
            <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-500"
                style={{ width: `${freeShippingPercent}%` }}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-black/50 py-12">
                <span className="text-4xl mb-3">🛍️</span>
                <p className="text-lg font-serif text-black mb-1">Your bag is empty</p>
                <p className="text-xs mb-6 max-w-xs">{copy.emptyBagHint}</p>
                <button
                  onClick={onClose}
                  className="bg-black text-white font-bold text-xs tracking-widest uppercase px-6 py-3 cursor-pointer"
                >
                  START SHOPPING
                </button>
              </div>
            ) : (
              cart.map((item, idx) => (
                <div key={idx} className="flex gap-4 border-b border-black/10 pb-6">
                  <img
                    src={item.product.imgMain}
                    alt={item.product.name}
                    className="w-20 h-24 object-cover bg-stone-100 border border-black/10"
                  />
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between font-bold text-sm text-black">
                        <h4>{item.product.name}</h4>
                        <p>₹{(item.product.price * item.quantity).toLocaleString()}</p>
                      </div>

                      {/* Add-on custom tags display */}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {item.selectedSize && (
                          <span className="bg-stone-100 border border-black/10 text-[10px] font-medium px-1.5 py-0.5 text-black">
                            {isTemplate ? item.selectedSize : `Size: ${item.selectedSize}`}
                          </span>
                        )}
                        {item.selectedLining && (
                          <span className="bg-stone-100 border border-black/10 text-[10px] font-medium px-1.5 py-0.5 text-black">
                            {item.selectedLining}
                          </span>
                        )}
                        {item.selectedZip && item.selectedZip !== 'None' && (
                          <span className="bg-stone-100 border border-black/10 text-[10px] font-medium px-1.5 py-0.5 text-black">
                            {item.selectedZip}
                          </span>
                        )}
                        {item.selectedLength && (
                          <span className="bg-stone-100 border border-black/10 text-[10px] font-medium px-1.5 py-0.5 text-black">
                            {item.selectedLength}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center border border-black/20 text-xs">
                        <button
                          onClick={() => onUpdateQuantity(idx, -1)}
                          className="px-2.5 py-1 text-black font-bold hover:bg-stone-100 active:scale-90 cursor-pointer"
                        >
                          -
                        </button>
                        <span className="px-3 font-bold">{item.quantity}</span>
                        <button
                          onClick={() => onUpdateQuantity(idx, 1)}
                          className="px-2.5 py-1 text-black font-bold hover:bg-stone-100 active:scale-90 cursor-pointer"
                        >
                          +
                        </button>
                      </div>

                      <button
                        onClick={() => onRemoveItem(idx)}
                        className="text-xs text-black/40 hover:text-black underline cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {cart.length > 0 && (
            <div className="p-6 border-t border-black/10 bg-stone-50 space-y-4">
              <form onSubmit={handleApplyPromo} className="flex gap-2">
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  placeholder={`PROMO CODE (e.g. ${promo})`}
                  className="flex-1 border border-black/20 bg-white px-3 py-2 text-xs uppercase tracking-wider outline-none focus:border-black"
                />
                <button
                  type="submit"
                  className="bg-black text-white text-xs font-bold uppercase tracking-wider px-4 py-2 hover:bg-stone-800 cursor-pointer"
                >
                  APPLY
                </button>
              </form>

              {appliedPromo && (
                <p className="text-xs font-bold text-emerald-700 flex items-center justify-between">
                  <span>✓ Code {promo} Applied ({promoPercent}% Off)</span>
                  <span>-₹{discountAmount.toLocaleString()}</span>
                </p>
              )}
              {promoError && <p className="text-xs text-red-600 font-medium">{promoError}</p>}

              <div className="border-t border-black/10 pt-3">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs font-bold uppercase tracking-widest text-black/60">Subtotal</span>
                  <span className="text-xl font-bold text-black">₹{subtotal.toLocaleString()}</span>
                </div>
                <p className="text-[11px] text-black/50 mb-4">Taxes & shipping calculated at checkout.</p>
                <button
                  onClick={onStartCheckout}
                  className="w-full bg-black text-white font-bold text-xs tracking-[0.2em] uppercase py-4 shadow-lg hover:bg-stone-800 transition-colors active:scale-95 cursor-pointer"
                >
                  CHECKOUT NOW — ₹{subtotal.toLocaleString()}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// 15. CHECKOUT MULTI-STEP MODAL
function CheckoutModal({
  tenant,
  isOpen,
  onClose,
  cart,
  subtotal,
  discountAmount,
  user,
  onOrderPlaced,
  onOpenAccount,
  onCompleteOrder,
  discountCode,
}: {
  tenant?: TenantConfig
  isOpen: boolean
  onClose: () => void
  cart: CartItem[]
  subtotal: number
  discountAmount: number
  user: UserAccount | null
  onOrderPlaced: (order: TrackedOrder, customerEmail?: string) => void
  onOpenAccount: () => void
  onCompleteOrder: () => void
  discountCode?: string | null
}) {
  const [step, setStep] = useState<'shipping' | 'payment' | 'success'>('shipping')
  const demoPrefill = DEMO_MODE && !isTemplateStore(tenant)
  const [formData, setFormData] = useState({
    name: user?.name || (demoPrefill ? 'Priya Sharma' : ''),
    email: user?.email || (demoPrefill ? 'priya.sharma@example.com' : ''),
    phone: user?.phone || (demoPrefill ? '+91 98765 43210' : ''),
    address: demoPrefill ? 'Flat 402, Sunshine Heights, Jubilee Hills' : '',
    city: demoPrefill ? 'Hyderabad' : '',
    state: demoPrefill ? 'Telangana' : '',
    pincode: demoPrefill ? '500033' : '',
    paymentMethod: 'upi',
  })
  const [orderId, setOrderId] = useState('')
  const [placeError, setPlaceError] = useState<string | null>(null)

  if (!isOpen) return null

  const shippingCost = getShippingConfig(tenant).costFor(subtotal)
  const finalTotal = subtotal + shippingCost

  const handleShippingSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setStep('payment')
  }

  const copy = getStorefrontCopy(tenant)
  const brandName = tenant?.brandName || tenant?.name || 'The Lunar Clothing'

  const handlePlaceOrder = async () => {
    const orderPrefix = isTemplateStore(tenant) ? (tenant?.slug || 'ORDER').toUpperCase().slice(0, 8) : 'LUNAR'
    const generatedId = `${orderPrefix}-` + Math.floor(100000 + Math.random() * 900000)
    const awbCode = 'BD' + Math.floor(100000000 + Math.random() * 900000000) + 'IN'
    const paymentMethod =
      formData.paymentMethod === 'cod' ? 'COD' : formData.paymentMethod === 'card' ? 'Card' : 'UPI'
    let confirmedId = generatedId
    if (tenant?.slug) {
      const remote = await submitStorefrontOrder(tenant.slug, {
        items: cart.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
          size: i.selectedSize,
          lining: i.selectedLining,
          zip: i.selectedZip,
          length: i.selectedLength,
        })),
        shippingAddress: {
          name: formData.name,
          phone: formData.phone,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          pincode: formData.pincode,
        },
        customerEmail: formData.email,
        paymentMethod,
        discountCode: discountCode || undefined,
      })
      if (remote?.id) confirmedId = remote.id
      else if (!DEMO_MODE) {
        setPlaceError(remote?.error || 'This store could not take the order. Nothing was charged.')
        return
      }
    } else if (!DEMO_MODE) {
      setPlaceError('This store could not take the order. Nothing was charged.')
      return
    }
    setPlaceError(null)
    const newTrackedOrder: TrackedOrder = {
      id: confirmedId,
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      status: 'Processing',
      courier: 'Blue Dart Express',
      awb: awbCode,
      estimatedDelivery: '3 - 5 Business Days',
      subtotal,
      shipping: shippingCost,
      total: finalTotal,
      paymentMethod,
      shippingAddress: {
        name: formData.name,
        phone: formData.phone,
        address: formData.address,
        city: formData.city,
        state: formData.state,
        pincode: formData.pincode,
      },
      items: cart.map((i) => ({
        name: i.product.name,
        price: i.product.price,
        quantity: i.quantity,
        size: i.selectedSize,
        lining: i.selectedLining,
        zip: i.selectedZip,
        length: i.selectedLength,
        image: i.product.imgMain,
      })),
      timeline: [
        {
          title: 'Order Confirmed & Payment Verified',
          time: 'Just now',
          desc: `Order received and logged by the ${brandName} fulfillment team.`,
          completed: true,
          current: true,
        },
        {
          title: copy.orderStepTitle,
          time: 'Pending Next Step',
          desc: copy.orderStepDesc,
          completed: false,
        },
        {
          title: 'Dispatched with Blue Dart Express',
          time: 'Expected Tomorrow',
          desc: `Will be dispatched via Blue Dart Express (AWB: ${awbCode}).`,
          completed: false,
        },
        {
          title: 'Delivered to Doorstep',
          time: '3 - 5 Business Days',
          desc: `Doorstep delivery to ${formData.city}.`,
          completed: false,
        },
      ],
    }

    setOrderId(confirmedId)
    onOrderPlaced(newTrackedOrder, formData.email)
    setStep('success')
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white max-w-2xl w-full border border-black/10 shadow-2xl rounded-sm overflow-hidden animate-slide-down my-8">
        <div className="bg-black text-white p-6 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono tracking-[0.25em] text-white/60 uppercase">SECURE CHECKOUT</p>
            <h2 className="text-xl font-serif uppercase">{brandName}</h2>
          </div>
          {step !== 'success' && (
            <button onClick={onClose} className="text-white/70 hover:text-white text-xl cursor-pointer">
              ✕
            </button>
          )}
        </div>

        <div className="bg-stone-100 px-6 py-3 border-b border-black/10 flex items-center justify-around text-xs font-bold tracking-widest uppercase">
          <span className={step === 'shipping' ? 'text-black border-b-2 border-black pb-0.5' : 'text-black/40'}>
            1. Shipping Address
          </span>
          <span className="text-black/30">→</span>
          <span className={step === 'payment' ? 'text-black border-b-2 border-black pb-0.5' : 'text-black/40'}>
            2. Payment Method
          </span>
          <span className="text-black/30">→</span>
          <span className={step === 'success' ? 'text-emerald-700 font-bold' : 'text-black/40'}>
            3. Confirmation & Tracking
          </span>
        </div>

        <div className="p-6 md:p-8">
          {step === 'shipping' && (
            <form onSubmit={handleShippingSubmit} className="space-y-4 text-xs">
              <h3 className="text-sm font-bold uppercase tracking-wider text-black mb-2">Delivery Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-black/60 font-medium mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border border-black/20 p-2.5 outline-none focus:border-black text-xs"
                  />
                </div>
                <div>
                  <label className="block text-black/60 font-medium mb-1">Phone Number (For WhatsApp Updates) *</label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full border border-black/20 p-2.5 outline-none focus:border-black text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-black/60 font-medium mb-1">Email Address (For Order Tracking) *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full border border-black/20 p-2.5 outline-none focus:border-black text-xs"
                />
              </div>

              <div>
                <label className="block text-black/60 font-medium mb-1">Street Address / House No. *</label>
                <input
                  type="text"
                  required
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full border border-black/20 p-2.5 outline-none focus:border-black text-xs"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-black/60 font-medium mb-1">City *</label>
                  <input
                    type="text"
                    required
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full border border-black/20 p-2.5 outline-none focus:border-black text-xs"
                  />
                </div>
                <div>
                  <label className="block text-black/60 font-medium mb-1">State *</label>
                  <input
                    type="text"
                    required
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="w-full border border-black/20 p-2.5 outline-none focus:border-black text-xs"
                  />
                </div>
                <div>
                  <label className="block text-black/60 font-medium mb-1">Pincode *</label>
                  <input
                    type="text"
                    required
                    value={formData.pincode}
                    onChange={(e) => setFormData({ ...formData, pincode: e.target.value })}
                    className="w-full border border-black/20 p-2.5 outline-none focus:border-black text-xs"
                  />
                </div>
              </div>

              <div className="bg-stone-50 border border-black/10 p-4 mt-4 flex items-center justify-between">
                <div>
                  <p className="font-bold text-black uppercase">Order Total</p>
                  <p className="text-black/50 text-[11px]">
                    {discountAmount > 0 && `Includes ₹${discountAmount.toLocaleString()} discount • `}
                    {shippingCost === 0 ? 'Free Express Delivery In India' : `Shipping ₹${shippingCost}`}
                  </p>
                </div>
                <p className="text-lg font-bold text-black">₹{finalTotal.toLocaleString()}</p>
              </div>

              <button
                type="submit"
                className="w-full bg-black text-white font-bold text-xs tracking-[0.2em] uppercase py-3.5 mt-4 hover:bg-stone-800 cursor-pointer"
              >
                PROCEED TO PAYMENT →
              </button>
            </form>
          )}

          {step === 'payment' && (
            <div className="space-y-6 text-xs">
              <div className="flex items-center justify-between border-b border-black/10 pb-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-black">Select Payment Option</h3>
                <button onClick={() => setStep('shipping')} className="text-black/50 hover:text-black underline cursor-pointer">
                  ← Edit Address
                </button>
              </div>

              <div className="space-y-3">
                <label className={`block border p-4 cursor-pointer transition-all ${
                  formData.paymentMethod === 'upi' ? 'border-black bg-stone-50' : 'border-black/20'
                }`}>
                  <div className="flex items-center gap-3 font-bold text-sm text-black">
                    <input
                      type="radio"
                      name="payment"
                      checked={formData.paymentMethod === 'upi'}
                      onChange={() => setFormData({ ...formData, paymentMethod: 'upi' })}
                    />
                    <span>Instant UPI / Google Pay / PhonePe / Paytm</span>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 ml-auto">
                      RECOMMENDED
                    </span>
                  </div>
                  {formData.paymentMethod === 'upi' && (
                    <p className="text-xs text-black/60 mt-2 pl-6">
                      Pay instantly via GPay, PhonePe, or Scan QR Code at delivery.
                    </p>
                  )}
                </label>

                <label className={`block border p-4 cursor-pointer transition-all ${
                  formData.paymentMethod === 'cod' ? 'border-black bg-stone-50' : 'border-black/20'
                }`}>
                  <div className="flex items-center gap-3 font-bold text-sm text-black">
                    <input
                      type="radio"
                      name="payment"
                      checked={formData.paymentMethod === 'cod'}
                      onChange={() => setFormData({ ...formData, paymentMethod: 'cod' })}
                    />
                    <span>Cash on Delivery (COD)</span>
                  </div>
                  {formData.paymentMethod === 'cod' && (
                    <p className="text-xs text-black/60 mt-2 pl-6">
                      Pay cash to courier executive upon delivery.
                    </p>
                  )}
                </label>

                <label className={`block border p-4 cursor-pointer transition-all ${
                  formData.paymentMethod === 'card' ? 'border-black bg-stone-50' : 'border-black/20'
                }`}>
                  <div className="flex items-center gap-3 font-bold text-sm text-black">
                    <input
                      type="radio"
                      name="payment"
                      checked={formData.paymentMethod === 'card'}
                      onChange={() => setFormData({ ...formData, paymentMethod: 'card' })}
                    />
                    <span>Credit Card / Debit Card / Net Banking</span>
                  </div>
                </label>
              </div>

              {placeError && <p className="text-xs text-rose-700 mb-3">{placeError}</p>}
              <div className="border-t border-black/10 pt-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-black/60">Amount Payable</p>
                  <p className="text-xl font-bold text-black">₹{finalTotal.toLocaleString()}</p>
                </div>
                <button
                  onClick={handlePlaceOrder}
                  className="bg-black text-white font-bold text-xs tracking-[0.2em] uppercase px-8 py-3.5 hover:bg-stone-800 shadow-lg cursor-pointer"
                >
                  PLACE ORDER NOW ✓
                </button>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 font-bold">
                ✓
              </div>
              <p className="text-xs font-mono font-bold tracking-[0.2em] text-emerald-700 uppercase mb-1">
                ORDER SUCCESSFULLY PLACED!
              </p>
              <h2 className="text-3xl font-serif text-black mb-2">Thank you for your order, {formData.name}!</h2>
              <p className="text-xs text-black/60 mb-6">
                Order ID: <span className="font-bold text-black font-mono">{orderId}</span> • A confirmation has been sent to <span className="font-medium text-black">{formData.email}</span>.
              </p>

              <div className="bg-stone-50 border border-black/10 p-4 text-left mb-6 text-xs space-y-3">
                <div className="flex justify-between border-b border-black/10 pb-2">
                  <span className="font-bold uppercase text-black/60">Shipping To:</span>
                  <span className="text-right text-black font-medium">{formData.address}, {formData.city}, {formData.pincode}</span>
                </div>
                <div className="flex justify-between border-b border-black/10 pb-2">
                  <span className="font-bold uppercase text-black/60">Estimated Delivery:</span>
                  <span className="text-emerald-700 font-bold">3 - 5 Business Days (Blue Dart Express)</span>
                </div>
                <div>
                  <p className="font-bold uppercase text-black/60 mb-2">Itemized Summary:</p>
                  {cart.map((item, idx) => (
                    <div key={idx} className="flex justify-between py-1 border-b border-black/5 text-[11px]">
                      <span>
                        {item.quantity}x {item.product.name}
                        {[item.selectedSize, item.selectedLining, item.selectedZip, item.selectedLength].some(Boolean) &&
                          ` (${[item.selectedSize && (isTemplateStore(tenant) ? item.selectedSize : `Size: ${item.selectedSize}`), item.selectedLining, item.selectedZip, item.selectedLength].filter(Boolean).join(', ')})`}
                      </span>
                      <span className="font-bold">₹{(item.product.price * item.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-xs text-emerald-700">
                    <span>Discount</span>
                    <span>-₹{discountAmount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs text-black/60">
                  <span>Shipping</span>
                  <span>{shippingCost === 0 ? 'Free' : `₹${shippingCost}`}</span>
                </div>
                <div className="flex justify-between pt-2 text-sm font-bold text-black">
                  <span>{formData.paymentMethod === 'cod' ? 'Total Payable on Delivery' : 'Grand Total Paid'}</span>
                  <span>₹{finalTotal.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
                <button
                  onClick={() => {
                    onCompleteOrder()
                    onClose()
                    onOpenAccount()
                  }}
                  className="bg-black text-white font-bold text-xs tracking-[0.2em] uppercase px-6 py-3.5 hover:bg-stone-800 cursor-pointer shadow-lg flex items-center justify-center gap-2"
                >
                  <span>📦 TRACK ORDER IN YOUR ACCOUNT →</span>
                </button>
                <button
                  onClick={() => {
                    onCompleteOrder()
                    onClose()
                  }}
                  className="border border-black/30 text-black font-bold text-xs tracking-[0.2em] uppercase px-6 py-3.5 hover:bg-stone-50 cursor-pointer"
                >
                  CONTINUE SHOPPING
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// 15b. CUSTOMER AUTHENTICATION MODAL
function AuthModal({
  isOpen,
  onClose,
  onLoginSuccess,
  tenant,
}: {
  isOpen: boolean
  onClose: () => void
  onLoginSuccess: (user: UserAccount, isNew?: boolean) => void
  tenant?: TenantConfig
}) {
  const [tab, setTab] = useState<'signin' | 'signup'>('signin')
  
  const isTemplate = isTemplateStore(tenant)
  const tenantKey = tenant?.id || 'tenant_lunar'

  // Shopper sign in state
  const [signInEmail, setSignInEmail] = useState(DEMO_MODE && !isTemplate ? DEMO_SHOPPER.email : '')
  const [signInPassword, setSignInPassword] = useState(DEMO_MODE && !isTemplate ? DEMO_SHOPPER.password : '')
  const [signInLoading, setSignInLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [signInError, setSignInError] = useState('')

  // Shopper sign up state
  const [signUpStep, setSignUpStep] = useState<'form' | 'otp'>('form')
  const [signUpName, setSignUpName] = useState('')
  const [signUpEmail, setSignUpEmail] = useState('')
  const [signUpPhone, setSignUpPhone] = useState('')
  const [signUpPassword, setSignUpPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [generatedOtp, setGeneratedOtp] = useState('849201')
  const [otpError, setOtpError] = useState('')
  const [resendTimer, setResendTimer] = useState(30)

  const brandName = tenant?.brandName || tenant?.name || 'The Lunar Clothing'

  useEffect(() => {
    let interval: any
    if (signUpStep === 'otp' && resendTimer > 0) {
      interval = setInterval(() => setResendTimer((prev) => prev - 1), 1000)
    }
    return () => clearInterval(interval)
  }, [signUpStep, resendTimer])

  if (!isOpen) return null

  // Shopper login handler
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!signInEmail || !signInPassword) {
      setSignInError('Please provide both email and password.')
      return
    }

    setSignInLoading(true)
    setSignInError('')
    const user = await shopperAccounts.signIn(tenantKey, signInEmail, signInPassword, !isTemplate)
    setSignInLoading(false)
    if (!user) {
      setSignInError(
        shopperAccounts.emailExists(tenantKey, signInEmail, !isTemplate)
          ? 'Incorrect password. Please try again.'
          : 'No account found with this email. Create an account to continue.'
      )
      return
    }
    onLoginSuccess(user, false)
    onClose()
  }

  const handleFillDemo = () => {
    setSignInEmail(DEMO_SHOPPER.email)
    setSignInPassword(DEMO_SHOPPER.password)
    setSignInError('')
  }

  // Shopper registration OTP handlers
  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault()
    if (!signUpName || !signUpEmail || !signUpPassword) {
      setOtpError('Please fill out all mandatory fields.')
      return
    }
    if (signUpPassword.length < 6) {
      setOtpError('Password must be at least 6 characters.')
      return
    }
    if (shopperAccounts.emailExists(tenantKey, signUpEmail, !isTemplate)) {
      setOtpError('An account with this email already exists. Please sign in instead.')
      return
    }
    const randomOtp = Math.floor(100000 + Math.random() * 900000).toString()
    setGeneratedOtp(randomOtp)
    setSignUpStep('otp')
    setResendTimer(30)
    setOtpError('')
  }

  const handleVerifyOtpAndRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (otpCode.trim() !== generatedOtp) {
      setOtpError('Invalid verification code. Please check and try again.')
      return
    }

    const res = await shopperAccounts.register(
      tenantKey,
      { name: signUpName, email: signUpEmail, phone: signUpPhone, password: signUpPassword },
      !isTemplate
    )
    if (!res.user) {
      setOtpError(res.error || 'Could not create your account. Please try again.')
      return
    }
    onLoginSuccess(res.user, true)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full border border-black/10 shadow-2xl rounded-sm overflow-hidden animate-slide-down">
        {/* Header */}
        <div className="text-white p-6 flex items-center justify-between bg-black">
          <div className="flex items-center gap-3">
            {tenant?.logo ? (
              <img src={tenant.logo} alt={brandName} className="h-8 w-auto object-contain rounded-md bg-white/10 p-0.5" />
            ) : (
              <div className="w-8 h-8 rounded-md bg-white/20 flex items-center justify-center text-white font-serif font-bold text-sm">
                {brandName.charAt(0)}
              </div>
            )}
            <div>
              <p className="text-[10px] font-mono tracking-[0.25em] text-white/60 uppercase">{brandName}</p>
              <h2 className="text-lg font-serif">Customer Portal & Tracking</h2>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl cursor-pointer" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex border-b border-black/10 text-xs font-bold uppercase tracking-wider bg-stone-50">
          <button
            onClick={() => { setTab('signin'); setSignUpStep('form') }}
            className={`flex-1 py-3 text-center transition-colors cursor-pointer ${
              tab === 'signin'
                ? 'bg-white text-black border-b-2 border-black font-extrabold shadow-xs'
                : 'text-black/50 hover:text-black'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setTab('signup'); setSignUpStep('form') }}
            className={`flex-1 py-3 text-center transition-colors cursor-pointer ${
              tab === 'signup'
                ? 'bg-white text-black border-b-2 border-black font-extrabold shadow-xs'
                : 'text-black/50 hover:text-black'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6">
          {/* ── 1. CUSTOMER SIGN IN ─────────────────────────────── */}
          {tab === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4 text-xs">
              {!isTemplate && (
                <div className="bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900 rounded-xs flex items-center justify-between">
                  <span>⚡ Test with demo account to view existing orders:</span>
                  <button
                    type="button"
                    onClick={handleFillDemo}
                    className="font-bold underline text-amber-950 hover:text-black cursor-pointer"
                  >
                    Quick Fill
                  </button>
                </div>
              )}

              <div>
                <label className="block text-black/60 font-semibold mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  value={signInEmail}
                  onChange={(e) => setSignInEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border border-black/20 p-2.5 outline-none focus:border-black text-xs"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-black/60 font-semibold">Password *</label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-[10px] text-black/50 hover:text-black cursor-pointer"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={signInPassword}
                  onChange={(e) => setSignInPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-black/20 p-2.5 outline-none focus:border-black text-xs"
                />
              </div>

              {signInError && <p className="text-red-600 font-medium">{signInError}</p>}

              <button
                type="submit"
                disabled={signInLoading}
                className="w-full bg-black text-white font-bold text-xs tracking-[0.2em] uppercase py-3.5 mt-2 hover:bg-stone-800 transition-colors cursor-pointer shadow-md disabled:opacity-60"
              >
                {signInLoading ? 'SIGNING IN…' : 'SIGN IN TO VIEW ORDERS →'}
              </button>

              <div className="text-center pt-2 text-black/50">
                <span>New to {brandName}? </span>
                <button
                  type="button"
                  onClick={() => { setTab('signup'); setSignUpStep('form') }}
                  className="text-black font-bold underline cursor-pointer"
                >
                  Register here
                </button>
              </div>
            </form>
          )}

          {/* ── CUSTOMER CREATE ACCOUNT (SIGN UP) ────────────── */}
          {tab === 'signup' && (
            <div>
              {signUpStep === 'form' ? (
                <form onSubmit={handleSendOtp} className="space-y-3.5 text-xs">
                  <p className="text-[11px] text-black/60 mb-2">
                    Create an account to track all your orders, manage custom tailoring options, and get express support.
                  </p>

                  <div>
                    <label className="block text-black/60 font-semibold mb-1">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={signUpName}
                      onChange={(e) => setSignUpName(e.target.value)}
                      placeholder="Your full name"
                      className="w-full border border-black/20 p-2.5 outline-none focus:border-black text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-black/60 font-semibold mb-1">Email Address * (Will be verified)</label>
                    <input
                      type="email"
                      required
                      value={signUpEmail}
                      onChange={(e) => setSignUpEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full border border-black/20 p-2.5 outline-none focus:border-black text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-black/60 font-semibold mb-1">Mobile Number (For Courier Updates)</label>
                    <input
                      type="tel"
                      value={signUpPhone}
                      onChange={(e) => setSignUpPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full border border-black/20 p-2.5 outline-none focus:border-black text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-black/60 font-semibold mb-1">Create Password *</label>
                    <input
                      type="password"
                      required
                      value={signUpPassword}
                      onChange={(e) => setSignUpPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full border border-black/20 p-2.5 outline-none focus:border-black text-xs"
                    />
                  </div>

                  {otpError && <p className="text-red-600 font-medium">{otpError}</p>}

                  <button
                    type="submit"
                    className="w-full bg-black text-white font-bold text-xs tracking-[0.2em] uppercase py-3.5 mt-2 hover:bg-stone-800 transition-colors cursor-pointer shadow-md"
                  >
                    CONTINUE TO EMAIL VERIFICATION →
                  </button>

                  <div className="text-center pt-2 text-black/50">
                    <span>Already registered? </span>
                    <button
                      type="button"
                      onClick={() => setTab('signin')}
                      className="text-black font-bold underline cursor-pointer"
                    >
                      Sign in
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtpAndRegister} className="space-y-4 text-xs">
                  <div className="text-center py-2">
                    <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-xl mx-auto mb-2 font-bold">
                      ✉
                    </div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-black">Verify Your Email</h3>
                    <p className="text-black/60 text-[11px] mt-1">
                      We sent a 6-digit verification code to <span className="font-bold text-black">{signUpEmail}</span>
                    </p>
                  </div>

                  {/* Demo OTP auto-paste box */}
                  <div className="bg-emerald-50 border border-emerald-200 p-3 text-center rounded-xs">
                    <p className="text-[11px] text-emerald-800 font-medium">Demo verification code sent to your inbox:</p>
                    <div className="flex items-center justify-center gap-2 mt-1">
                      <span className="font-mono text-base font-bold tracking-widest text-emerald-900 bg-white px-3 py-1 border border-emerald-300">
                        {generatedOtp}
                      </span>
                      <button
                        type="button"
                        onClick={() => setOtpCode(generatedOtp)}
                        className="text-[10px] uppercase font-bold text-emerald-900 underline cursor-pointer"
                      >
                        Auto-Fill Code
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-black/60 font-semibold mb-1">Enter 6-Digit Code *</label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="e.g. 849201"
                      className="w-full border border-black/20 p-2.5 text-center font-mono text-lg tracking-[0.3em] font-bold outline-none focus:border-black"
                    />
                  </div>

                  {otpError && <p className="text-red-600 font-medium text-center">{otpError}</p>}

                  <button
                    type="submit"
                    className="w-full bg-black text-white font-bold text-xs tracking-[0.2em] uppercase py-3.5 hover:bg-stone-800 cursor-pointer shadow-md"
                  >
                    VERIFY EMAIL & COMPLETE SIGN UP ✓
                  </button>

                  <div className="flex justify-between items-center text-[11px] text-black/60 pt-2">
                    <button
                      type="button"
                      onClick={() => setSignUpStep('form')}
                      className="underline hover:text-black cursor-pointer"
                    >
                      ← Edit details
                    </button>
                    {resendTimer > 0 ? (
                      <span>Resend code in {resendTimer}s</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const code = Math.floor(100000 + Math.random() * 900000).toString()
                          setGeneratedOtp(code)
                          setResendTimer(30)
                        }}
                        className="font-bold underline text-black cursor-pointer"
                      >
                        Resend Code
                      </button>
                    )}
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// 15c. ACCOUNT DRAWER (EXISTING ORDERS & LIVE REAL-TIME TRACKING)
function AccountDrawer({
  tenant,
  isOpen,
  onClose,
  user,
  orders,
  lookupOrders = orders,
  onSignOut,
  onSelectProduct,
}: {
  tenant?: TenantConfig
  isOpen: boolean
  onClose: () => void
  user: UserAccount | null
  orders: TrackedOrder[]
  lookupOrders?: TrackedOrder[]
  onSignOut: () => void
  onSelectProduct: (id: number) => void
}) {
  const switchLayer = useSwitchLayer()
  const [activeTab, setActiveTab] = useState<'orders' | 'lookup' | 'profile'>('orders')
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(orders[0]?.id || null)
  const [copiedAwb, setCopiedAwb] = useState<string | null>(null)
  const [lookupQuery, setLookupQuery] = useState('')
  const [lookupResult, setLookupResult] = useState<TrackedOrder | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  if (!isOpen) return null

  const brandName = tenant?.brandName || tenant?.name || 'The Lunar Clothing'
  const trackingEnabled = tenant?.theme?.enableOrderTracking ?? true
  const supportPhone = (tenant?.contact?.phone || tenant?.ownerPhone || '+919876543210').replace(/[^0-9]/g, '')
  const exampleOrderId = orders[0]?.id || (isTemplateStore(tenant) ? `${(tenant?.slug || 'ORDER').toUpperCase().slice(0, 8)}-123456` : 'LUNAR-892410')

  const handleCopyAwb = (awb: string) => {
    navigator.clipboard.writeText(awb)
    setCopiedAwb(awb)
    setTimeout(() => setCopiedAwb(null), 2000)
  }

  const handleSearchOrder = (e: React.FormEvent) => {
    e.preventDefault()
    setHasSearched(true)
    const cleaned = lookupQuery.trim().toUpperCase()
    const digits = cleaned.replace(/[^0-9]/g, '').slice(-10)
    const found = cleaned
      ? lookupOrders.find(
          (o) =>
            o.id.toUpperCase() === cleaned ||
            o.awb.toUpperCase() === cleaned ||
            (digits.length === 10 && o.shippingAddress.phone.replace(/[^0-9]/g, '').slice(-10) === digits)
        )
      : undefined
    setLookupResult(found || null)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-xs animate-fade-in" />
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-2xl bg-white shadow-2xl flex flex-col justify-between animate-slide-in-right">
          {/* Header */}
          <div className="p-6 border-b border-black/10 bg-stone-950 text-white flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              {tenant?.logo || tenant?.theme?.logoUrl ? (
                <img src={tenant.logo || tenant.theme.logoUrl} alt={brandName} className="h-9 w-auto object-contain rounded-md" />
              ) : tenant && isTemplateStore(tenant) ? (
                <div className="w-9 h-9 rounded-md bg-white/10 border border-white/20 flex items-center justify-center font-bold text-sm">
                  {brandName.charAt(0).toUpperCase()}
                </div>
              ) : (
                <img src="/lunar-logo.png" alt="Lunar" className="h-9 w-auto object-contain rounded-md" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-serif tracking-wider uppercase">{user ? user.name : 'Customer Account'}</h2>
                  {user?.verified && (
                    <span className="bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[9px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span>✓</span> Verified Email
                    </span>
                  )}
                </div>
                <p className="text-white/60 text-xs">{user?.email || 'priya.sharma@example.com'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {user && (
                <button
                  onClick={onSignOut}
                  className="text-xs text-white/70 hover:text-white underline cursor-pointer tracking-wider uppercase font-semibold"
                >
                  Sign Out
                </button>
              )}
              <button onClick={onClose} className="text-white/60 hover:text-white p-1 text-2xl font-light cursor-pointer">
                ✕
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-black/10 text-xs font-bold uppercase tracking-widest bg-stone-50">
            <button
              onClick={() => setActiveTab('orders')}
              className={`flex-1 py-3.5 text-center transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'orders' ? 'bg-white text-black border-b-2 border-black' : 'text-black/50 hover:text-black'
              }`}
            >
              <span>Existing Orders</span>
              <span className="bg-black text-white text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                {orders.length}
              </span>
            </button>
            {trackingEnabled && (
            <button
              onClick={() => setActiveTab('lookup')}
              className={`flex-1 py-3.5 text-center transition-colors cursor-pointer ${
                activeTab === 'lookup' ? 'bg-white text-black border-b-2 border-black' : 'text-black/50 hover:text-black'
              }`}
            >
              🔍 Direct AWB Tracker
            </button>
            )}
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex-1 py-3.5 text-center transition-colors cursor-pointer ${
                activeTab === 'profile' ? 'bg-white text-black border-b-2 border-black' : 'text-black/50 hover:text-black'
              }`}
            >
              Customer Details
            </button>
          </div>

          {/* Tab Content Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {activeTab === 'orders' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between pb-2 border-b border-black/5">
                  <p className="text-xs font-bold tracking-wider uppercase text-black/60">
                    Showing All Order History ({orders.length})
                  </p>
                  <p className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                    Live Courier Synchronization Active
                  </p>
                </div>

                {orders.length === 0 && (
                  <div className="border border-dashed border-black/15 bg-stone-50 py-12 px-6 text-center">
                    <p className="text-3xl mb-3">📦</p>
                    <p className="text-lg font-serif text-black mb-1">No orders yet</p>
                    <p className="text-xs text-black/55 mb-5">
                      Orders you place with {user?.email || 'your account'} will appear here with live tracking.
                    </p>
                    <button
                      type="button"
                      onClick={onClose}
                      className="bg-black text-white font-bold text-xs tracking-widest uppercase px-6 py-3 cursor-pointer hover:bg-stone-800"
                    >
                      Start Shopping →
                    </button>
                  </div>
                )}

                {orders.map((order) => {
                  const isExpanded = expandedOrderId === order.id
                  const isDelivered = order.status === 'Delivered'
                  const isInTransit = order.status === 'In Transit'

                  return (
                    <div
                      key={order.id}
                      className={`border transition-all ${
                        isExpanded ? 'border-black shadow-md bg-white' : 'border-black/15 bg-stone-50/50 hover:border-black/40'
                      }`}
                    >
                      {/* Order Summary Header */}
                      <div
                        onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                        className="p-4 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 select-none"
                      >
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-sm text-black">{order.id}</span>
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                                isDelivered
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : isInTransit
                                  ? 'bg-blue-100 text-blue-900 border border-blue-300'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {isInTransit && '● '}
                              {order.status}
                            </span>
                            <span className="text-xs text-black/50">• {order.date}</span>
                          </div>
                          <p className="text-xs text-black/70 mt-1">
                            {order.items.length} item(s) • <span className="font-bold text-black">₹{order.total.toLocaleString()}</span> via {order.paymentMethod}
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-black uppercase tracking-wider">
                            {isExpanded ? 'Hide Details ▲' : trackingEnabled ? 'Track Order ▼' : 'View Details ▼'}
                          </span>
                        </div>
                      </div>

                      {/* Expanded Order Details & Tracking Stepper */}
                      {isExpanded && (
                        <div className="border-t border-black/10 p-5 space-y-6 bg-white animate-fade-in">
                          {trackingEnabled && (<>
                          {/* Courier & ETA Pill */}
                          <div className="bg-stone-100 p-4 border border-black/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
                            <div>
                              <p className="text-black/50 font-bold uppercase text-[10px] tracking-wider">Courier Service & AWB</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="font-bold text-black">{order.courier}</span>
                                <span className="font-mono bg-white px-2 py-0.5 border border-black/20 text-black">
                                  {order.awb}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopyAwb(order.awb)}
                                  className="text-[10px] font-bold text-black/70 hover:text-black underline cursor-pointer"
                                >
                                  {copiedAwb === order.awb ? '✓ Copied' : 'Copy'}
                                </button>
                              </div>
                            </div>

                            <div className="md:text-right">
                              <p className="text-black/50 font-bold uppercase text-[10px] tracking-wider">Estimated Delivery</p>
                              <p className="font-bold text-emerald-800 mt-0.5">{order.estimatedDelivery}</p>
                            </div>
                          </div>

                          {/* Visual Step Timeline */}
                          <div>
                            <h4 className="text-xs font-bold uppercase tracking-widest text-black mb-4 flex items-center gap-2">
                              <span>📍 Real-Time Tracking Timeline</span>
                              <span className="text-[10px] font-normal text-black/50 font-sans">(Live Status)</span>
                            </h4>

                            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-black/15">
                              {order.timeline.map((step, sIdx) => {
                                return (
                                  <div key={sIdx} className="relative group">
                                    {/* Indicator Dot */}
                                    <div
                                      className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                                        step.completed
                                          ? 'bg-black text-white'
                                          : step.current
                                          ? 'bg-blue-600 text-white ring-4 ring-blue-100 animate-pulse'
                                          : 'bg-white border-2 border-black/25 text-black/40'
                                      }`}
                                    >
                                      {step.completed ? '✓' : sIdx + 1}
                                    </div>

                                    <div>
                                      <div className="flex items-baseline justify-between gap-2 flex-wrap">
                                        <p
                                          className={`text-xs font-bold ${
                                            step.completed || step.current ? 'text-black' : 'text-black/40'
                                          }`}
                                        >
                                          {step.title}
                                        </p>
                                        <span className="text-[10px] font-mono text-black/50">{step.time}</span>
                                      </div>
                                      <p className="text-[11px] text-black/60 mt-0.5 leading-relaxed">{step.desc}</p>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                          </>)}

                          {/* Items Purchased in this order */}
                          <div className="border-t border-black/10 pt-4">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-black mb-3">
                              Garments In This Order
                            </h4>
                            <div className="space-y-3">
                              {order.items.map((item, iIdx) => (
                                <div key={iIdx} className="flex gap-3.5 bg-stone-50 p-3 border border-black/10">
                                  <img
                                    src={item.image}
                                    alt={item.name}
                                    className="w-16 h-20 object-cover border border-black/10 bg-white"
                                  />
                                  <div className="flex-1 flex flex-col justify-between text-xs">
                                    <div>
                                      <p className="font-bold text-black">{item.name}</p>
                                      <div className="flex gap-2 flex-wrap text-[11px] text-black/60 mt-1">
                                        {item.size && <span className="bg-white border border-black/10 px-1.5 py-0.5">{isTemplateStore(tenant) ? item.size : `Size: ${item.size}`}</span>}
                                        {item.lining && <span className="bg-white border border-black/10 px-1.5 py-0.5">{item.lining}</span>}
                                        {item.zip && item.zip !== 'None' && (
                                          <span className="bg-white border border-black/10 px-1.5 py-0.5">{item.zip}</span>
                                        )}
                                        {item.length && <span className="bg-white border border-black/10 px-1.5 py-0.5">{item.length}</span>}
                                      </div>
                                    </div>
                                    <div className="flex justify-between items-center mt-2">
                                      <span className="text-black/60">Qty: {item.quantity}</span>
                                      <span className="font-bold text-black">₹{(item.price * item.quantity).toLocaleString()}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Shipping Destination & Actions */}
                          <div className="border-t border-black/10 pt-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs">
                            <div>
                              <p className="font-bold uppercase text-[10px] tracking-wider text-black/50">Delivery Address</p>
                              <p className="text-black font-medium mt-0.5">
                                {order.shippingAddress.name} • {order.shippingAddress.address}, {order.shippingAddress.city} {order.shippingAddress.pincode}
                              </p>
                            </div>

                            <a
                              href={`https://wa.me/${supportPhone}?text=${encodeURIComponent(`Hello ${brandName}, I need assistance tracking my order ${order.id}`)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 bg-emerald-700 text-white px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider hover:bg-emerald-800 transition-colors cursor-pointer"
                            >
                              <span>WhatsApp Support 💬</span>
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {trackingEnabled && activeTab === 'lookup' && (
              <div className="space-y-6">
                <div className="bg-stone-50 border border-black/10 p-5">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-black mb-1">Direct Courier & Order Lookup</h3>
                  <p className="text-xs text-black/60 mb-4">
                    Enter any Order ID (e.g. <span className="font-mono font-bold text-black">{exampleOrderId}</span>) or Courier AWB number to fetch instant live tracking records.
                  </p>

                  <form onSubmit={handleSearchOrder} className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={lookupQuery}
                      onChange={(e) => setLookupQuery(e.target.value)}
                      placeholder={`e.g. ${exampleOrderId} or BD8912401IN`}
                      className="flex-1 border border-black/20 bg-white p-2.5 text-xs font-mono uppercase tracking-wider outline-none focus:border-black"
                    />
                    <button
                      type="submit"
                      className="bg-black text-white text-xs font-bold uppercase tracking-widest px-5 py-2.5 hover:bg-stone-800 cursor-pointer"
                    >
                      TRACK →
                    </button>
                  </form>
                </div>

                {hasSearched && (
                  <div>
                    {lookupResult ? (
                      <div className="border border-black p-5 bg-white space-y-4 animate-fade-in">
                        <div className="flex justify-between items-center border-b border-black/10 pb-3">
                          <div>
                            <span className="font-mono font-bold text-base text-black">{lookupResult.id}</span>
                            <p className="text-xs text-black/50">Placed on {lookupResult.date}</p>
                          </div>
                          <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full uppercase">
                            {lookupResult.status}
                          </span>
                        </div>

                        <div className="bg-stone-50 p-3 text-xs flex justify-between">
                          <span>Courier: <strong className="text-black">{lookupResult.courier}</strong> (AWB: {lookupResult.awb})</span>
                          <span className="font-bold text-emerald-700">{lookupResult.estimatedDelivery}</span>
                        </div>

                        {/* Timeline */}
                        <div className="pt-2 pl-4 space-y-4 border-l-2 border-black/20">
                          {lookupResult.timeline.map((step, idx) => (
                            <div key={idx} className="relative">
                              <span
                                className={`absolute -left-6 top-1 w-3.5 h-3.5 rounded-full ${
                                  step.completed ? 'bg-black' : step.current ? 'bg-blue-600 ring-2 ring-blue-200' : 'bg-stone-300'
                                }`}
                              />
                              <p className="text-xs font-bold text-black">{step.title}</p>
                              <p className="text-[11px] text-black/60">{step.desc}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-10 text-black/50 border border-dashed border-black/20 p-6">
                        <p className="text-base font-serif text-black mb-1">No matching order found</p>
                        <p className="text-xs">Please verify your order reference number or mobile number and try again.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="space-y-6 text-xs">
                <div className="bg-stone-50 border border-black/10 p-5 space-y-4">
                  <div className="flex justify-between items-center border-b border-black/10 pb-3">
                    <h3 className="font-bold uppercase tracking-wider text-black">Account Profile</h3>
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-xs">
                      ✓ Email Verified
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-black/50 uppercase text-[10px] font-bold">Registered Name</p>
                      <p className="font-bold text-black text-sm">{user?.name || 'Priya Sharma'}</p>
                    </div>
                    <div>
                      <p className="text-black/50 uppercase text-[10px] font-bold">Email Address</p>
                      <p className="font-bold text-black text-sm">{user?.email || 'priya.sharma@example.com'}</p>
                    </div>
                    <div>
                      <p className="text-black/50 uppercase text-[10px] font-bold">Phone Number</p>
                      <p className="font-bold text-black text-sm">{user?.phone || '+91 98765 43210'}</p>
                    </div>
                    <div>
                      <p className="text-black/50 uppercase text-[10px] font-bold">Default Delivery City</p>
                      <p className="font-bold text-black text-sm">Hyderabad, Telangana (500033)</p>
                    </div>
                  </div>
                </div>

                <div className="bg-stone-50 border border-black/10 p-5">
                  <h3 className="font-bold uppercase tracking-wider text-black mb-2">Saved Delivery Address</h3>
                  <p className="text-black/80 font-medium leading-relaxed">
                    Flat 402, Sunshine Heights, Road No. 36, Jubilee Hills,<br />
                    Hyderabad, Telangana — 500033<br />
                    Phone: +91 98765 43210
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// 15d. ABOUT BRAND MODAL
function AboutModal({
  isOpen,
  onClose,
  onShopClick,
  tenant,
}: {
  isOpen: boolean
  onClose: () => void
  onShopClick: () => void
  tenant?: TenantConfig
}) {
  if (!isOpen) return null

  const brandName = tenant?.brandName || tenant?.name || 'THE LUNAR CLOTHING'
  const copy = getStorefrontCopy(tenant)
  const brandTagline = tenant?.tagline || copy.aboutTagline
  const aboutBio = tenant?.aboutStory || copy.aboutBio

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white max-w-2xl w-full border border-black/10 shadow-2xl rounded-sm overflow-hidden animate-slide-down my-8">
        <div className="bg-black text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo tenant={tenant} className="h-9 w-auto" />
            <div>
              <p className="text-[10px] font-mono tracking-[0.25em] text-white/60 uppercase">{brandName}</p>
              <h2 className="text-lg font-serif">{copy.aboutTitle}</h2>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl cursor-pointer">
            ✕
          </button>
        </div>

        <div className="p-6 md:p-8 space-y-6 text-xs text-black/80 leading-relaxed">
          <div>
            <span className="text-[10px] font-mono font-bold tracking-[0.2em] uppercase text-amber-800 bg-amber-50 px-2 py-0.5 rounded-xs">
              {copy.aboutBadge}
            </span>
            <h3 className="text-2xl font-serif text-black mt-2 mb-3">
              {brandTagline}
            </h3>
            <p className="text-sm font-light text-black/70 leading-relaxed">
              {aboutBio}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            {copy.aboutPillars.map((pillar) => (
              <div key={pillar.title} className="border border-black/10 p-4 bg-stone-50">
                <div className="text-xl mb-1">{pillar.icon}</div>
                <h4 className="font-bold text-black uppercase tracking-wider mb-1">{pillar.title}</h4>
                <p className="text-[11px] text-black/60 leading-normal">{pillar.desc}</p>
              </div>
            ))}
          </div>

          <div className="bg-stone-900 text-white p-5 rounded-xs flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="font-bold uppercase tracking-wider text-sm">Experience {brandName}</p>
              <p className="text-white/60 text-[11px]">{getShippingConfig(tenant).summary}.</p>
            </div>
            <button
              onClick={() => {
                onClose()
                onShopClick()
              }}
              className="bg-white text-black font-bold text-xs tracking-widest uppercase px-6 py-3 hover:bg-stone-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              EXPLORE COLLECTIONS →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// 15e. CONTACT & CARE MODAL
function ContactModal({
  isOpen,
  onClose,
  onSuccessMessage,
  tenant,
  user,
  initialSubject,
}: {
  isOpen: boolean
  onClose: () => void
  onSuccessMessage: (msg: string) => void
  tenant?: TenantConfig
  user?: UserAccount | null
  initialSubject?: string
}) {
  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [subject, setSubject] = useState(initialSubject || 'Order Tracking Inquiry')
  const [message, setMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)

  if (!isOpen) return null

  const brandName = tenant?.brandName || tenant?.name || 'The Lunar Clothing'
  const isTemplate = isTemplateStore(tenant)
  const copy = getStorefrontCopy(tenant)
  const contactPhone = tenant?.contact?.phone || (isTemplate ? tenant?.ownerPhone : '') || '+91 98765 43210'
  const contactEmail = tenant?.contact?.email || (isTemplate ? tenant?.ownerEmail : '') || 'care@thelunarclothing.com'
  const contactAddress = tenant?.contact?.address || (isTemplate ? 'India' : 'Studio: Jubilee Hills, Hyderabad & Jaipur')
  const workingHours = tenant?.contact?.workingHours || 'Mon–Sat: 10AM – 7PM IST'
  const cleanPhone = contactPhone.replace(/[^0-9]/g, '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    storeInbox.addMessage(tenant || 'lunar', {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      subject,
      message: message.trim(),
    })
    setSubmitted(true)
    onSuccessMessage(`Thank you! Your message has been sent to ${brandName} Customer Care.`)
    setTimeout(() => {
      setSubmitted(false)
      onClose()
    }, 1800)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white max-w-xl w-full border border-black/10 shadow-2xl rounded-sm overflow-hidden animate-slide-down my-8">
        <div className="bg-black text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo tenant={tenant} className="h-9 w-auto" />
            <div>
              <p className="text-[10px] font-mono tracking-[0.25em] text-white/60 uppercase">{brandName}</p>
              <h2 className="text-lg font-serif">Contact Customer Care</h2>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl cursor-pointer">
            ✕
          </button>
        </div>

        <div className="p-6 md:p-8 space-y-6 text-xs">
          {/* Direct channels */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Hello ${brandName}, I have an inquiry regarding my order.`)}`}
              target="_blank"
              rel="noreferrer"
              className="border border-emerald-300 bg-emerald-50/70 p-3.5 flex items-center gap-3 hover:bg-emerald-100 transition-colors cursor-pointer group"
            >
              <span className="text-2xl">💬</span>
              <div>
                <p className="font-bold text-emerald-950 uppercase tracking-wider text-[11px]">Instant WhatsApp</p>
                <p className="text-emerald-800 text-[11px] font-mono font-semibold">{contactPhone}</p>
              </div>
            </a>

            <div className="border border-black/10 bg-stone-50 p-3.5 flex items-center gap-3">
              <span className="text-2xl">✉</span>
              <div>
                <p className="font-bold text-black uppercase tracking-wider text-[11px]">Email Support</p>
                <p className="text-black/70 text-[11px] font-mono">{contactEmail}</p>
              </div>
            </div>
          </div>

          <div className="bg-stone-50 border border-black/10 p-3 text-[11px] text-black/70 flex justify-between items-center">
            <span>📍 {contactAddress}</span>
            <span className="font-semibold text-black">{workingHours}</span>
          </div>

          {/* Form */}
          {submitted ? (
            <div className="text-center py-8 bg-emerald-50 border border-emerald-200 p-6">
              <span className="text-3xl">✓</span>
              <h4 className="text-base font-bold text-emerald-950 mt-2">Message Sent Successfully!</h4>
              <p className="text-emerald-800 text-[11px] mt-1">Our support executive at {brandName} will get back to you shortly.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <h4 className="font-bold uppercase tracking-wider text-black border-b border-black/10 pb-2">
                Send Us a Note
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-black/60 font-semibold mb-1">Your Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full border border-black/20 p-2.5 outline-none focus:border-black text-xs"
                  />
                </div>
                <div>
                  <label className="block text-black/60 font-semibold mb-1">Phone / WhatsApp Number</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full border border-black/20 p-2.5 outline-none focus:border-black text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-black/60 font-semibold mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border border-black/20 p-2.5 outline-none focus:border-black text-xs"
                />
              </div>

              <div>
                <label className="block text-black/60 font-semibold mb-1">Subject</label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full border border-black/20 p-2.5 outline-none focus:border-black text-xs bg-white cursor-pointer"
                >
                  {copy.contactSubjects.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-black/60 font-semibold mb-1">Your Message *</label>
                <textarea
                  required
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="How can we assist you today?"
                  className="w-full border border-black/20 p-2.5 outline-none focus:border-black text-xs"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-black text-white font-bold text-xs tracking-[0.2em] uppercase py-3.5 hover:bg-stone-800 transition-colors cursor-pointer shadow-md"
              >
                SEND MESSAGE →
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// 16. SEARCH OVERLAY DRAWER
function SearchOverlay({
  isOpen,
  onClose,
  onSelectProduct,
  products = PRODUCTS,
  tenant,
}: {
  isOpen: boolean
  onClose: () => void
  onSelectProduct: (id: number) => void
  products?: Product[]
  tenant?: TenantConfig
}) {
  const [query, setQuery] = useState('')

  if (!isOpen) return null

  const results = products.filter(
    (p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.category.toLowerCase().includes(query.toLowerCase()) ||
      getCategoryLabel(tenant, p.category).toLowerCase().includes(query.toLowerCase()) ||
      p.fabricTech.toLowerCase().includes(query.toLowerCase()) ||
      p.sculptLevel.toLowerCase().includes(query.toLowerCase())
  )

  const brandName = tenant?.brandName || tenant?.name || 'Our'
  const searchHint = getStorefrontCopy(tenant).searchHint

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in flex flex-col items-center pt-20 px-6">
      <div className="max-w-2xl w-full bg-white shadow-2xl border border-black/10 p-6 animate-slide-down">
        <div className="flex items-center justify-between border-b border-black/20 pb-4 mb-6">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${brandName} ${searchHint}...`}
            className="w-full text-lg font-serif text-black outline-none bg-transparent placeholder-black/30"
            autoFocus
          />
          <button onClick={onClose} className="text-black/50 hover:text-black text-xl ml-4 cursor-pointer">
            ✕
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto space-y-4">
          {query.trim() === '' ? (
            <p className="text-xs text-black/40 uppercase tracking-widest text-center py-6">
              Type to search {searchHint} in {brandName}...
            </p>
          ) : results.length === 0 ? (
            <p className="text-xs text-black/50 text-center py-6">No products found matching "{query}"</p>
          ) : (
            results.map((p) => (
              <div
                key={p.id}
                onClick={() => {
                  onSelectProduct(p.id)
                  onClose()
                }}
                className="flex items-center gap-4 p-2 hover:bg-stone-50 cursor-pointer transition-colors border-b border-black/5"
              >
                <img src={p.imgMain} alt={p.name} className="w-14 h-16 object-cover bg-stone-100" />
                <div>
                  <h4 className="font-bold text-sm text-black">{p.name}</h4>
                  <p className="text-xs text-black/50">{[p.sculptLevel, p.priceFormatted].filter(Boolean).join(' · ')}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// 17. CATALOG VIEW PAGE WITH SORTING CONTROLS
function CatalogPage({
  categoryFilter,
  wishlist,
  products = PRODUCTS,
  tenant,
  onToggleWishlist,
  onSelectProduct,
}: {
  categoryFilter: string
  wishlist: number[]
  products?: Product[]
  tenant?: TenantConfig
  onToggleWishlist: (id: number) => void
  onSelectProduct: (id: number) => void
}) {
  const [activeFilter, setActiveFilter] = useState(categoryFilter || 'all')
  const [sortBy, setSortBy] = useState<'featured' | 'price-low' | 'price-high' | 'rating'>('featured')

  useEffect(() => {
    setActiveFilter(categoryFilter || 'all')
  }, [categoryFilter])

  const filteredProducts = useMemo(() => {
    let list = activeFilter === 'all' ? [...products] : products.filter((p) => p.category === activeFilter)

    if (sortBy === 'price-low') {
      list.sort((a, b) => a.price - b.price)
    } else if (sortBy === 'price-high') {
      list.sort((a, b) => b.price - a.price)
    } else if (sortBy === 'rating') {
      list.sort((a, b) => b.rating - a.rating)
    }

    return list
  }, [activeFilter, sortBy, products])

  const categories = useMemo(
    () => [{ slug: 'all', name: 'ALL PRODUCTS' }, ...getStoreCategories(tenant, products)],
    [tenant, products]
  )

  const copy = getStorefrontCopy(tenant)
  const brandName = tenant?.brandName || tenant?.name || 'THE LUNAR CLOTHING'
  const brandTagline = tenant?.tagline || copy.catalogTagline

  return (
    <div className="py-12 bg-white min-h-screen">
      <div className="max-w-screen-2xl mx-auto px-6">
        <div className="mb-10 text-center max-w-2xl mx-auto">
          <p className="text-xs font-bold tracking-[0.3em] uppercase text-black/40 mb-2">{brandName} COLLECTION</p>
          <h1 className="text-4xl md:text-5xl font-serif text-black mb-4">{brandTagline}</h1>
          <p className="text-sm text-black/60 leading-relaxed">
            {tenant?.aboutStory || copy.catalogIntro}
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center justify-center gap-3 mb-8 flex-wrap text-xs font-bold tracking-widest uppercase">
          {categories.map((cat) => (
            <button
              key={cat.slug}
              onClick={() => setActiveFilter(cat.slug)}
              className={`px-5 py-2.5 border transition-all cursor-pointer ${
                activeFilter === cat.slug ? 'bg-black text-white border-black shadow-md' : 'bg-white text-black border-black/20 hover:border-black'
              }`}
            >
              {cat.name.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Sorting & Filter Header Bar */}
        <div className="flex items-center justify-between border-b border-black/10 pb-4 mb-8 text-xs font-semibold uppercase tracking-wider text-black/70">
          <div>
            Showing <span className="font-bold text-black">{filteredProducts.length}</span> {filteredProducts.length === 1 ? 'Product' : 'Products'}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-black/50">Sort By:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-stone-50 border border-black/20 px-3 py-1.5 font-bold outline-none cursor-pointer"
            >
              <option value="featured">Featured Picks</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="rating">Top Rated</option>
            </select>
          </div>
        </div>

        {filteredProducts.length === 0 && (
          <div className="border border-dashed border-black/15 py-20 px-6 text-center">
            <p className="text-3xl mb-3">🛍️</p>
            <h3 className="text-2xl font-serif text-black mb-2">
              {products.length === 0 ? copy.comingSoonTitle : 'Nothing here yet'}
            </h3>
            <p className="text-sm text-black/55 max-w-md mx-auto">
              {products.length === 0 ? copy.comingSoonBody : 'New products for this category are on the way.'}
            </p>
          </div>
        )}

        {/* Product Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
          {filteredProducts.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              isWishlisted={wishlist.includes(p.id)}
              onToggleWishlist={onToggleWishlist}
              onSelectProduct={onSelectProduct}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

type StoreInfoTopic = 'shipping' | 'returns' | 'faq' | 'care' | 'size' | 'gifts'

function StoreInfoModal({
  tenant,
  topic,
  onClose,
  onOpenContact,
}: {
  tenant?: TenantConfig
  topic: StoreInfoTopic | null
  onClose: () => void
  onOpenContact: () => void
}) {
  if (!topic) return null
  const brandName = tenant?.brandName || tenant?.name || 'The Lunar Clothing'
  const isTemplate = isTemplateStore(tenant)
  const shipping = getShippingConfig(tenant)
  const symbol = tenant?.currencySymbol || '₹'
  const returnWindow = isTemplate ? '7 days' : '30 days'
  const supportEmail = tenant?.contact?.email || tenant?.ownerEmail || 'care@thelunarclothing.com'
  const supportPhone = tenant?.contact?.phone || tenant?.ownerPhone || '+91 98765 43210'
  const hours = tenant?.contact?.workingHours || 'Mon–Sat: 10AM – 7PM IST'
  const shippingLine =
    shipping.fee <= 0
      ? 'Shipping is free on every order.'
      : `Orders above ${symbol}${shipping.threshold.toLocaleString('en-IN')} ship free. Below that, a flat ${symbol}${shipping.fee} delivery fee applies.`

  const content: Record<StoreInfoTopic, { title: string; items: { q: string; a: string }[] }> = {
    shipping: {
      title: 'Shipping & Delivery',
      items: [
        { q: 'Delivery charges', a: shippingLine },
        { q: 'Delivery time', a: 'Orders are dispatched within 1–2 business days and usually arrive in 3–5 business days across India.' },
        { q: 'Tracking', a: 'You will get a courier name and AWB number once your order ships. Track it any time from “My Account”.' },
        { q: 'Cash on Delivery', a: 'COD is available on most pin codes, along with UPI, cards and net banking.' },
      ],
    },
    returns: {
      title: 'Returns & Exchanges',
      items: [
        { q: 'Return window', a: `You can request a return or exchange within ${returnWindow} of delivery.` },
        { q: 'Condition', a: 'Items must be unused, with original tags and packaging.' },
        { q: 'How to request', a: `Contact us with your order ID at ${supportEmail} or on WhatsApp at ${supportPhone}.` },
        { q: 'Refunds', a: 'Refunds are issued to the original payment method within 5–7 business days after we receive the item. COD orders are refunded by bank transfer or UPI.' },
      ],
    },
    faq: {
      title: 'Frequently Asked Questions',
      items: [
        { q: 'How do I track my order?', a: 'Sign in and open “My Account”, or use the Direct AWB Tracker with your order ID.' },
        { q: 'Which payment methods do you accept?', a: 'UPI (GPay, PhonePe, Paytm), debit/credit cards, net banking and Cash on Delivery.' },
        { q: 'How much is shipping?', a: shippingLine },
        { q: 'Can I return an item?', a: `Yes — within ${returnWindow} of delivery. See Returns & Exchanges for details.` },
        { q: 'How do I reach you?', a: `Email ${supportEmail} or WhatsApp ${supportPhone} (${hours}).` },
      ],
    },
    care: {
      title: 'Fabric Care Guide',
      items: [
        { q: 'Washing', a: 'Hand wash or gentle machine wash in cold water. Wash block prints and dark colours separately for the first few washes.' },
        { q: 'Drying', a: 'Dry in shade, inside out, to keep colours rich. Avoid tumble drying.' },
        { q: 'Ironing', a: 'Iron on medium heat while slightly damp. Use a press cloth over prints and embellishments.' },
        { q: 'Storage', a: 'Fold and store in a cool, dry place. Use muslin bags for silks and handlooms.' },
      ],
    },
    size: {
      title: 'Size Guide & Custom Lengths',
      items: [
        { q: 'Finding your size', a: 'Open any product and tap “Size Guide & Measurements” for bust, waist and length charts.' },
        { q: 'Custom lengths', a: 'Most maxis come in 44" standard length with 46", 48" and 50" options available on the product page.' },
        { q: 'Between sizes?', a: 'Our silhouettes have adjustable side ropes — we recommend your usual size, or one size up for a relaxed fit.' },
        { q: 'Need help?', a: `Message us on WhatsApp at ${supportPhone} with your measurements and we will suggest a size.` },
      ],
    },
    gifts: {
      title: 'Gift Cards',
      items: [
        { q: 'Availability', a: `Digital ${brandName} gift cards are coming soon.` },
        { q: 'Gifting today', a: `For gift orders or bulk gifting, contact us at ${supportEmail} and we will help you put it together.` },
      ],
    },
  }
  const section = content[topic]

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={section.title}
        onClick={(e) => e.stopPropagation()}
        className="bg-white max-w-lg w-full border border-black/10 shadow-2xl rounded-sm overflow-hidden animate-slide-down my-8"
      >
        <div className="bg-black text-white p-6 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono tracking-[0.25em] text-white/60 uppercase">{brandName}</p>
            <h2 className="text-lg font-serif">{section.title}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-white/70 hover:text-white text-xl cursor-pointer">
            ✕
          </button>
        </div>
        <div className="p-6 space-y-5 text-xs">
          {section.items.map((item) => (
            <div key={item.q}>
              <p className="font-bold uppercase tracking-wider text-black mb-1">{item.q}</p>
              <p className="text-black/65 leading-relaxed">{item.a}</p>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              onClose()
              onOpenContact()
            }}
            className="w-full bg-black text-white font-bold text-xs tracking-[0.2em] uppercase py-3.5 hover:bg-stone-800 cursor-pointer"
          >
            Still have questions? Contact us →
          </button>
        </div>
      </div>
    </div>
  )
}

const FOOTER_LINK_ACTIONS: Record<string, { type: 'info'; topic: StoreInfoTopic } | { type: 'catalog' | 'about' | 'contact' }> = {
  'Shipping & Delivery': { type: 'info', topic: 'shipping' },
  'Returns & Exchanges': { type: 'info', topic: 'returns' },
  FAQs: { type: 'info', topic: 'faq' },
  'Fabric Care Guide': { type: 'info', topic: 'care' },
  'Size Guide & Custom Lengths': { type: 'info', topic: 'size' },
  'Gift Cards': { type: 'info', topic: 'gifts' },
  'Contact & Support': { type: 'contact' },
  'About Us': { type: 'about' },
  'About Our Studio': { type: 'about' },
  'Artisan Heritage': { type: 'about' },
}

// 18. FOOTER COMPONENT
function Footer({
  tenant,
  onOpenLogin,
  onOpenComplianceDoc,
  onOpenInfo,
  onOpenAbout,
  onOpenContact,
  onBrowseCatalog,
  onSubscribe,
}: {
  tenant?: TenantConfig
  onOpenLogin?: () => void
  onOpenComplianceDoc?: (doc: ComplianceDocType) => void
  onOpenInfo: (topic: StoreInfoTopic) => void
  onOpenAbout: () => void
  onOpenContact: (subject?: string) => void
  onBrowseCatalog: (linkLabel: string) => void
  onSubscribe: (email: string) => boolean
}) {
  const [newsletterEmail, setNewsletterEmail] = useState('')
  const [newsletterStatus, setNewsletterStatus] = useState<'idle' | 'joined' | 'already'>('idle')
  const handleFooterLink = (label: string) => {
    const action = FOOTER_LINK_ACTIONS[label] || { type: 'catalog' as const }
    if (action.type === 'info') onOpenInfo(action.topic)
    else if (action.type === 'about') onOpenAbout()
    else if (action.type === 'contact') onOpenContact()
    else onBrowseCatalog(label)
  }
  const footerLinkClass = 'hover:text-white transition-colors cursor-pointer text-left'
  const brandName = tenant?.brandName || tenant?.name || 'THE LUNAR CLOTHING'
  const copy = getStorefrontCopy(tenant)
  const brandTagline = (tenant?.theme?.copy?.footerTagline?.trim() ? '' : tenant?.tagline) || copy.footerTagline
  const shippingText = getShippingConfig(tenant).summary
  const showTrustStrip = tenant?.theme?.footerOptions?.trustStrip ?? true
  const showNewsletter = tenant?.theme?.footerOptions?.newsletter ?? true
  const social = tenant?.theme?.socialLinks || {}
  const supportDigits = (tenant?.contact?.phone || '').replace(/[^0-9]/g, '')
  const socialLinks = [
    { label: 'IG', name: 'Instagram', href: social.instagram },
    { label: 'WA', name: 'WhatsApp', href: social.whatsapp || (supportDigits ? `https://wa.me/${supportDigits}` : '') },
    { label: 'PT', name: 'Pinterest', href: social.pinterest },
    { label: 'FB', name: 'Facebook', href: social.facebook },
  ]
  return (
    <footer className="text-white border-t border-white/10" style={{ background: 'linear-gradient(180deg, #0a0a0f 0%, #050508 100%)' }}>
      {/* Trust Strip */}
      {showTrustStrip && (
      <div className="border-b border-white/8 py-6">
        <div className="max-w-screen-2xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {copy.footerTrust.map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <span className="text-2xl mt-0.5">{item.icon}</span>
                <div>
                  <p className="text-xs font-bold text-white/90 uppercase tracking-wider">{item.title}</p>
                  <p className="text-[11px] text-white/45 mt-0.5">{item.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      <div className="max-w-screen-2xl mx-auto px-6 pt-14 pb-8">
        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 mb-14">
          {/* Brand Column */}
          <div className="md:col-span-4">
            <h3 className="font-serif text-2xl tracking-wider uppercase mb-3" style={{ fontFamily: 'var(--font-display)' }}>{brandName}</h3>
            <p className="text-xs text-white/50 leading-relaxed mb-6 max-w-xs">
              {brandTagline}
            </p>
            {/* Social Links */}
            <div className="flex gap-3">
              {socialLinks.filter((s) => s.href).map((s) => (
                <a
                  key={s.name}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  title={s.name} className="w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold text-white/60 hover:text-white transition-all hover:scale-105" style={{ border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)' }}>
                  {s.label}
                </a>
              ))}
            </div>
          </div>

          {/* Links Grid */}
          <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-8">
            <div>
              <h4 className="text-[10px] font-bold tracking-[0.25em] uppercase text-white/30 mb-5">CUSTOMER CARE</h4>
              <ul className="space-y-3 text-xs text-white/60">
                {!isTemplateStore(tenant) && (
                  <li><button type="button" onClick={() => onOpenInfo('shipping')} className={footerLinkClass}>{shippingText}</button></li>
                )}
                {copy.footerCareLinks.map((link) => (
                  <li key={link}><button type="button" onClick={() => handleFooterLink(link)} className={footerLinkClass}>{link}</button></li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-[10px] font-bold tracking-[0.25em] uppercase text-white/30 mb-5">{copy.footerExploreTitle}</h4>
              <ul className="space-y-3 text-xs text-white/60">
                {copy.footerExploreLinks.map((link) => (
                  <li key={link}><button type="button" onClick={() => handleFooterLink(link)} className={footerLinkClass}>{link}</button></li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="text-[10px] font-bold tracking-[0.25em] uppercase text-white/30 mb-5">PORTAL ACCESS</h4>
              <ul className="space-y-3 text-xs">
                <li>
                  <button onClick={onOpenLogin} className="flex items-center gap-2 text-stone-300 hover:text-white font-medium transition-colors cursor-pointer">
                    <span>🔐</span><span>Customer Sign In</span>
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenContact(
                        copy.contactSubjects.find((s) => /collab|bulk|wholesale/i.test(s.value))?.value ||
                          copy.contactSubjects[0]?.value,
                      )
                    }
                    className={`text-white/60 ${footerLinkClass}`}
                  >
                    Brand Partnerships
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Newsletter Strip */}
        {showNewsletter && (
        <div className="border border-white/10 p-6 mb-10 flex flex-col md:flex-row items-center justify-between gap-6" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <div>
            <p className="text-sm font-bold text-white uppercase tracking-wider">{copy.newsletterTitle}</p>
            <p className="text-xs text-white/50 mt-1">{copy.newsletterSub}</p>
          </div>
          <div className="flex-shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const added = onSubscribe(newsletterEmail.trim())
              setNewsletterStatus(added ? 'joined' : 'already')
              if (added) setNewsletterEmail('')
            }}
            className="flex gap-0 border border-white/20"
          >
            <input
              type="email"
              value={newsletterEmail}
              onChange={(e) => {
                setNewsletterEmail(e.target.value)
                setNewsletterStatus('idle')
              }}
              placeholder="YOUR EMAIL ADDRESS"
              aria-label="Newsletter email"
              className="bg-transparent text-xs w-56 px-4 py-3 outline-none text-white placeholder-white/30 font-mono tracking-wider"
              required
            />
            <button type="submit" className="text-[11px] font-bold uppercase tracking-widest text-black px-5 py-3 cursor-pointer transition-all hover:opacity-90" style={{ background: 'white' }}>
              JOIN →
            </button>
          </form>
          {newsletterStatus !== 'idle' && (
            <p className={`text-[11px] mt-2 ${newsletterStatus === 'joined' ? 'text-emerald-400' : 'text-amber-300'}`}>
              {newsletterStatus === 'joined' ? "✓ You're on the list — thanks for subscribing!" : 'This email is already subscribed.'}
            </p>
          )}
          </div>
        </div>
        )}

        {/* Compliance Links Strip & Bottom Bar */}
        <div className="border-t border-white/8 pt-8 space-y-6">
          {/* Exact OrvexaTech Compliance Links: GDPR · INDIA DPDP · EU AI ACT READY + Privacy · Cookies · Accessibility */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-white/40 mb-2">Compliance & Data Protection</p>
              {onOpenComplianceDoc ? (
                <ComplianceFooterLinks onOpenComplianceDoc={onOpenComplianceDoc} theme="dark" />
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-6 font-mono text-[11px] uppercase tracking-wider text-sky-400 underline decoration-dotted underline-offset-4">
                    <span>GDPR</span>
                    <span>INDIA DPDP</span>
                    <span>EU AI ACT READY</span>
                  </div>
                  <div className="flex items-center gap-6 text-xs text-sky-400/70">
                    <span>Privacy</span>
                    <span>Cookies</span>
                    <span>Accessibility</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 text-[10px] text-white/40 uppercase tracking-widest">
              <span>INDIA ({tenant?.currencySymbol || '₹'} {tenant?.currency || 'INR'})</span>
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Powered by Orvexa
              </span>
              {tenant?.slug && (
                <a href={storefrontUrl(tenant.slug, tenant.customDomainVerified ? tenant.customDomain : undefined)} className="text-white/40 hover:text-white font-mono normal-case tracking-normal">
                  {storefrontUrl(tenant.slug, tenant.customDomainVerified ? tenant.customDomain : undefined).replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>
          </div>

          <div className="border-t border-white/5 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] text-white/30 font-mono">
            <p>© {new Date().getFullYear()} {brandName}. All rights reserved.</p>
            <p>Enterprise Multi-Tenant Infrastructure • 100% Isolated Database Architecture</p>
          </div>
        </div>
      </div>
    </footer>
  )
}

// --- MAIN APP COMPONENT ---
/** Storefront components a store can replace from src/tenants/<slug>/components/. */
export type StorefrontSlotProps = {
  AnnouncementBar: ComponentProps<typeof AnnouncementBar>
  Navigation: ComponentProps<typeof Navigation>
  Hero: ComponentProps<typeof HeroSection>
  ProductCard: ComponentProps<typeof DefaultProductCard>
  Footer: ComponentProps<typeof Footer>
}

function renderSlot<K extends keyof StorefrontSlotProps>(
  storeModule: StoreModule | null,
  name: K,
  Default: ComponentType<StorefrontSlotProps[K]>,
  props: StorefrontSlotProps[K]
) {
  // The signature above is fully typed; JSX can't check spreads of a generic props type.
  const Custom = storeModule?.components?.[name] as ComponentType<Record<string, unknown>> | undefined
  const Built = Default as ComponentType<Record<string, unknown>>
  const p = props as Record<string, unknown>
  return Custom ? <Custom {...p} Default={Default} /> : <Built {...p} />
}

/** CSS variables for theme values the store fixes in code (scoped to the storefront root). */
function storeThemeStyle(storeModule: StoreModule | null): CSSProperties | undefined {
  const t = storeModule?.theme
  if (!t) return undefined
  const vars: Record<string, string> = {}
  if (t.primaryColor) vars['--brand-primary'] = t.primaryColor
  if (t.accentColor) vars['--brand-accent'] = t.accentColor
  if (t.backgroundColor) vars['--brand-bg'] = t.backgroundColor
  if (t.fontSans) vars['--brand-font-sans'] = t.fontSans
  if (t.fontDisplay) {
    vars['--brand-font-display'] = t.fontDisplay
    vars['--font-display'] = t.fontDisplay
  }
  return vars as CSSProperties
}

function sectionsAfter(storeModule: StoreModule | null, position: StoreSection['after']): StoreSection[] {
  return (storeModule?.sections || []).filter((s) => (s.after || 'end') === position)
}

export default function App() {
  const layer = useApplicationLayer()
  const { tenant, loading: tenantLoading, error: tenantError } = useTenant()

  if (layer === 'admin') {
    return <AdminApp />
  }

  if (tenantLoading && !tenant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-black/20 border-t-black rounded-full animate-spin mx-auto mb-4" />
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-black/40">Loading store...</p>
        </div>
      </div>
    )
  }

  if (!tenant) {
    if (layer === 'dashboard') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-stone-50">
          <div className="text-center max-w-md px-6">
            <p className="text-xs font-bold tracking-[0.2em] uppercase text-black/40 mb-3">Seller portal</p>
            <p className="text-sm text-black/60">Could not refresh the store just now. The API may still be waking up.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 inline-block bg-black text-white text-xs font-bold tracking-widest uppercase px-6 py-3"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return <StoreNotFound slug={tenantError?.match(/"([^"]+)"/)?.[1]} />
  }

  if (layer === 'dashboard') {
    return <DashboardApp />
  }

  const baseTenant: TenantConfig = tenant
  // Per-store frontend from src/tenants/<slug>/ (theme values, components, sections, CSS)
  const { module: storeModule, ready: storeReady } = useStoreModule(baseTenant.slug)
  const activeTenant = useMemo(() => applyStoreTheme(baseTenant, storeModule), [baseTenant, storeModule])
  const [tenantProducts, setTenantProducts] = useState<Product[]>(() => (DEMO_MODE ? mockStore.getProducts(activeTenant.id) : []))
  const [tenantReviews, setTenantReviews] = useState<Review[]>(() => (DEMO_MODE ? mockStore.getReviews(activeTenant.id) : []))
  const [tenantOrders, setTenantOrders] = useState<TrackedOrder[]>(() => (DEMO_MODE ? mockStore.getOrders(activeTenant.id) : []))

  useEffect(() => {
    if (DEMO_MODE) {
      setTenantProducts(mockStore.getProducts(activeTenant.id))
      setTenantReviews(mockStore.getReviews(activeTenant.id))
      setTenantOrders(mockStore.getOrders(activeTenant.id))
    }
    apiClient.getProducts(activeTenant.slug).then((list) => {
      if (Array.isArray(list) && (list.length || !DEMO_MODE)) setTenantProducts(list)
    }).catch(() => undefined)
    apiClient.getReviews(activeTenant.slug).then((list) => {
      if (Array.isArray(list) && (list.length || !DEMO_MODE)) setTenantReviews(list)
    }).catch(() => undefined)
  }, [activeTenant.id, activeTenant.slug])

  const [showAnnouncement, setShowAnnouncement] = useState(true)
  const [view, setView] = useState<'home' | 'catalog' | 'pdp'>('home')

  useEffect(() => {
    trackStorefrontEvent(activeTenant.slug, 'page_view', `/${view}`)
  }, [activeTenant.slug, view])
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null)
  
  // User Authentication & Order Tracking State
  const [user, setUser] = useState<UserAccount | null>(() => shopperAccounts.getSession(activeTenant.id))
  const [orders, setOrders] = useState<TrackedOrder[]>(tenantOrders)
  const myOrders = useMemo(() => {
    if (!user) return []
    const email = user.email.toLowerCase()
    const isDemoShopper = !isTemplateStore(activeTenant) && email === DEMO_SHOPPER.email
    return orders.filter((o) => (o.customerEmail ? o.customerEmail.toLowerCase() === email : isDemoShopper))
  }, [orders, user, activeTenant])
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [isAccountOpen, setIsAccountOpen] = useState(false)
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  const [isContactOpen, setIsContactOpen] = useState(false)
  const [contactSubject, setContactSubject] = useState<string | undefined>(undefined)
  const [infoTopic, setInfoTopic] = useState<StoreInfoTopic | null>(null)
  const [isComplianceOpen, setIsComplianceOpen] = useState(false)
  const [complianceDoc, setComplianceDoc] = useState<ComplianceDocType>('gdpr')
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // URL Reset Token Detection for Store Owners
  const [resetToken, setResetToken] = useState<string | null>(null)
  const [resetSlug, setResetSlug] = useState<string | null>(null)
  const [isResetOpen, setIsResetOpen] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('reset_token')
    const slug = params.get('slug')
    if (token) {
      setResetToken(token)
      setResetSlug(slug || activeTenant.slug)
      setIsResetOpen(true)
    }
  }, [activeTenant.slug])

  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isWishlistOpen, setIsWishlistOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  // Escape dismisses informational overlays; forms (checkout, sign-in, contact) stay open to avoid losing input.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (infoTopic) setInfoTopic(null)
      else if (isComplianceOpen) setIsComplianceOpen(false)
      else if (isAboutOpen) setIsAboutOpen(false)
      else if (isSearchOpen) setIsSearchOpen(false)
      else if (isAccountOpen) setIsAccountOpen(false)
      else if (isWishlistOpen) setIsWishlistOpen(false)
      else if (isCartOpen) setIsCartOpen(false)
      else if (isMobileMenuOpen) setIsMobileMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [infoTopic, isComplianceOpen, isAboutOpen, isSearchOpen, isAccountOpen, isWishlistOpen, isCartOpen, isMobileMenuOpen])

  // Demo stores open with a pre-filled bag & wishlist; newly cloned stores start empty
  const buildDemoCart = (): CartItem[] =>
    DEMO_MODE && !isTemplateStore(activeTenant) && tenantProducts.length > 0
      ? [
          {
            product: tenantProducts[0],
            selectedColor: tenantProducts[0].colors[0],
            selectedSize: 'M',
            selectedLining: 'No Lining',
            selectedZip: 'None',
            selectedLength: '44 inch',
            quantity: 1,
          },
        ]
      : []
  const buildDemoWishlist = (): number[] =>
    DEMO_MODE && !isTemplateStore(activeTenant) && tenantProducts.length > 0
      ? [tenantProducts[0].id, tenantProducts[1]?.id || tenantProducts[0].id]
      : []

  const [wishlist, setWishlist] = useState<number[]>(buildDemoWishlist)
  const [reviews, setReviews] = useState<Review[]>(tenantReviews)
  const [cart, setCart] = useState<CartItem[]>(buildDemoCart)
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null)

  // Sync state when active tenant changes
  useEffect(() => {
    setUser(shopperAccounts.getSession(activeTenant.id))
    setOrders(tenantOrders)
    setReviews(tenantReviews)
    setCart(buildDemoCart())
    setWishlist(buildDemoWishlist())
    setAppliedPromo(null)
  }, [activeTenant.id])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 4000)
  }

  const handleLoginSuccess = (loggedInUser: UserAccount, isNew?: boolean) => {
    setUser(loggedInUser)
    shopperAccounts.setSession(activeTenant.id, loggedInUser)
    trackStorefrontEvent(activeTenant.slug, isNew ? 'shopper_register' : 'shopper_signin')
    if (isNew && loggedInUser.email) storeInbox.subscribe(activeTenant, loggedInUser.email, 'account')
    showToast(isNew ? `Account created! Email verified for ${loggedInUser.name}.` : `Welcome back, ${loggedInUser.name}!`)
    setIsAccountOpen(true)
  }

  const handleSignOut = () => {
    setUser(null)
    shopperAccounts.setSession(activeTenant.id, null)
    setIsAccountOpen(false)
    showToast('Signed out successfully.')
  }

  const handleOrderPlaced = (placedOrder: TrackedOrder, customerEmail?: string) => {
    const email = (user?.email || customerEmail || '').trim().toLowerCase()
    const newOrder: TrackedOrder = email ? { ...placedOrder, customerEmail: email } : placedOrder
    setOrders((prev) => [newOrder, ...prev])
    if (email) storeInbox.subscribe(activeTenant, email, 'checkout')
    if (DEMO_MODE) mockStore.placeOrder(activeTenant.id, newOrder, customerEmail || user?.email)
    
    // Log audit trail event
    auditLogger.log({
      tenantSlug: activeTenant.slug,
      tenantName: activeTenant.brandName || activeTenant.name,
      actorId: user?.email || 'customer_guest',
      actorName: newOrder.shippingAddress?.name || 'Shopper',
      actorRole: 'seller',
      action: 'ORDER_PLACED',
      category: 'orders',
      severity: 'info',
      details: `New order #${newOrder.id} placed for ${newOrder.items?.length || 1} items (Total: ₹${newOrder.total}). Payment: ${newOrder.paymentMethod}.`,
      metadata: { orderId: newOrder.id, total: newOrder.total, itemsCount: newOrder.items?.length },
    })

    if (!user) {
      setUser({
        name: newOrder.shippingAddress.name,
        email: 'priya.sharma@example.com',
        phone: newOrder.shippingAddress.phone,
        verified: true,
      })
    }
    showToast(`Order ${newOrder.id} confirmed! Tracking is now active.`)
  }

  const handleToggleWishlist = (id: number) => {
    setWishlist((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const handleSelectProduct = (id: number) => {
    setSelectedProductId(id)
    setView('pdp')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleNavigate = (newView: 'home' | 'catalog', category: string = 'all') => {
    setCategoryFilter(category)
    setView(newView)
    setSelectedProductId(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleAddToCart = (
    product: Product,
    selectedColor: { name: string; hex: string },
    selectedSize: string,
    selectedLining: string,
    selectedZip: string,
    selectedLength: string,
    quantity: number,
    totalUnitPrice: number
  ) => {
    const customizedProduct = {
      ...product,
      price: totalUnitPrice,
      priceFormatted: `${activeTenant.currencySymbol || '₹'}${totalUnitPrice.toLocaleString()}`,
    }

    setCart((prev) => {
      const existingIdx = prev.findIndex(
        (i) =>
          i.product.id === product.id &&
          i.selectedColor?.name === selectedColor?.name &&
          i.selectedSize === selectedSize &&
          i.selectedLining === selectedLining &&
          i.selectedZip === selectedZip &&
          i.selectedLength === selectedLength
      )
      if (existingIdx > -1) {
        return prev.map((item, i) => (i === existingIdx ? { ...item, quantity: item.quantity + quantity } : item))
      }
      return [
        ...prev,
        {
          product: customizedProduct,
          selectedColor,
          selectedSize,
          selectedLining,
          selectedZip,
          selectedLength,
          quantity,
        },
      ]
    })
    setIsCartOpen(true)
  }

  const handleUpdateQuantity = (index: number, delta: number) => {
    setCart((prev) => {
      const target = prev[index]
      if (!target) return prev
      const newQty = target.quantity + delta
      if (newQty <= 0) {
        return prev.filter((_, i) => i !== index)
      }
      return prev.map((item, i) => (i === index ? { ...item, quantity: newQty } : item))
    })
  }

  const handleRemoveItem = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSaveReview = (newReviewData: { author: string; rating: number; title: string; comment: string }) => {
    const productId = selectedProductId || tenantProducts[0]?.id || 1
    const productName = tenantProducts.find((p) => p.id === productId)?.name
    const isVerifiedBuyer = !!productName && myOrders.some((o) => o.items?.some((i) => i.name === productName))
    const newRev: Review = {
      id: Date.now(),
      productId,
      author: newReviewData.author,
      rating: newReviewData.rating,
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      title: newReviewData.title || 'Great Product!',
      comment: newReviewData.comment,
      verified: isVerifiedBuyer,
    }
    if (DEMO_MODE) {
      setReviews((prev) => [newRev, ...prev])
      mockStore.submitReview(activeTenant.id, newRev)
      showToast(isVerifiedBuyer ? 'Thank you! Your verified review has been published.' : 'Thank you! Your review has been published.')
      return
    }
    apiClient.postReview(activeTenant.slug, newRev).then((saved) => {
      if (!saved) {
        showToast('Could not publish the review.')
        return
      }
      setReviews((prev) => [saved, ...prev])
      showToast(isVerifiedBuyer ? 'Thank you! Your verified review has been published.' : 'Thank you! Your review has been published.')
    })
  }

  const rawSubtotal = cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0)
  const selectedProduct = tenantProducts.find((p) => p.id === selectedProductId) || tenantProducts[0]

  // Avoid flashing the default storefront while this store's own frontend chunk loads.
  if (!storeReady) return <div className="min-h-screen" />

  const renderStoreSections = (position: StoreSection['after']) =>
    sectionsAfter(storeModule, position).map(({ id, Component }) => (
      <Component
        key={`store-section-${id}`}
        tenant={activeTenant}
        products={tenantProducts}
        onSelectProduct={handleSelectProduct}
        onNavigate={handleNavigate}
      />
    ))

  const renderBuiltInSection = (id: HomeSectionId) => {
    switch (id) {
      case 'trustBar':
        return <TrustBar tenant={activeTenant} />
      case 'bestsellers':
        return (
          <BestsellersSection
            tenant={activeTenant}
            products={tenantProducts}
            wishlist={wishlist}
            onToggleWishlist={handleToggleWishlist}
            onSelectProduct={handleSelectProduct}
            onViewAll={() => handleNavigate('catalog', 'all')}
          />
        )
      case 'categories':
        return (
          <ShopByCategorySection
            tenant={activeTenant}
            products={tenantProducts}
            onSelectCategory={(cat) => handleNavigate('catalog', cat)}
          />
        )
      case 'featured':
        return <LeggingsFabricMatrix tenant={activeTenant} products={tenantProducts} onSelectProduct={handleSelectProduct} />
      case 'triptych':
        return <ActivityTriptych tenant={activeTenant} products={tenantProducts} onSelectProduct={handleSelectProduct} />
      case 'mission':
        return <MissionBlock tenant={activeTenant} onShopClick={() => handleNavigate('catalog', 'all')} />
    }
  }

  return (
    <StoreModuleContext.Provider value={storeModule}>
    <div
      data-store={activeTenant.slug}
      style={storeThemeStyle(storeModule)}
      className="min-h-screen bg-stone-50/20 text-black font-sans antialiased relative selection:bg-rose-100 selection:text-black"
    >
      {/* Dynamic Ambient Background & Interactive Breeze Simulation */}
      {(activeTenant?.theme?.enableAnimations ?? true) && <InteractiveBackground />}

      {showAnnouncement &&
        renderSlot(storeModule, 'AnnouncementBar', AnnouncementBar, { tenant: activeTenant, onDismiss: () => setShowAnnouncement(false) })}

      {renderSlot(storeModule, 'Navigation', Navigation, {
        tenant: activeTenant,
        products: tenantProducts,
        cartCount: cart.reduce((sum, item) => sum + item.quantity, 0),
        wishlistCount: wishlist.length,
        user,
        onOpenCart: () => setIsCartOpen(true),
        onOpenWishlist: () => setIsWishlistOpen(true),
        onOpenSearch: () => setIsSearchOpen(true),
        onOpenMobileMenu: () => setIsMobileMenuOpen(true),
        onOpenAuth: () => setIsAuthOpen(true),
        onOpenAccount: () => setIsAccountOpen(true),
        onOpenAbout: () => setIsAboutOpen(true),
        onOpenContact: () => setIsContactOpen(true),
        onNavigate: handleNavigate,
        currentCategory: categoryFilter,
      })}

      <main>
        {view === 'home' && (
          <>
            {renderSlot(storeModule, 'Hero', HeroSection, { tenant: activeTenant, onShopClick: () => handleNavigate('catalog', 'all') })}
            {renderStoreSections('hero')}
            {getHomeSections(activeTenant).map((s) => (
              <Fragment key={s.id}>
                {s.visible && renderBuiltInSection(s.id)}
                {renderStoreSections(s.id)}
              </Fragment>
            ))}
            {renderStoreSections('end')}
          </>
        )}

        {view === 'catalog' && (
          <CatalogPage
            tenant={activeTenant}
            products={tenantProducts}
            categoryFilter={categoryFilter}
            wishlist={wishlist}
            onToggleWishlist={handleToggleWishlist}
            onSelectProduct={handleSelectProduct}
          />
        )}

        {view === 'pdp' && selectedProduct && (
          <ProductDetailPage
            key={selectedProduct.id}
            tenant={activeTenant}
            product={selectedProduct}
            products={tenantProducts}
            wishlist={wishlist}
            reviews={reviews}
            onToggleWishlist={handleToggleWishlist}
            onAddToCart={handleAddToCart}
            onBack={() => handleNavigate('catalog', 'all')}
            onSelectProduct={handleSelectProduct}
            onSaveReview={handleSaveReview}
          />
        )}
      </main>

      {renderSlot(storeModule, 'Footer', Footer, {
        tenant: activeTenant,
        onOpenLogin: () => setIsAuthOpen(true),
        onOpenComplianceDoc: (doc) => {
          setComplianceDoc(doc)
          setIsComplianceOpen(true)
        },
        onOpenInfo: setInfoTopic,
        onOpenAbout: () => setIsAboutOpen(true),
        onOpenContact: (subject) => {
          setContactSubject(subject)
          setIsContactOpen(true)
        },
        onBrowseCatalog: (label) => {
          const keywords = label.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
          const match = getStoreCategories(activeTenant, tenantProducts).find((c) =>
            keywords.some((w) => c.name.toLowerCase().includes(w)),
          )
          handleNavigate('catalog', match?.slug || 'all')
        },
        onSubscribe: (email) => storeInbox.subscribe(activeTenant, email, 'newsletter'),
      })}

      <StoreInfoModal
        tenant={activeTenant}
        topic={infoTopic}
        onClose={() => setInfoTopic(null)}
        onOpenContact={() => {
          setContactSubject(undefined)
          setIsContactOpen(true)
        }}
      />

      {/* Mobile Drawer Navigation */}
      <MobileMenuDrawer
        tenant={activeTenant}
        products={tenantProducts}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        onNavigate={handleNavigate}
        onOpenWishlist={() => setIsWishlistOpen(true)}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenAccount={() => setIsAccountOpen(true)}
        onOpenAbout={() => setIsAboutOpen(true)}
        onOpenContact={() => setIsContactOpen(true)}
        user={user}
        wishlistCount={wishlist.length}
      />

      {/* Wishlist Slide-over Drawer */}
      <WishlistDrawer
        tenant={activeTenant}
        products={tenantProducts}
        isOpen={isWishlistOpen}
        onClose={() => setIsWishlistOpen(false)}
        wishlistIds={wishlist}
        onRemoveWishlist={handleToggleWishlist}
        onSelectProduct={handleSelectProduct}
      />

      {/* Slide-over Shopping Bag */}
      <CartDrawer
        tenant={activeTenant}
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        appliedPromo={appliedPromo}
        onApplyPromo={setAppliedPromo}
        onUpdateQuantity={handleUpdateQuantity}
        onRemoveItem={handleRemoveItem}
        onStartCheckout={() => {
          setIsCartOpen(false)
          setIsCheckoutOpen(true)
        }}
      />

      {/* Checkout Modal */}
      <CheckoutModal
        key={isCheckoutOpen ? 'checkout-open' : 'checkout-closed'}
        tenant={activeTenant}
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        cart={cart}
        subtotal={rawSubtotal - getDiscountAmount(activeTenant, appliedPromo, rawSubtotal)}
        discountAmount={getDiscountAmount(activeTenant, appliedPromo, rawSubtotal)}
        user={user}
        onOrderPlaced={handleOrderPlaced}
        onOpenAccount={() => setIsAccountOpen(true)}
        discountCode={appliedPromo}
        onCompleteOrder={() => {
          setCart([])
          setAppliedPromo(null)
          setIsCheckoutOpen(false)
        }}
      />

      {/* Customer authentication modal */}
      <AuthModal
        key={isAuthOpen ? 'auth-open' : 'auth-closed'}
        tenant={activeTenant}
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Account & Real-Time Order Tracking Drawer */}
      <AccountDrawer
        key={isAccountOpen ? 'account-open' : 'account-closed'}
        tenant={activeTenant}
        isOpen={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
        user={user}
        orders={myOrders}
        lookupOrders={orders}
        onSignOut={handleSignOut}
        onSelectProduct={handleSelectProduct}
      />

      {/* About Brand Modal */}
      <AboutModal
        tenant={activeTenant}
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
        onShopClick={() => {
          setIsAboutOpen(false)
          handleNavigate('catalog', 'all')
        }}
      />

      {/* Contact Customer Care Modal */}
      <ContactModal
        key={isContactOpen ? 'contact-open' : 'contact-closed'}
        tenant={activeTenant}
        isOpen={isContactOpen}
        onClose={() => {
          setIsContactOpen(false)
          setContactSubject(undefined)
        }}
        onSuccessMessage={(msg) => showToast(msg)}
        user={user}
        initialSubject={contactSubject}
      />

      {/* Interactive Search Overlay */}
      <SearchOverlay
        key={isSearchOpen ? 'search-open' : 'search-closed'}
        tenant={activeTenant}
        products={tenantProducts}
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectProduct={handleSelectProduct}
      />

      {/* Floating Status Notification Toast */}
      {toastMessage && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] text-white px-6 py-3.5 text-xs font-bold tracking-wider uppercase flex items-center gap-3 animate-slide-up"
          style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '2px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
        >
          <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-black flex-shrink-0">✓</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* WhatsApp Floating Chat Widget */}
      <a
        href={`https://wa.me/${(activeTenant?.contact?.phone || activeTenant?.ownerPhone || '+919876543210').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hello ${activeTenant?.brandName || activeTenant?.name || 'The Lunar Clothing'}, I have an inquiry.`)}`}
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-24 right-5 z-40 w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl shadow-2xl transition-all hover:scale-110 active:scale-95 cursor-pointer animate-wa-bounce"
        style={{ background: 'linear-gradient(135deg, #25d366, #128c7e)', boxShadow: '0 4px 20px rgba(37,211,102,0.5)' }}
        title={`Chat with ${activeTenant?.brandName || activeTenant?.name || 'The Lunar Clothing'} on WhatsApp`}
        aria-label="Chat on WhatsApp"
      >
        <svg viewBox="0 0 32 32" className="w-7 h-7 fill-white">
          <path d="M16 0C7.163 0 0 7.163 0 16c0 2.821.737 5.47 2.025 7.771L0 32l8.431-2.013A15.93 15.93 0 0016 32c8.837 0 16-7.163 16-16S24.837 0 16 0zm0 29.333a13.3 13.3 0 01-6.807-1.868l-.488-.29-5.007 1.196 1.217-4.873-.318-.5A13.262 13.262 0 012.667 16C2.667 8.636 8.636 2.667 16 2.667S29.333 8.636 29.333 16 23.364 29.333 16 29.333zm7.275-9.982c-.399-.2-2.36-1.163-2.726-1.296-.366-.133-.633-.2-.9.2-.266.4-1.033 1.296-1.266 1.563-.233.266-.466.3-.866.1-.4-.2-1.688-.622-3.214-1.984-1.188-1.06-1.99-2.37-2.222-2.77-.233-.4-.025-.616.175-.816.18-.18.4-.466.6-.7.2-.233.266-.4.4-.666.133-.267.066-.5-.033-.7-.1-.2-.9-2.166-1.233-2.966-.325-.78-.656-.673-.9-.686l-.766-.013c-.267 0-.7.1-1.067.5-.366.4-1.4 1.366-1.4 3.332 0 1.966 1.433 3.865 1.633 4.132.2.267 2.82 4.3 6.832 6.032.955.412 1.7.66 2.282.845.959.305 1.832.262 2.522.159.77-.114 2.36-.964 2.694-1.896.332-.933.332-1.733.233-1.9-.1-.166-.366-.266-.765-.466z"/>
        </svg>
      </a>

      {/* Password Reset Modal (opened via email link or URL reset_token) */}
      <ResetPasswordModal
        isOpen={isResetOpen}
        resetToken={resetToken || undefined}
        tenantSlug={resetSlug || undefined}
        onClose={() => {
          setIsResetOpen(false)
          setResetToken(null)
          setResetSlug(null)
        }}
      />

      {/* Orvexa Tech Trust, GDPR, DPDP & Legal Compliance Modal */}
      <LegalComplianceModal
        isOpen={isComplianceOpen}
        initialTab={complianceDoc}
        onClose={() => setIsComplianceOpen(false)}
      />

      {/* Scroll to Top Button */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-7 right-5 z-40 w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-xl transition-all hover:scale-110 active:scale-90 cursor-pointer"
        style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}
        aria-label="Scroll to top"
        title="Scroll to top"
      >
        ↑
      </button>
    </div>
    </StoreModuleContext.Provider>
  )
}

