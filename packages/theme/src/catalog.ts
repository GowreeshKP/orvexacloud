import { z } from 'zod';

/**
 * The read-only catalogue snapshot OrvexaCloud supplies to the studio and the
 * storefront. Prices are integers in the smallest currency unit (paise for INR)
 * to avoid floating-point rounding.
 */
/**
 * OrvexaCloud currently stores product photos as base64 data URLs, so the
 * contract accepts them. Moving photos to object storage (R2) and sending
 * https URLs instead would cut product-list payloads by over 95%.
 */
const CatalogImage = z.object({
  url: z.string().max(3_000_000).refine((value) => /^(https:\/\/|\/|data:image\/(jpeg|png|webp|avif);base64,)/.test(value), 'Unsupported image URL.'),
  alt: z.string().max(300).default(''),
});

export const CatalogProduct = z.object({
  id: z.string().min(1).max(128),
  handle: z.string().regex(/^[a-z0-9][a-z0-9-]{0,150}$/),
  title: z.string().min(1).max(240),
  description: z.string().max(5000).default(''),
  priceMinor: z.number().int().nonnegative(),
  compareAtMinor: z.number().int().nonnegative().optional(),
  availability: z.enum(['in-stock', 'low-stock', 'out-of-stock', 'preorder']),
  images: z.array(CatalogImage).max(20).default([]),
  collectionIds: z.array(z.string().max(128)).max(50).default([]),
  variants: z.array(z.object({ id: z.string().max(128), title: z.string().max(120), available: z.boolean() })).max(100).default([]),
  featured: z.boolean().default(false),
  createdAt: z.string().max(40),
});

export const CatalogCollection = z.object({
  id: z.string().min(1).max(128),
  handle: z.string().regex(/^[a-z0-9][a-z0-9-]{0,150}$/),
  title: z.string().min(1).max(160),
  description: z.string().max(2000).default(''),
  image: CatalogImage.optional(),
});

export const Catalog = z.object({
  storeId: z.string().min(1).max(128),
  currency: z.string().length(3),
  products: z.array(CatalogProduct).max(5000),
  collections: z.array(CatalogCollection).max(500),
  sample: z.boolean().default(false),
});

export type Catalog = z.infer<typeof Catalog>;
export type CatalogProduct = z.infer<typeof CatalogProduct>;
export type CatalogCollection = z.infer<typeof CatalogCollection>;

export function formatPrice(minor: number, currency: string): string {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en', {
    style: 'currency',
    currency,
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}
