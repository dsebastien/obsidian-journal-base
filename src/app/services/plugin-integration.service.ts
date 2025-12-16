import { App, Notice, TFile, Plugin } from 'obsidian'
import type { EventRef } from 'obsidian'
import type { PluginSettings } from '../types/plugin-settings.intf'
import type { PeriodType } from '../types/periodic-note.types'

// Extend App to include the plugins property (exists at runtime but not in types)
interface AppWithPlugins extends App {
    plugins: {
        enabledPlugins: Set<string>
        getPlugin(id: string): Plugin | null
    }
}

// Periodic Notes plugin settings structure (from source analysis)
interface PeriodicNotesPeriodicConfig {
    enabled: boolean
    openAtStartup?: boolean
    format: string
    folder: string
    templatePath?: string
}

interface PeriodicNotesCalendarSet {
    id: string
    ctime: number
    day?: PeriodicNotesPeriodicConfig
    week?: PeriodicNotesPeriodicConfig
    month?: PeriodicNotesPeriodicConfig
    quarter?: PeriodicNotesPeriodicConfig
    year?: PeriodicNotesPeriodicConfig
}

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
    private app: AppWithPlugins

    constructor(app: App) {
        this.app = app as AppWithPlugins
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
        const plugin = this.getPeriodicNotesPlugin() as {
            settings?: PeriodicNotesCalendarSet
        } | null
        if (!plugin?.settings) return null

        const settings = plugin.settings
        const granularityMap: Record<string, PeriodType> = {
            day: 'daily',
            week: 'weekly',
            month: 'monthly',
            quarter: 'quarterly',
            year: 'yearly'
        }

        const result: Partial<PluginSettings> = {}

        for (const [granularity, periodType] of Object.entries(granularityMap)) {
            const config = settings[granularity as keyof PeriodicNotesCalendarSet] as
                | PeriodicNotesPeriodicConfig
                | undefined
            if (config) {
                result[periodType] = {
                    enabled: config.enabled,
                    folder: config.folder || '',
                    format: config.format || '',
                    template: config.templatePath || ''
                }
            }
        }

        return result
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
