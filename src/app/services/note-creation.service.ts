import { App, TFile, Notice } from 'obsidian'
import type { PeriodicNoteConfig, PeriodType } from '../types'
import { PluginIntegrationService } from './plugin-integration.service'
import { formatDate, getStartOfPeriod } from '../../utils/date-utils'
import { log } from '../../utils/log'

export class NoteCreationService {
    private integrationService: PluginIntegrationService

    constructor(private app: App) {
        this.integrationService = new PluginIntegrationService(app)
    }

    /**
     * Create a periodic note for the given date
     * Uses Templater if configured, otherwise creates empty file
     */
    async createPeriodicNote(
        date: Date,
        config: PeriodicNoteConfig,
        periodType: PeriodType
    ): Promise<TFile | null> {
        const normalizedDate = getStartOfPeriod(date, periodType)
        const filename = formatDate(normalizedDate, config.format)
        const filePath = `${config.folder}/${filename}.md`

        // Check if file already exists
        const existingFile = this.app.vault.getFileByPath(filePath)
        if (existingFile) {
            new Notice(`Note already exists: ${filename}`)
            return existingFile
        }

        // Ensure folder exists
        const folderPath = config.folder
        await this.ensureFolderExists(folderPath)

        // Create with template if configured
        if (config.template && this.integrationService.isTemplaterEnabled()) {
            const file = await this.integrationService.createFileFromTemplate(
                config.template,
                folderPath,
                filename
            )
            if (file) {
                new Notice(`Created: ${filename}`)
                return file
            }
            // Fall through to create empty file if template fails
        }

        // Create empty file (fallback or no template configured)
        try {
            const file = await this.app.vault.create(filePath, '')
            new Notice(`Created: ${filename}`)
            return file
        } catch (error) {
            log('Failed to create periodic note:', 'error', error)
            new Notice(`Failed to create note: ${filename}`, 5000)
            return null
        }
    }

    /**
     * Ensure a folder path exists, creating nested folders if needed
     */
    private async ensureFolderExists(path: string): Promise<void> {
        if (!path) return

        const folder = this.app.vault.getFolderByPath(path)
        if (folder) return

        // Create nested folders if needed
        const parts = path.split('/')
        let currentPath = ''

        for (const part of parts) {
            if (!part) continue
            currentPath = currentPath ? `${currentPath}/${part}` : part
            const existing = this.app.vault.getFolderByPath(currentPath)
            if (!existing) {
                await this.app.vault.createFolder(currentPath)
            }
        }
    }

    /**
     * Open a periodic note in the workspace
     */
    async openPeriodicNote(file: TFile, newLeaf: boolean = false): Promise<void> {
        const leaf = newLeaf ? this.app.workspace.getLeaf('tab') : this.app.workspace.getLeaf()
        await leaf.openFile(file)
    }

    /**
     * Create and open a periodic note
     */
    async createAndOpenPeriodicNote(
        date: Date,
        config: PeriodicNoteConfig,
        periodType: PeriodType,
        newLeaf: boolean = false
    ): Promise<TFile | null> {
        const file = await this.createPeriodicNote(date, config, periodType)
        if (file) {
            await this.openPeriodicNote(file, newLeaf)
        }
        return file
    }
}
