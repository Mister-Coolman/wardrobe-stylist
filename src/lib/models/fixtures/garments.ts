import type { GarmentTags } from '../types'

/** What the mock tagger "sees", in order of first appearance. Real-sounding pieces (style guide §8). */
export const FIXTURE_TAGS: GarmentTags[] = [
  { name: 'Navy wool overcoat', category: 'outerwear', subcategory: 'coat', colors: ['navy'], pattern: 'solid', formality: 4, warmth: 4, rainSafe: true, tags: ['wool'], brand: null, fit: null },
  { name: 'Oat merino crewneck', category: 'top', subcategory: 'sweater', colors: ['oat'], pattern: 'solid', formality: 3, warmth: 3, rainSafe: true, tags: ['merino'], brand: null, fit: null },
  { name: 'Selvedge jeans', category: 'bottom', subcategory: 'jeans', colors: ['indigo'], pattern: 'solid', formality: 2, warmth: 2, rainSafe: true, tags: ['denim'], brand: null, fit: 'slim' },
  { name: 'Brown suede loafers', category: 'shoes', subcategory: 'dress_shoes', colors: ['brown'], pattern: 'solid', formality: 4, warmth: 1, rainSafe: false, tags: ['suede'], brand: null, fit: null },
  { name: 'Black leather boots', category: 'shoes', subcategory: 'boots', colors: ['black'], pattern: 'solid', formality: 3, warmth: 1, rainSafe: true, tags: ['leather'], brand: null, fit: null },
  { name: 'Charcoal wool trousers', category: 'bottom', subcategory: 'trousers', colors: ['charcoal'], pattern: 'solid', formality: 4, warmth: 2, rainSafe: true, tags: ['wool'], brand: null, fit: null },
  { name: 'White oxford shirt', category: 'top', subcategory: 'dress_shirt', colors: ['white'], pattern: 'solid', formality: 4, warmth: 1, rainSafe: true, tags: ['cotton', 'button-down collar'], brand: 'Uniqlo', fit: 'classic' },
  { name: 'Rust cotton tee', category: 'top', subcategory: 'tshirt', colors: ['rust'], pattern: 'solid', formality: 1, warmth: 1, rainSafe: true, tags: ['cotton'], brand: null, fit: null },
  { name: 'Olive chore jacket', category: 'outerwear', subcategory: 'jacket', colors: ['olive'], pattern: 'solid', formality: 2, warmth: 3, rainSafe: true, tags: ['canvas'], brand: null, fit: null },
  { name: 'White leather sneakers', category: 'shoes', subcategory: 'sneakers', colors: ['white'], pattern: 'solid', formality: 2, warmth: 1, rainSafe: true, tags: ['leather'], brand: null, fit: null },
  { name: 'Grey marl sweatpants', category: 'bottom', subcategory: 'sweatpants', colors: ['grey'], pattern: 'marl', formality: 1, warmth: 2, rainSafe: true, tags: ['jersey'], brand: null, fit: null },
  { name: 'Ecru striped breton', category: 'top', subcategory: 'shirt', colors: ['ecru', 'navy'], pattern: 'stripe', formality: 2, warmth: 2, rainSafe: true, tags: ['cotton'], brand: null, fit: null },
]

export const FIXTURE_GAPS: GarmentTags[] = [
  { name: 'Black leather Chelsea boots', category: 'shoes', subcategory: 'boots', colors: ['black'], pattern: 'solid', formality: 4, warmth: 1, rainSafe: true, tags: ['leather'], brand: null, fit: null },
  { name: 'Navy unstructured blazer', category: 'outerwear', subcategory: 'jacket', colors: ['navy'], pattern: 'solid', formality: 4, warmth: 2, rainSafe: true, tags: ['wool'], brand: null, fit: null },
  { name: 'Grey flannel trousers', category: 'bottom', subcategory: 'trousers', colors: ['grey'], pattern: 'solid', formality: 4, warmth: 3, rainSafe: true, tags: ['wool'], brand: null, fit: null },
  { name: 'Heavyweight white tee', category: 'top', subcategory: 'tshirt', colors: ['white'], pattern: 'solid', formality: 1, warmth: 1, rainSafe: true, tags: ['cotton'], brand: null, fit: null },
]
