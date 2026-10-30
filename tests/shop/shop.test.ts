import { afterEach, describe, expect, test, vi } from 'vitest'
import { mockListing } from '@/lib/models/mock/others'
import { allowedImageUrl, fetchProductImage } from '@/lib/shop/image'
import { mockProductSearch, serpApiSearch } from '@/lib/shop/search'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('product photo urls', () => {
  test.each([
    ['https://serpapi.com/searches/abc/images/1.webp', true],
    ['https://encrypted-tbn0.gstatic.com/shopping?q=tbn:abc', true],
    ['https://lh3.googleusercontent.com/abc', true],
    ['/fixtures/garments/selvedge-jeans.svg', true],
    ['http://serpapi.com/x.jpg', false],
    ['https://serpapi.com:8443/x.jpg', false],
    ['https://serpapi.com.evil.example/x.jpg', false],
    ['https://169.254.169.254/latest/meta-data', false],
    ['https://localhost/x.jpg', false],
    ['/fixtures/../../.env.local', false],
    ['/api/media/abc/scans/x.jpg', false],
  ])('%s → %s', (url, ok) => expect(allowedImageUrl(url)).toBe(ok))

  test('fetchProductImage refuses other hosts before fetching', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(fetchProductImage('https://example.com/a.jpg', { read: vi.fn() })).rejects.toThrow('not allowed')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  test('fetchProductImage refuses a non-image response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'text/html' } })))
    await expect(fetchProductImage('https://serpapi.com/a.jpg', { read: vi.fn() })).rejects.toThrow('image fetch failed')
  })
})

describe('product search', () => {
  test('mock finds listings by word, and falls back to all of them', async () => {
    expect((await mockProductSearch.search('black under armour sweatpants')).map((p) => p.store)).toEqual(['Under Armour'])
    expect(await mockProductSearch.search('zzz')).toHaveLength(3)
  })

  test('SerpApi: missing key is reported as unavailable', async () => {
    vi.stubEnv('SERPAPI_KEY', '')
    await expect(serpApiSearch.search('x')).rejects.toMatchObject({ kind: 'unavailable' })
  })

  test('SerpApi: shopping results become products; ones with no photo or link are dropped', async () => {
    vi.stubEnv('SERPAPI_KEY', 'k')
    const fetchSpy = vi.fn(async (_url: string) => Response.json({ shopping_results: [
      { product_id: '1', title: 'UA Rival Fleece Joggers', source: 'Under Armour', price: '$55.00', product_link: 'https://g.co/p/1', thumbnail: 'https://serpapi.com/i/1.webp' },
      { product_id: '2', title: 'No photo', source: 'X', product_link: 'https://g.co/p/2' },
    ] }))
    vi.stubGlobal('fetch', fetchSpy)
    expect(await serpApiSearch.search('black under armour sweatpants')).toEqual([
      { id: '1', title: 'UA Rival Fleece Joggers', store: 'Under Armour', price: '$55.00', url: 'https://g.co/p/1', imageUrl: 'https://serpapi.com/i/1.webp' },
    ])
    expect(fetchSpy.mock.calls[0][0]).toContain('engine=google_shopping')
  })
})

describe('mock listing reader', () => {
  test('reads brand, fit and category from a title', () => {
    expect(mockListing("Levi's 511 Slim Fit Men's Jeans")).toEqual({ name: "Levi's 511 Slim Fit Jeans", category: 'bottom', brand: "Levi's", fit: 'slim', tags: [], colors: [] })
  })
})
