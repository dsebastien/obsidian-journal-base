import { describe, expect, test } from 'bun:test'
import { findFrontmatterFoldRange } from './frontmatter'

describe('findFrontmatterFoldRange', () => {
    test('returns the range from the opening fence end to the closing fence end', () => {
        const content = '---\ntitle: Hello\ntags: [a, b]\n---\n\n# Body'
        const range = findFrontmatterFoldRange(content)
        expect(range).not.toBeNull()
        // Opening fence "---" is 3 chars; from is at offset 3 (end of line 1).
        expect(range?.from).toBe(3)
        // The folded slice covers the metadata and the closing fence.
        expect(content.slice(range!.from, range!.to)).toBe('\ntitle: Hello\ntags: [a, b]\n---')
    })

    test('folded range keeps only the opening fence visible before it', () => {
        const content = '---\nkey: value\n---\ncontent'
        const range = findFrontmatterFoldRange(content)
        expect(content.slice(0, range!.from)).toBe('---')
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

    test('folds an empty frontmatter block down to the closing fence', () => {
        // Opening fence end is offset 3; closing fence end is offset 7. The slice
        // is "\n---", which is non-empty, so this is a valid (if tiny) fold.
        const range = findFrontmatterFoldRange('---\n---\nbody')
        expect(range).toEqual({ from: 3, to: 7 })
    })

    test('returns null for a single-line document', () => {
        expect(findFrontmatterFoldRange('---')).toBeNull()
    })

    test('uses the first closing fence, not a later one', () => {
        const content = '---\nkey: value\n---\nbody\n---\nmore'
        const range = findFrontmatterFoldRange(content)
        expect(content.slice(range!.from, range!.to)).toBe('\nkey: value\n---')
    })

    test('ignores leading/trailing whitespace around fences', () => {
        const content = '--- \nkey: value\n  ---  \nbody'
        const range = findFrontmatterFoldRange(content)
        expect(range).not.toBeNull()
        expect(range?.from).toBe(4) // "--- " is 4 chars
    })
})
