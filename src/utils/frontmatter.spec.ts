import { describe, expect, test } from 'bun:test'
import { findFrontmatterFoldRange } from './frontmatter'

describe('findFrontmatterFoldRange', () => {
    test('covers the whole block from the opening fence to the closing fence end', () => {
        const content = '---\ntitle: Hello\ntags: [a, b]\n---\n\n# Body'
        const range = findFrontmatterFoldRange(content)
        expect(range).not.toBeNull()
        // Fold starts at the very beginning so the opening `---` is hidden too.
        expect(range?.from).toBe(0)
        // The folded slice is the entire frontmatter block, fences included.
        expect(content.slice(range!.from, range!.to)).toBe('---\ntitle: Hello\ntags: [a, b]\n---')
    })

    test('nothing remains visible before the fold (no leading --- left behind)', () => {
        const content = '---\nkey: value\n---\ncontent'
        const range = findFrontmatterFoldRange(content)
        expect(content.slice(0, range!.from)).toBe('')
    })

    test('the body after the closing fence is not folded', () => {
        const content = '---\nkey: value\n---\ncontent'
        const range = findFrontmatterFoldRange(content)
        // Closing fence ends right before the newline that precedes the body.
        expect(content.slice(range!.to)).toBe('\ncontent')
    })

    test('returns null when there is no frontmatter', () => {
        expect(findFrontmatterFoldRange('# Just a heading\n\nSome text')).toBeNull()
    })

    test('returns null when the opening fence is not on the first line', () => {
        expect(findFrontmatterFoldRange('\n---\nkey: value\n---')).toBeNull()
    })

    test('returns null when the frontmatter block is unterminated', () => {
        expect(findFrontmatterFoldRange('---\nkey: value\nno closing fence')).toBeNull()
    })

    test('folds an empty frontmatter block (just the two fences)', () => {
        const range = findFrontmatterFoldRange('---\n---\nbody')
        expect(range).toEqual({ from: 0, to: 7 })
    })

    test('returns null for a single-line document', () => {
        expect(findFrontmatterFoldRange('---')).toBeNull()
    })

    test('uses the first closing fence, not a later one', () => {
        const content = '---\nkey: value\n---\nbody\n---\nmore'
        const range = findFrontmatterFoldRange(content)
        expect(content.slice(range!.from, range!.to)).toBe('---\nkey: value\n---')
    })

    test('ignores leading/trailing whitespace around fences', () => {
        const content = '--- \nkey: value\n  ---  \nbody'
        const range = findFrontmatterFoldRange(content)
        expect(range).not.toBeNull()
        expect(range?.from).toBe(0)
        expect(content.slice(range!.from, range!.to)).toBe('--- \nkey: value\n  ---  ')
    })
})
