// Storefront customisations for Silk Haus (src/tenants/silkhaus/).
// Everything in this folder applies to this store only. See README.md for the guide.

import { defineStore } from '@/tenants/store-module'
import theme from './theme'
import './styles.css'
// import Hero from './components/Hero'
// import PromoBanner from './sections/PromoBanner'

export default defineStore({
  theme,
  components: {
    // Hero,
  },
  sections: [
    // { id: 'promo-banner', after: 'hero', Component: PromoBanner },
  ],
})
