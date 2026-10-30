import { z } from 'zod'

const level = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])

export const CandidateSchema = z.object({
  garmentIds: z.array(z.string()).min(1),
  rationale: z.record(z.string(), z.string()),
  title: z.string().min(1),
})
export const CandidatesSchema = z.object({ candidates: z.array(CandidateSchema) })

export const GarmentTagsSchema = z.object({
  name: z.string().min(1),
  category: z.enum(['top', 'bottom', 'onepiece', 'outerwear', 'shoes', 'accessory', 'underwear', 'socks']),
  subcategory: z.enum(['tshirt', 'dress_shirt', 'shirt', 'sweater', 'jeans', 'trousers', 'shorts', 'skirt', 'sweatpants',
    'athletic', 'dress', 'coat', 'jacket', 'boots', 'sneakers', 'dress_shoes', 'other']),
  colors: z.array(z.string()),
  pattern: z.string(),
  formality: level,
  warmth: level,
  rainSafe: z.boolean(),
  tags: z.array(z.string()),
  brand: z.string().nullable(),
  fit: z.enum(['slim', 'classic', 'relaxed', 'oversized']).nullable(),
})

export const StyleProfileSchema = z.object({
  summary: z.string(), traits: z.array(z.string()), palette: z.array(z.string()), avoid: z.array(z.string()), sourceImages: z.array(z.string()),
})
