import { describe, expect, test } from 'bun:test'
import { computeMinimalEdit } from './text-diff'

describe('computeMinimalEdit', () => {
    const cases: Array<{
        name: string
        old: string
        next: string
        expected: { from: number; to: number; insert: string } | null
    }> = [
        { name: 'identical strings', old: 'abc', next: 'abc', expected: null },
        { name: 'append at end', old: 'abc', next: 'abcXYZ', expected: { from: 3, to: 3, insert: 'XYZ' } },
        { name: 'prepend at start', old: 'abc', next: 'XYZabc', expected: { from: 0, to: 0, insert: 'XYZ' } },
        {
            name: 'insert in middle',
            old: 'abcdef',
            next: 'abcXYZdef',
            expected: { from: 3, to: 3, insert: 'XYZ' }
        },
        {
            name: 'delete in middle',
            old: 'abcXYZdef',
            next: 'abcdef',
            expected: { from: 3, to: 6, insert: '' }
        },
        {
            name: 'full replacement, no common affixes',
            old: 'aaa',
            next: 'bbb',
            expected: { from: 0, to: 3, insert: 'bbb' }
        },
        { name: 'truncate end', old: 'abc', next: 'ab', expected: { from: 2, to: 3, insert: '' } },
        { name: 'drop prefix character', old: 'Xabc', next: 'abc', expected: { from: 0, to: 1, insert: '' } },
        {
            name: 'overlap clamp: shrink repeated chars',
            old: 'aaaa',
            next: 'aa',
            expected: { from: 2, to: 4, insert: '' }
        },
        {
            name: 'overlap clamp: grow repeated chars',
            old: 'aa',
            next: 'aaaa',
            expected: { from: 2, to: 2, insert: 'aa' }
        },
        { name: 'empty old string', old: '', next: 'abc', expected: { from: 0, to: 0, insert: 'abc' } },
        { name: 'empty new string', old: 'abc', next: '', expected: { from: 0, to: 3, insert: '' } },
        { name: 'single char replace', old: 'a', next: 'b', expected: { from: 0, to: 1, insert: 'b' } },
        {
            name: 'multi-gap insert collapses to one range',
            old: 'abc',
            next: 'aXbXc',
            expected: { from: 1, to: 2, insert: 'XbX' }
        },
        {
            name: 'emoji suffix replace (surrogate pair)',
            old: 'hello',
            next: 'hell😀',
            expected: { from: 4, to: 5, insert: '😀' }
        },
        {
            name: 'emoji prefix preserved',
            old: '😀abc',
            next: '😀xyz',
            expected: { from: 2, to: 5, insert: 'xyz' }
        }
    ]

    for (const c of cases) {
        test(c.name, () => {
            expect(computeMinimalEdit(c.old, c.next)).toEqual(c.expected)
        })
    }

    test('applying the edit always reproduces the new string', () => {
        const apply = (old: string, next: string): string => {
            const edit = computeMinimalEdit(old, next)
            if (!edit) return old
            return old.slice(0, edit.from) + edit.insert + old.slice(edit.to)
        }

        // Exhaustive over a small alphabet to guarantee correctness.
        const alphabet = ['a', 'b']
        const strings: string[] = ['']
        for (let len = 1; len <= 5; len++) {
            const prev = strings.filter((s) => s.length === len - 1)
            for (const s of prev) {
                for (const ch of alphabet) strings.push(s + ch)
            }
        }

        for (const a of strings) {
            for (const b of strings) {
                expect(apply(a, b)).toBe(b)
            }
        }
    })
})
