import { describe, expect, test } from 'bun:test'
import type { PeriodicNoteConfig } from '../../types'
import { getCardOrderSignature, type CardOrderItem } from './card-order'

const config: PeriodicNoteConfig = {
    enabled: true,
    folder: 'Journal',
    format: 'YYYY-MM-DD',
    template: 'Templates/Daily'
}

function card(path: string): CardOrderItem {
    return { type: 'card', path, date: new Date(2026, 0, 1) }
}

function missing(day: number): CardOrderItem {
    return { type: 'missing', date: new Date(2026, 0, day) }
}

describe('getCardOrderSignature', () => {
    const order = [missing(3), card('Journal/2026-01-02.md'), card('Journal/2026-01-01.md')]

    test('is the same for the same list', () => {
        const again = [missing(3), card('Journal/2026-01-02.md'), card('Journal/2026-01-01.md')]

        expect(getCardOrderSignature(again, config)).toBe(getCardOrderSignature(order, config))
    })

    test('does not depend on the date of an existing note, only on its path', () => {
        const otherDate: CardOrderItem[] = [
            missing(3),
            { type: 'card', path: 'Journal/2026-01-02.md', date: new Date(2030, 5, 5) },
            card('Journal/2026-01-01.md')
        ]

        expect(getCardOrderSignature(otherDate, config)).toBe(getCardOrderSignature(order, config))
    })

    test('changes when the order changes', () => {
        const reordered = [missing(3), card('Journal/2026-01-01.md'), card('Journal/2026-01-02.md')]

        expect(getCardOrderSignature(reordered, config)).not.toBe(
            getCardOrderSignature(order, config)
        )
    })

    test('changes when a note is added or removed', () => {
        const signature = getCardOrderSignature(order, config)

        expect(getCardOrderSignature(order.slice(1), config)).not.toBe(signature)
        expect(getCardOrderSignature([...order, card('Journal/2025-12-31.md')], config)).not.toBe(
            signature
        )
    })

    test('changes when a missing period gets its note', () => {
        const created = [
            card('Journal/2026-01-03.md'),
            card('Journal/2026-01-02.md'),
            card('Journal/2026-01-01.md')
        ]

        expect(getCardOrderSignature(created, config)).not.toBe(
            getCardOrderSignature(order, config)
        )
    })

    test('changes when a missing period changes', () => {
        const other = [missing(4), card('Journal/2026-01-02.md'), card('Journal/2026-01-01.md')]

        expect(getCardOrderSignature(other, config)).not.toBe(getCardOrderSignature(order, config))
    })

    test('changes when the folder, the format or the template changes', () => {
        const signature = getCardOrderSignature(order, config)

        for (const changed of [
            { ...config, folder: 'Diary' },
            { ...config, format: 'YYYY.MM.DD' },
            { ...config, template: 'Templates/Other' }
        ]) {
            expect(getCardOrderSignature(order, changed)).not.toBe(signature)
        }
    })

    test('cannot confuse a path with a missing period', () => {
        const time = new Date(2026, 0, 3).getTime()
        const trick = [card(`missing:${time}`)]

        expect(getCardOrderSignature(trick, config)).not.toBe(
            getCardOrderSignature([missing(3)], config)
        )
    })
})
