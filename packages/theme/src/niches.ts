export type Niche = {
  id: string;
  label: string;
  /** Facts the AI must never invent for this kind of store. */
  cautions: string;
  /** Stock-photo search used for new stores and the photo picker. */
  photoQuery: string;
};

export const NICHES: Niche[] = [
  { id: 'sarees-ethnic', label: 'Sarees and ethnic wear', cautions: 'Never invent fabric, weave, zari content, blouse inclusion or occasion claims.', photoQuery: 'silk saree' },
  { id: 'handloom-textiles', label: 'Handloom and textiles', cautions: 'Only name weaves, techniques, regions or artisan communities the merchant supplied.', photoQuery: 'handloom weaving textile' },
  { id: 'block-print', label: 'Block prints and artisan', cautions: 'Do not call products handmade, hand-block-printed or natural-dyed without merchant evidence.', photoQuery: 'block print fabric' },
  { id: 'fashion', label: 'Fashion and apparel', cautions: 'Do not invent fabric, fit, care, origin or sustainability claims.', photoQuery: 'fashion clothing rack' },
  { id: 'jewellery', label: 'Jewellery and accessories', cautions: 'Never invent metal purity, hallmarking, gemstones, plating or certifications.', photoQuery: 'gold jewellery' },
  { id: 'beauty', label: 'Beauty and personal care', cautions: 'Never invent ingredients, results, medical effects, dermatological testing or certifications.', photoQuery: 'skincare products' },
  { id: 'baby-kids', label: 'Baby and kids', cautions: 'Never invent safety testing, age grading, organic certification or health claims.', photoQuery: 'baby clothes' },
  { id: 'gifting-festive', label: 'Gifting and festive', cautions: 'Never state delivery dates, cut-offs or offers the merchant did not provide.', photoQuery: 'diwali gifts' },
  { id: 'home-decor', label: 'Home decor and handicrafts', cautions: 'Never invent dimensions, materials, origin or handmade provenance.', photoQuery: 'home decor ceramics' },
  { id: 'pantry', label: 'Pantry, spices and speciality foods', cautions: 'Never invent ingredients, origin, nutrition, allergens, purity or health benefits.', photoQuery: 'indian spices' },
  { id: 'wellness', label: 'Lifestyle and wellness', cautions: 'Never make therapeutic, medical or performance claims.', photoQuery: 'wellness yoga' },
  { id: 'general', label: 'Something else', cautions: 'Only use facts the merchant supplied.', photoQuery: 'online shopping products' },
];

export function getNiche(id: string): Niche {
  return NICHES.find((niche) => niche.id === id) ?? NICHES[NICHES.length - 1];
}
