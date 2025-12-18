/**
 * Represents a parsed markdown section with heading and content.
 */
export interface MarkdownSection {
    heading: string
    content: string
    level: number
}

/**
 * Parse markdown content into sections based on headings.
 * Each section includes the heading text, its content, and heading level.
 */
export function parseMarkdownSections(content: string): MarkdownSection[] {
    const sections: MarkdownSection[] = []
    const lines = content.split('\n')

    let currentSection: MarkdownSection | null = null
    const contentLines: string[] = []

    for (const line of lines) {
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)

        if (headingMatch) {
            // Save previous section
            if (currentSection) {
                currentSection.content = contentLines.join('\n').trim()
                sections.push(currentSection)
                contentLines.length = 0
            }

            // Start new section
            currentSection = {
                heading: headingMatch[2]!,
                content: '',
                level: headingMatch[1]!.length
            }
        } else if (currentSection) {
            contentLines.push(line)
        }
    }

    // Save last section
    if (currentSection) {
        currentSection.content = contentLines.join('\n').trim()
        sections.push(currentSection)
    }

    return sections
}

/**
 * Escape special regex characters in a string.
 */
export function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Check if a section exists in markdown content.
 */
export function sectionExists(content: string, heading: string, level: number): boolean {
    const headingPrefix = '#'.repeat(level)
    const sectionRegex = new RegExp(`^${headingPrefix}\\s+${escapeRegex(heading)}\\s*$`, 'm')
    return sectionRegex.test(content)
}

/**
 * Append content to an existing section in markdown.
 * Returns the modified content.
 */
export function appendToSection(
    content: string,
    section: MarkdownSection,
    newContent: string
): string {
    const lines = content.split('\n')
    const headingPrefix = '#'.repeat(section.level)
    const sectionRegex = new RegExp(`^${headingPrefix}\\s+${escapeRegex(section.heading)}\\s*$`)

    let inTargetSection = false
    let insertIndex = -1

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!

        if (sectionRegex.test(line)) {
            inTargetSection = true
            continue
        }

        if (inTargetSection) {
            // Check if we hit another heading of same or higher level
            const headingMatch = line.match(/^(#{1,6})\s+/)
            if (headingMatch && headingMatch[1]!.length <= section.level) {
                insertIndex = i
                break
            }
        }
    }

    // If we didn't find a next section, append at the end
    if (insertIndex === -1) {
        insertIndex = lines.length
    }

    // Insert content before the next section
    lines.splice(insertIndex, 0, '', newContent)

    return lines.join('\n')
}

/**
 * Add a new section to the end of markdown content.
 */
export function addSection(content: string, section: MarkdownSection): string {
    const headingPrefix = '#'.repeat(section.level)
    const sectionHeader = `${headingPrefix} ${section.heading}`
    return `${content.trimEnd()}\n\n${sectionHeader}\n\n${section.content}\n`
}
