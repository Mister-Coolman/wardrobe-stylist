// Product search for "Add from the web" and "Find this online": SerpApi's Google Shopping engine when real
// (one call gives title, store, price, link and photo), a few fixed listings when mocked.
import { ModelError, withTimeout } from '@/lib/models/types'

export interface Product { id: string; title: string; store: string; price?: string; url: string; imageUrl: string }
export interface ProductSearch { search(q: string): Promise<Product[]> }

const MAX_RESULTS = 12

interface ShoppingResult {
  product_id?: string; title?: string; source?: string; price?: string
  product_link?: string; link?: string; thumbnail?: string; serpapi_thumbnail?: string
}

export const serpApiSearch: ProductSearch = {
  async search(q) {
    const key = process.env.SERPAPI_KEY
    if (!key) throw new ModelError('shop', 'unavailable', 'SERPAPI_KEY is not set')
    const params = new URLSearchParams({ engine: 'google_shopping', q, gl: 'us', hl: 'en', api_key: key })
    const res = await withTimeout(fetch(`https://serpapi.com/search.json?${params}`), 20_000, 'shop')
    if (!res.ok) throw new ModelError('shop', 'http', `serpapi → ${res.status} ${(await res.text()).slice(0, 200)}`)
    const j = (await res.json()) as { shopping_results?: ShoppingResult[] }
    return (j.shopping_results ?? []).flatMap((r, i): Product[] => {
      const imageUrl = r.thumbnail ?? r.serpapi_thumbnail
      const url = r.product_link ?? r.link
      return r.title && imageUrl && url ? [{ id: r.product_id ?? String(i), title: r.title, store: r.source ?? '', price: r.price, url, imageUrl }] : []
    }).slice(0, MAX_RESULTS)
  },
}

/** Listings for the mock; their photos are the sample-closet drawings. */
export const MOCK_PRODUCTS: Product[] = [
  { id: 'm1', title: "Under Armour Men's UA Rival Fleece Joggers", store: 'Under Armour', price: '$55.00', url: 'https://example.com/ua-rival-joggers', imageUrl: '/fixtures/garments/grey-marl-sweatpants.svg' },
  { id: 'm2', title: 'Nautica Classic Fit Deck Polo', store: 'Nautica', price: '$49.50', url: 'https://example.com/nautica-deck-polo', imageUrl: '/fixtures/garments/rust-cotton-tee.svg' },
  { id: 'm3', title: "Levi's 511 Slim Fit Men's Jeans", store: "Levi's", price: '$69.50', url: 'https://example.com/levis-511', imageUrl: '/fixtures/garments/selvedge-jeans.svg' },
]

export const mockProductSearch: ProductSearch = {
  async search(q) {
    const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
    const hits = MOCK_PRODUCTS.filter((p) => words.some((w) => p.title.toLowerCase().includes(w)))
    return hits.length ? hits : MOCK_PRODUCTS
  },
}

/** Real with MODELS=real (a missing key is reported, not hidden behind fixtures); mock otherwise. */
export function getProductSearch(): ProductSearch {
  return (process.env.MODELS || 'mock') === 'real' ? serpApiSearch : mockProductSearch
}
