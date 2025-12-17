import { log } from './../../utils/log'
import { App, Notice, TFile } from 'obsidian'
import type { EventRef } from 'obsidian'
import {
    PERIOD_TYPES,
    periodicNotesPluginSettingsSchema,
    type PluginSettings,
    type AppWithPlugins
} from '../types'

// Templater plugin interface (from source analysis)
interface TemplaterPlugin {
    templater: {
        create_new_note_from_template(
            template: TFile | string,
            folder?: string,
            filename?: string,
            open_new_note?: boolean
        ): Promise<TFile | undefined>
        append_template_to_active_file(template_file: TFile): Promise<void>
        write_template_to_file(template_file: TFile, file: TFile): Promise<void>
        current_functions_object?: {
            file: {
                find_tfile(templateName: string): TFile | null
                create_new(
                    template: TFile | string,
                    filename?: string,
                    open_new?: boolean,
                    folder?: string
                ): Promise<TFile | undefined>
            }
        }
    }
}

export class PluginIntegrationService {
    private periodicNotesEventRef: EventRef | null = null
    private pluginStateCheckInterval: ReturnType<typeof setInterval> | null = null
    private lastPeriodicNotesState: boolean = false
    private onPeriodicNotesEnabled: (() => void) | null = null
    private onPeriodicNotesDisabled: (() => void) | null = null
    private app: AppWithPlugins

    constructor(app: App) {
        this.app = app as AppWithPlugins
        // Initialize with current state
        this.lastPeriodicNotesState = this.isPeriodicNotesPluginEnabled()
    }

    // ===== Periodic Notes Plugin Integration =====

    isPeriodicNotesPluginEnabled(): boolean {
        return this.app.plugins.enabledPlugins.has('periodic-notes')
    }

    getPeriodicNotesPlugin(): unknown | null {
        if (!this.isPeriodicNotesPluginEnabled()) return null
        return this.app.plugins.getPlugin('periodic-notes')
    }

    /**
     * Convert periodic-notes plugin settings to our format
     * Periodic-notes uses CalendarSet with granularities: day, week, month, quarter, year
     */
    syncFromPeriodicNotesPlugin(): Partial<PluginSettings> | null {
        const periodicNotesPlugin = this.getPeriodicNotesPlugin() as {
            settings?: unknown
        } | null
        if (!periodicNotesPlugin?.settings) return null

        log('PeriodicNotes plugin settings', 'debug', periodicNotesPlugin.settings)

        // Validate settings against schema
        const parseResult = periodicNotesPluginSettingsSchema.safeParse(
            periodicNotesPlugin.settings
        )
        if (!parseResult.success) {
            log('PeriodicNotes plugin settings validation failed', 'warn', parseResult.error.issues)
            return null
        }

        const periodicNotesPluginSettings = parseResult.data

        const retVal: Partial<PluginSettings> = {}
        for (const periodType of PERIOD_TYPES) {
            retVal[periodType] = { ...periodicNotesPluginSettings[periodType] }
        }

        return retVal
    }

    /**
     * Subscribe to periodic-notes settings changes
     */
    subscribeToPeriodicNotesChanges(callback: () => void): void {
        if (this.periodicNotesEventRef) {
            this.app.workspace.offref(this.periodicNotesEventRef)
        }
        // Custom event from periodic-notes plugin (not in official types)
        const eventName = 'periodic-notes:settings-updated'
        this.periodicNotesEventRef = this.app.workspace.on(
            eventName as Parameters<typeof this.app.workspace.on>[0],
            callback
        )
    }

    unsubscribeFromPeriodicNotesChanges(): void {
        if (this.periodicNotesEventRef) {
            this.app.workspace.offref(this.periodicNotesEventRef)
            this.periodicNotesEventRef = null
        }
    }

    /**
     * Subscribe to periodic-notes plugin enable/disable state changes
     * Uses polling since Obsidian doesn't provide reliable plugin state change events
     * @param onEnabled Callback when periodic-notes plugin is enabled
     * @param onDisabled Callback when periodic-notes plugin is disabled
     */
    subscribeToPeriodicNotesPluginState(onEnabled: () => void, onDisabled: () => void): void {
        this.unsubscribeFromPeriodicNotesPluginState()

        this.onPeriodicNotesEnabled = onEnabled
        this.onPeriodicNotesDisabled = onDisabled
        this.lastPeriodicNotesState = this.isPeriodicNotesPluginEnabled()

        // Poll for plugin state changes every second
        this.pluginStateCheckInterval = setInterval(() => {
            this.checkPeriodicNotesPluginState()
        }, 1000)
    }

    /**
     * Check if Periodic Notes plugin state has changed and trigger callbacks
     */
    private checkPeriodicNotesPluginState(): void {
        const currentState = this.isPeriodicNotesPluginEnabled()

        if (currentState !== this.lastPeriodicNotesState) {
            this.lastPeriodicNotesState = currentState

            if (currentState) {
                log('Periodic Notes plugin enabled', 'debug')
                this.onPeriodicNotesEnabled?.()
            } else {
                log('Periodic Notes plugin disabled', 'debug')
                this.onPeriodicNotesDisabled?.()
            }
        }
    }

    unsubscribeFromPeriodicNotesPluginState(): void {
        if (this.pluginStateCheckInterval) {
            clearInterval(this.pluginStateCheckInterval)
            this.pluginStateCheckInterval = null
        }
        this.onPeriodicNotesEnabled = null
        this.onPeriodicNotesDisabled = null
    }

    // ===== Templater Plugin Integration =====

    isTemplaterEnabled(): boolean {
        return this.app.plugins.enabledPlugins.has('templater-obsidian')
    }

    getTemplaterPlugin(): TemplaterPlugin | null {
        if (!this.isTemplaterEnabled()) return null
        return this.app.plugins.getPlugin('templater-obsidian') as TemplaterPlugin | null
    }

    /**
     * Create a new file from a Templater template
     * Uses Templater's create_new_note_from_template method
     */
    async createFileFromTemplate(
        templatePath: string,
        targetFolder: string,
        filename: string
    ): Promise<TFile | null> {
        const templater = this.getTemplaterPlugin()
        if (!templater) {
            new Notice('Templater plugin is required for template support', 5000)
            return null
        }

        // Get template file
        const templateFile = this.app.vault.getFileByPath(templatePath)
        if (!templateFile) {
            new Notice(`Template not found: ${templatePath}`, 5000)
            return null
        }

        try {
            // Use Templater's API to create file with template
            const newFile = await templater.templater.create_new_note_from_template(
                templateFile,
                targetFolder,
                filename,
                false // Don't open the new note automatically
            )
            return newFile ?? null
        } catch (error) {
            console.error('Failed to create file from template:', error)
            new Notice('Failed to apply template', 5000)
            return null
        }
    }

    /**
     * Apply a template to an existing file
     */
    async applyTemplateToFile(templatePath: string, targetFile: TFile): Promise<boolean> {
        const templater = this.getTemplaterPlugin()
        if (!templater) {
            new Notice('Templater plugin is required', 5000)
            return false
        }

        const templateFile = this.app.vault.getFileByPath(templatePath)
        if (!templateFile) {
            new Notice(`Template not found: ${templatePath}`, 5000)
            return false
        }

        try {
            await templater.templater.write_template_to_file(templateFile, targetFile)
            return true
        } catch (error) {
            console.error('Failed to apply template:', error)
            new Notice('Failed to apply template', 5000)
            return false
        }
    }

    showTemplaterMissingNotice(): void {
        new Notice(
            'Templater plugin is required for template support. Please install and enable it.',
            8000
        )
    }
}
