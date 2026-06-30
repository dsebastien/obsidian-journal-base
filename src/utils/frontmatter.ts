/**
 * Compute the character range to fold for a document's YAML frontmatter block.
 *
 * Returns the range covering the WHOLE block — from the start of the opening
 * `---` fence to the end of the closing `---` fence — so folding it hides the
 * entire block and leaves only the fold placeholder (no visible `---`), matching
 * the result of Obsidian's native frontmatter fold. The offsets are UTF-16
 * code-unit offsets, identical to CodeMirror document positions.
 *
 * Returns null when the document does not start with a frontmatter fence or the
 * block is unterminated.
 */
export function findFrontmatterFoldRange(content: string): { from: number; to: number } | null {
    const lines = content.split('\n')
    if (lines.length < 2 || (lines[0] ?? '').trim() !== '---') {
        return null
    }

    // Fold from the very start of the document so the opening fence is hidden too.
    const from = 0

    // The opening fence occupies line 0 plus its trailing newline.
    let offset = (lines[0] ?? '').length + 1
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
