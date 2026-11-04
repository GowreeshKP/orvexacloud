import { Catalog } from './catalog';
import { slugify } from './orvexacloud';

const SAMPLES: Record<string, { collections: string[]; products: Array<[string, number, number]> }> = {
  'sarees-ethnic': { collections: ['Festive', 'Everyday', 'Wedding'], products: [['Ivory silk saree', 4890, 0], ['Rani pink drape', 3290, 1], ['Bottle green saree', 5450, 2], ['Mustard cotton saree', 1890, 1], ['Midnight blue drape', 6200, 0], ['Peach organza saree', 3750, 2]] },
  'handloom-textiles': { collections: ['Stoles', 'Fabric by the metre', 'Dupattas'], products: [['Indigo stole', 1450, 0], ['Natural cotton fabric', 690, 1], ['Striped dupatta', 1290, 2], ['Checked stole', 1590, 0], ['Undyed cotton fabric', 590, 1], ['Rust dupatta', 1390, 2]] },
  'block-print': { collections: ['Bedding', 'Table linen', 'Kurtas'], products: [['Floral bedsheet set', 2490, 0], ['Indigo table runner', 890, 1], ['Printed kurta', 1690, 2], ['Cushion cover pair', 990, 0], ['Napkin set of four', 690, 1], ['Long kurta dress', 2190, 2]] },
  fashion: { collections: ['Dresses', 'Tops', 'Trousers'], products: [['Wrap dress', 2490, 0], ['Boxy shirt', 1590, 1], ['Wide-leg trousers', 1990, 2], ['Slip dress', 2290, 0], ['Cropped jacket', 3290, 1], ['Pleated trousers', 2190, 2]] },
  jewellery: { collections: ['Earrings', 'Necklaces', 'Rings'], products: [['Drop earrings', 1890, 0], ['Layered necklace', 2790, 1], ['Stacking ring', 990, 2], ['Hoop earrings', 1490, 0], ['Pendant necklace', 2190, 1], ['Signet ring', 1690, 2]] },
  beauty: { collections: ['Face', 'Body', 'Hair'], products: [['Face wash', 449, 0], ['Body lotion', 599, 1], ['Hair oil', 399, 2], ['Face moisturiser', 699, 0], ['Body scrub', 549, 1], ['Shampoo bar', 349, 2]] },
  'baby-kids': { collections: ['0–12 months', '1–3 years', 'Toys'], products: [['Cotton romper', 799, 0], ['Play shorts set', 999, 1], ['Wooden stacker', 1199, 2], ['Swaddle wrap', 899, 0], ['Printed T-shirt', 599, 1], ['Soft ball set', 699, 2]] },
  'gifting-festive': { collections: ['For her', 'For him', 'Hampers'], products: [['Festive hamper', 2499, 2], ['Brass diya pair', 1299, 0], ['Gift box', 1899, 1], ['Scented candle', 899, 0], ['Sweet box', 1199, 2], ['Desk organiser', 1599, 1]] },
  'home-decor': { collections: ['Living room', 'Dining', 'Bedroom'], products: [['Ceramic vase', 1490, 0], ['Serving bowl', 1190, 1], ['Bedside lamp', 2890, 2], ['Wall mirror', 3490, 0], ['Dinner plate set', 2290, 1], ['Throw blanket', 1990, 2]] },
  pantry: { collections: ['Spices', 'Pickles', 'Snacks'], products: [['Garam masala, 100 g', 249, 0], ['Mango pickle, 300 g', 299, 1], ['Roasted makhana, 200 g', 349, 2], ['Sambar powder, 200 g', 199, 0], ['Lime pickle, 300 g', 279, 1], ['Banana chips, 250 g', 229, 2]] },
  wellness: { collections: ['Morning', 'Evening', 'Self-care'], products: [['Yoga mat', 1890, 0], ['Herbal tea, 50 g', 399, 1], ['Bath salts', 549, 2], ['Meditation cushion', 1690, 0], ['Journal', 599, 1], ['Massage oil', 699, 2]] },
  general: { collections: ['New in', 'Bestsellers', 'Essentials'], products: [['Canvas tote bag', 899, 0], ['Stoneware mug', 649, 1], ['Linen cushion cover', 1199, 2], ['Soy wax candle', 799, 0], ['Woven storage basket', 1499, 1], ['Brass bookmark set', 499, 2]] },
};

/** A clearly marked sample catalogue with neutral names and no photos or claims. */
export function sampleCatalog(storeId: string, nicheId: string): Catalog {
  const sample = SAMPLES[nicheId] ?? SAMPLES.general;
  const collections = sample.collections.map((title) => ({ id: slugify(title), handle: slugify(title), title, description: '' }));
  return Catalog.parse({
    storeId,
    currency: 'INR',
    sample: true,
    collections,
    products: sample.products.map(([title, rupees, collection], i) => ({
      id: `sample-${i + 1}`,
      handle: slugify(title),
      title,
      priceMinor: rupees * 100,
      availability: i === 3 ? 'low-stock' : 'in-stock',
      images: [],
      collectionIds: [collections[collection].id],
      variants: nicheId === 'fashion' || nicheId === 'sarees-ethnic' ? ['S', 'M', 'L'].map((s) => ({ id: `sample-${i + 1}-${s}`, title: s, available: s !== 'L' || i % 2 === 0 })) : [],
      featured: i < 4,
      createdAt: new Date(Date.UTC(2026, 9, 1 + i)).toISOString(),
    })),
  });
}
