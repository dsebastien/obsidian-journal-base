/**
 * Compute the character range to fold for a document's YAML frontmatter block.
 *
 * Returns the range from the end of the opening `---` fence to the end of the
 * closing `---` fence, so folding it leaves the opening fence visible with a
 * fold placeholder (matching Obsidian's native frontmatter fold). The offsets
 * are UTF-16 code-unit offsets, identical to CodeMirror document positions.
 *
 * Returns null when the document does not start with a frontmatter fence, the
 * block is unterminated, or the range would be empty (e.g. `---\n---`).
 */
export function findFrontmatterFoldRange(content: string): { from: number; to: number } | null {
    const lines = content.split('\n')
    if (lines.length < 2 || (lines[0] ?? '').trim() !== '---') {
        return null
    }

    // The opening fence ends at the length of the first line (before its newline).
    const from = (lines[0] ?? '').length

    let offset = from + 1 // account for the newline after the opening fence
    for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex] ?? ''
        if (line.trim() === '---') {
            const to = offset + line.length
            return to > from ? { from, to } : null
        }
        offset += line.length + 1
    }

    return null
}
