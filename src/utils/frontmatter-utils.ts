import type { App, TFile } from 'obsidian'
import { log } from './log'

/**
 * Read a boolean property from a note's frontmatter.
 * Returns false if the property doesn't exist or the file has no frontmatter.
 */
export function getFrontmatterProperty(app: App, file: TFile, property: string): boolean {
    const cache = app.metadataCache.getFileCache(file)
    if (!cache?.frontmatter) {
        return false
    }
    const value = cache.frontmatter[property]
    // Handle both boolean true and string "true"
    return value === true || value === 'true'
}

/**
 * Check if a note is marked as done by reading its frontmatter.
 * @param app - Obsidian app instance
 * @param file - The file to check
 * @param propertyName - The frontmatter property name to check
 */
export function isNoteDone(app: App, file: TFile, propertyName: string): boolean {
    return getFrontmatterProperty(app, file, propertyName)
}

/**
 * Set a boolean property in a note's frontmatter.
 * Creates frontmatter if it doesn't exist.
 */
export async function setFrontmatterProperty(
    app: App,
    file: TFile,
    property: string,
    value: boolean
): Promise<void> {
    try {
        await app.fileManager.processFrontMatter(file, (frontmatter) => {
            frontmatter[property] = value
        })
    } catch (error) {
        // Check if this is a YAML parsing error
        const errorName = error instanceof Error ? error.name : ''
        const errorMessage = error instanceof Error ? error.message : String(error)

        if (errorName === 'YAMLParseError' || errorMessage.includes('YAML')) {
            log(
                `Malformed YAML frontmatter in "${file.path}". The file's frontmatter contains invalid YAML syntax and needs manual repair. Error: ${errorMessage}`,
                'warn'
            )
        } else {
            log(`Failed to update frontmatter for "${file.path}": ${errorMessage}`, 'error')
        }
    }
}

/**
 * Set the done status of a note by updating its frontmatter.
 * @param app - Obsidian app instance
 * @param file - The file to update
 * @param isDone - Whether to mark as done
 * @param propertyName - The frontmatter property name to use
 */
export async function setNoteDone(
    app: App,
    file: TFile,
    isDone: boolean,
    propertyName: string
): Promise<void> {
    await setFrontmatterProperty(app, file, propertyName, isDone)
}
