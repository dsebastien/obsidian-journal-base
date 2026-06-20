import type { JournalBasesPlugin } from '../plugin'
import { registerPeriodicNoteCommands } from './periodic-note-commands'

/**
 * Register all plugin commands.
 */
export function registerCommands(plugin: JournalBasesPlugin): void {
    registerPeriodicNoteCommands(plugin)
}
