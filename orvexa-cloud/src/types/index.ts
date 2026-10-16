// --- Shared TypeScript Interfaces for Orvexa Cloud Platform ---

export interface Product {
  id: number
  name: string
  category: 'maxis' | 'dresses' | 'kalamkari' | 'handloom' | 'all'
  sculptLevel: string
  fabricTech: string
  fabricDesc: string
  compression: string
  price: number
  originalPrice?: number
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
