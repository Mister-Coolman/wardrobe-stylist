import type { GarmentTags } from '../types'

/** What the mock tagger "sees", in order of first appearance. Real-sounding pieces (style guide §8). */
export const FIXTURE_TAGS: GarmentTags[] = [
  { name: 'Navy wool overcoat', category: 'outerwear', subcategory: 'coat', colors: ['navy'], pattern: 'solid', formality: 4, warmth: 4, rainSafe: true, tags: ['wool'] },
  { name: 'Oat merino crewneck', category: 'top', subcategory: 'sweater', colors: ['oat'], pattern: 'solid', formality: 3, warmth: 3, rainSafe: true, tags: ['merino'] },
  { name: 'Selvedge jeans', category: 'bottom', subcategory: 'jeans', colors: ['indigo'], pattern: 'solid', formality: 2, warmth: 2, rainSafe: true, tags: ['denim'] },
  { name: 'Brown suede loafers', category: 'shoes', subcategory: 'dress_shoes', colors: ['brown'], pattern: 'solid', formality: 4, warmth: 1, rainSafe: false, tags: ['suede'] },
  { name: 'White oxford shirt', category: 'top', subcategory: 'dress_shirt', colors: ['white'], pattern: 'solid', formality: 4, warmth: 1, rainSafe: true, tags: ['cotton'] },
  { name: 'Charcoal wool trousers', category: 'bottom', subcategory: 'trousers', colors: ['charcoal'], pattern: 'solid', formality: 4, warmth: 2, rainSafe: true, tags: ['wool'] },
  { name: 'Black leather boots', category: 'shoes', subcategory: 'boots', colors: ['black'], pattern: 'solid', formality: 3, warmth: 1, rainSafe: true, tags: ['leather'] },
  { name: 'Rust cotton tee', category: 'top', subcategory: 'tshirt', colors: ['rust'], pattern: 'solid', formality: 1, warmth: 1, rainSafe: true, tags: ['cotton'] },
  { name: 'Olive chore jacket', category: 'outerwear', subcategory: 'jacket', colors: ['olive'], pattern: 'solid', formality: 2, warmth: 3, rainSafe: true, tags: ['canvas'] },
  { name: 'White leather sneakers', category: 'shoes', subcategory: 'sneakers', colors: ['white'], pattern: 'solid', formality: 2, warmth: 1, rainSafe: true, tags: ['leather'] },
  { name: 'Grey marl sweatpants', category: 'bottom', subcategory: 'sweatpants', colors: ['grey'], pattern: 'marl', formality: 1, warmth: 2, rainSafe: true, tags: ['jersey'] },
  { name: 'Ecru striped breton', category: 'top', subcategory: 'shirt', colors: ['ecru', 'navy'], pattern: 'stripe', formality: 2, warmth: 2, rainSafe: true, tags: ['cotton'] },
]

export const FIXTURE_GAPS: GarmentTags[] = [
  { name: 'Black leather Chelsea boots', category: 'shoes', subcategory: 'boots', colors: ['black'], pattern: 'solid', formality: 4, warmth: 1, rainSafe: true, tags: ['leather'] },
  { name: 'Navy unstructured blazer', category: 'outerwear', subcategory: 'jacket', colors: ['navy'], pattern: 'solid', formality: 4, warmth: 2, rainSafe: true, tags: ['wool'] },
  { name: 'Grey flannel trousers', category: 'bottom', subcategory: 'trousers', colors: ['grey'], pattern: 'solid', formality: 4, warmth: 3, rainSafe: true, tags: ['wool'] },
  { name: 'Heavyweight white tee', category: 'top', subcategory: 'tshirt', colors: ['white'], pattern: 'solid', formality: 1, warmth: 1, rainSafe: true, tags: ['cotton'] },
]
