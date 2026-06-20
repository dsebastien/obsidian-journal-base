/**
 * The single replacement range that transforms one string into another.
 * Offsets are UTF-16 code-unit indices (same as JS string indexing).
 */
export interface MinimalEdit {
    /** Start offset of the change in the OLD string. */
    from: number
    /** End offset of the change in the OLD string. */
    to: number
    /** Replacement text. */
    insert: string
}

/**
 * Compute the single replacement range that transforms `oldStr` into `newStr`,
 * using the longest common prefix + longest common suffix.
 *
 * The prefix and suffix windows are clamped so they never overlap (which would
 * otherwise happen when one string is a sub-string of the other, e.g. repeated
 * characters). Returns `null` when the strings are identical.
 *
 * Offsets are UTF-16 code-unit indices, which matches CodeMirror 6's document
 * model — non-BMP characters (emoji) are surrogate pairs in both JS strings and
 * CM6, so a common prefix/suffix can never split a character.
 */
export function computeMinimalEdit(oldStr: string, newStr: string): MinimalEdit | null {
    if (oldStr === newStr) return null

    const oldLen = oldStr.length
    const newLen = newStr.length
    const minLen = Math.min(oldLen, newLen)

    // Longest common prefix
    let prefixLen = 0
    while (prefixLen < minLen && oldStr[prefixLen] === newStr[prefixLen]) {
        prefixLen++
    }

    // Longest common suffix, but never let prefix + suffix exceed minLen
    // (prevents the two windows from overlapping when one string is a sub-string
    // of the other).
    let suffixLen = 0
    const maxSuffix = minLen - prefixLen
    while (
        suffixLen < maxSuffix &&
        oldStr[oldLen - 1 - suffixLen] === newStr[newLen - 1 - suffixLen]
    ) {
        suffixLen++
    }

    return {
        from: prefixLen,
        to: oldLen - suffixLen,
        insert: newStr.slice(prefixLen, newLen - suffixLen)
    }
}
