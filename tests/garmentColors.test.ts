import { describe, expect, test } from 'vitest'
import { colorsFromName, namePatch } from '@/lib/garments'
import type { Garment } from '@/lib/domain/types'

const g = (name: string, colors: string[]) => ({ name, colors }) as Garment

describe('colorsFromName', () => {
  test('reads the colours a name gives, keeping a shade with its colour', () => {
    expect(colorsFromName('Heather blue quarter-zip pullover')).toEqual(['heather blue'])
    expect(colorsFromName('Navy blue docker pants')).toEqual(['navy blue'])
    expect(colorsFromName('Black dockers')).toEqual(['black'])
    expect(colorsFromName('Green and navy striped polo')).toEqual(['green', 'navy'])
  })

  test('no colour named, or only a shade, gives none', () => {
    expect(colorsFromName('Dark wash calvin Klein jeans')).toEqual([])
    expect(colorsFromName('Columbia fleece')).toEqual([])
  })

  test('khaki is a style when a colour is also named', () => {
    expect(colorsFromName('Burma Grey Dockers Khaki Stretch Pants')).toEqual(['grey'])
    expect(colorsFromName('Khaki chinos')).toEqual(['khaki'])
  })
})

describe('namePatch', () => {
  test('a new name whose colour the saved colours contradict replaces them', () => {
    expect(namePatch(g('Quarter-zip', ['grey']), { name: 'Heather blue quarter-zip pullover' })).toEqual({ name: 'Heather blue quarter-zip pullover', colors: ['heather blue'] })
    expect(namePatch(g('Pants', ['brown']), { name: 'Black dockers' })).toEqual({ name: 'Black dockers', colors: ['black'] })
  })

  test('saved colours that agree with the name are kept, details and all', () => {
    expect(namePatch(g('Tee', ['white', 'black']), { name: 'White graphic tee with Eiffel Tower graphic' })).toEqual({ name: 'White graphic tee with Eiffel Tower graphic' })
    expect(namePatch(g('Pants', ['gray']), { name: 'Burma Grey Dockers' })).toEqual({ name: 'Burma Grey Dockers' })
    expect(namePatch(g('Polo', ['light blue']), { name: 'Light blue pique polo' })).toEqual({ name: 'Light blue pique polo' })
  })

  test('no colour in the name, or colours given with it, leaves the patch alone', () => {
    expect(namePatch(g('Jeans', ['indigo']), { name: 'Dark wash calvin Klein jeans' })).toEqual({ name: 'Dark wash calvin Klein jeans' })
    expect(namePatch(g('Pants', ['brown']), { name: 'Black dockers', colors: ['charcoal'] })).toEqual({ name: 'Black dockers', colors: ['charcoal'] })
    expect(namePatch(g('Pants', ['brown']), { status: 'clean' })).toEqual({ status: 'clean' })
  })
})
