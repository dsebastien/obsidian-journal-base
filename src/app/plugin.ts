import { Notice, Plugin } from 'obsidian'
import {
    DEFAULT_SETTINGS,
    PERIOD_TYPES,
    type PluginSettings,
    type PeriodType,
    type LifeTrackerPluginFileProvider,
    type AppWithPlugins
} from './types'
import { markPeriodWithCascade, isPeriodDone } from '../utils/done-reviews-utils'
import { JournalBasesSettingTab } from './settings/settings-tab'
import { log } from '../utils/log'
import { produce } from 'immer'
import type { Draft } from 'immer'
import { PERIODIC_NOTES_VIEW_TYPE } from './views/periodic-notes/periodic-notes.constants'
import { PeriodicNotesView } from './views/periodic-notes/periodic-notes-view'
import { getPeriodicNotesViewOptions } from './views/periodic-notes/periodic-notes-options'
import { PERIODIC_REVIEW_VIEW_TYPE } from './views/periodic-review/periodic-review.constants'
import { PeriodicReviewView } from './views/periodic-review/periodic-review-view'
import { createPeriodicReviewViewOptions } from './views/periodic-review/periodic-review-options'
import { PluginIntegrationService } from './services/plugin-integration.service'

export class JournalBasesPlugin extends Plugin {
    declare app: AppWithPlugins
    /**
     * The plugin settings are immutable
     */
    settings: PluginSettings = produce(DEFAULT_SETTINGS, () => DEFAULT_SETTINGS)

    /**
     * Whether settings are synced from Periodic Notes plugin (makes settings read-only)
     */
    isPeriodicNotesSynced: boolean = false

    /**
     * Integration service for external plugins
     */
    private integrationService!: PluginIntegrationService

    /**
     * Settings tab reference for refreshing
     */
    private settingTab!: JournalBasesSettingTab

    /**
     * Callbacks to notify when settings change
     */
    private settingsChangeCallbacks: Set<() => void> = new Set()

    /**
     * Callbacks to notify when done reviews change
     */
    private doneReviewsChangeCallbacks: Set<() => void> = new Set()

    /**
     * Pending done state updates (optimistic updates while cache is updating).
     * Key is `${periodType}-${date.getTime()}`, value is the expected done state.
     * Used to prevent stale cache data from reverting optimistic UI updates.
     */
    private pendingDoneStates: Map<string, boolean> = new Map()

    /**
     * Register a file provider as active (called when view becomes visible)
     */
    setActiveFileProvider(provider: LifeTrackerPluginFileProvider | null): void {
        const lifeTrackerPlugin = this.app.plugins.getPlugin('life-tracker') as
            | (Plugin & {
                  setActiveFileProvider?: (provider: LifeTrackerPluginFileProvider | null) => void
              })
            | null
        if (
            lifeTrackerPlugin !== null &&
            typeof lifeTrackerPlugin.setActiveFileProvider === 'function'
        ) {
            lifeTrackerPlugin.setActiveFileProvider(provider)
        }
    }

    /**
     * Executed as soon as the plugin loads
     */
    override async onload(): Promise<void> {
        log('Initializing', 'debug')

        // Initialize integration service
        this.integrationService = new PluginIntegrationService(this.app)

        await this.loadSettings()

        // Check for Templater plugin and warn if missing
        this.checkTemplaterPlugin()

        // Sync settings from Periodic Notes plugin if enabled
        await this.syncFromPeriodicNotesPlugin()

        // Listen for Periodic Notes settings changes
        this.integrationService.subscribeToPeriodicNotesChanges(async () => {
            log('Periodic Notes settings updated, syncing...', 'debug')
            await this.syncFromPeriodicNotesPlugin()
            // Refresh settings tab if open
            this.settingTab?.display()
        })

        // Watch for Periodic Notes plugin enable/disable
        this.integrationService.subscribeToPeriodicNotesPluginState(
            // On enabled: sync settings and make read-only
            async () => {
                log('Periodic Notes plugin was enabled, syncing settings...', 'debug')
                await this.syncFromPeriodicNotesPlugin()
                this.settingTab?.display()
            },
            // On disabled: make settings editable again
            () => {
                log('Periodic Notes plugin was disabled, settings now editable', 'debug')
                this.isPeriodicNotesSynced = false
                this.settingTab?.display()
            }
        )

        // Register Base views
        this.registerViews()

        // Add a settings screen for the plugin
        this.settingTab = new JournalBasesSettingTab(this.app, this)
        this.addSettingTab(this.settingTab)
    }

    /**
     * Check if Templater plugin is installed and show notice if missing
     */
    private checkTemplaterPlugin(): void {
        if (!this.integrationService.isTemplaterEnabled()) {
            this.integrationService.showTemplaterMissingNotice()
        }
    }

    /**
     * Check if synced settings have meaningful configuration
     * (at least one period type with enabled=true and a non-empty folder)
     */
    private hasMeaningfulSettings(settings: Partial<PluginSettings>): boolean {
        for (const periodType of PERIOD_TYPES) {
            const periodSettings = settings[periodType]
            if (periodSettings?.enabled && periodSettings.folder?.trim()) {
                return true
            }
        }
        return false
    }

    /**
     * Sync settings from Periodic Notes plugin if it's enabled and has meaningful configuration
     * Saves the synced settings to disk so they persist even if Periodic Notes is later disabled
     */
    private async syncFromPeriodicNotesPlugin(): Promise<void> {
        if (!this.integrationService.isPeriodicNotesPluginEnabled()) {
            this.isPeriodicNotesSynced = false
            return
        }

        const syncedSettings = this.integrationService.syncFromPeriodicNotesPlugin()
        if (!syncedSettings) {
            this.isPeriodicNotesSynced = false
            return
        }

        // Only sync if Periodic Notes has meaningful configuration
        // This preserves our existing settings if Periodic Notes is enabled but unconfigured
        if (!this.hasMeaningfulSettings(syncedSettings)) {
            log(
                'Periodic Notes plugin has no meaningful settings, keeping existing settings',
                'debug'
            )
            this.isPeriodicNotesSynced = false
            return
        }

        log('Loaded settings from Periodic Notes plugin. Updating ours', 'debug', syncedSettings)

        // Merge synced settings with current settings
        this.settings = produce(this.settings, (draft: Draft<PluginSettings>) => {
            for (const periodType of PERIOD_TYPES) {
                const synced = syncedSettings[periodType]
                if (synced) {
                    draft[periodType] = synced
                }
            }
        })

        // Save to disk so settings persist even if Periodic Notes is later disabled
        await this.saveSettings()

        this.isPeriodicNotesSynced = true
        log('Settings synced from Periodic Notes plugin', 'debug', this.settings)
    }

    /**
     * Register custom Base view types
     */
    private registerViews(): void {
        // Register Periodic Notes View
        const periodicNotesRegistered = this.registerBasesView(PERIODIC_NOTES_VIEW_TYPE, {
            name: 'Periodic Notes',
            icon: 'calendar',
            factory: (controller, containerEl) =>
                new PeriodicNotesView(controller, containerEl, this),
            options: getPeriodicNotesViewOptions
        })

        if (!periodicNotesRegistered) {
            log('Bases feature is not enabled in this vault', 'warn')
        } else {
            log('Registered Periodic Notes view', 'debug')
        }

        // Register Periodic Review View
        // Options are dynamically filtered based on enabled period types in plugin settings
        const periodicReviewRegistered = this.registerBasesView(PERIODIC_REVIEW_VIEW_TYPE, {
            name: 'Periodic Review',
            icon: 'columns',
            factory: (controller, containerEl) =>
                new PeriodicReviewView(controller, containerEl, this),
            options: createPeriodicReviewViewOptions(() => this.settings)
        })

        if (periodicReviewRegistered) {
            log('Registered Periodic Review view', 'debug')
        }
    }

    override onunload(): void {
        this.integrationService?.unsubscribeFromPeriodicNotesChanges()
        this.integrationService?.unsubscribeFromPeriodicNotesPluginState()
    }

    /**
     * Load the plugin settings
     */
    async loadSettings(): Promise<void> {
        log('Loading settings', 'debug')
        const loadedSettings = (await this.loadData()) as PluginSettings | null

        if (!loadedSettings) {
            log('Using default settings', 'debug')
            return
        }

        // Merge loaded settings with defaults to handle missing properties
        this.settings = produce(this.settings, (draft: Draft<PluginSettings>) => {
            for (const periodType of PERIOD_TYPES) {
                const loaded = loadedSettings[periodType]
                if (loaded) {
                    draft[periodType].enabled = loaded.enabled ?? false
                    draft[periodType].folder = loaded.folder ?? ''
                    draft[periodType].format = loaded.format ?? DEFAULT_SETTINGS[periodType].format
                    draft[periodType].template = loaded.template ?? ''
                }
            }
            // Load donePropertyName setting
            draft.donePropertyName =
                loadedSettings.donePropertyName ?? DEFAULT_SETTINGS.donePropertyName
        })

        log('Settings loaded', 'debug', this.settings)
    }

    /**
     * Save the plugin settings
     */
    async saveSettings(): Promise<void> {
        log('Saving settings', 'debug', this.settings)
        await this.saveData(this.settings)
        log('Settings saved', 'debug', this.settings)
        this.notifySettingsChanged()
    }

    /**
     * Subscribe to settings changes.
     * @returns Unsubscribe function
     */
    onSettingsChange(callback: () => void): () => void {
        this.settingsChangeCallbacks.add(callback)
        return () => {
            this.settingsChangeCallbacks.delete(callback)
        }
    }

    /**
     * Notify all subscribers that settings have changed
     */
    private notifySettingsChanged(): void {
        for (const callback of this.settingsChangeCallbacks) {
            callback()
        }
    }

    // ========================================
    // Done Reviews Methods
    // Done status is stored in note frontmatter, not plugin data.
    // ========================================

    /**
     * Create a key for the pending done states map.
     */
    private getPendingDoneKey(date: Date, periodType: PeriodType): string {
        return `${periodType}-${date.getTime()}`
    }

    /**
     * Check if a period is marked as done.
     * First checks pending states (optimistic updates), then falls back to frontmatter cache.
     * Returns false if the note doesn't exist.
     */
    isDone(date: Date, periodType: PeriodType): boolean {
        // Check pending states first (for optimistic UI updates)
        const pendingKey = this.getPendingDoneKey(date, periodType)
        if (this.pendingDoneStates.has(pendingKey)) {
            return this.pendingDoneStates.get(pendingKey)!
        }
        return isPeriodDone(this.app, date, periodType, this.settings)
    }

    /**
     * Mark a period as done or not done.
     * Updates the 'done' property in the note's frontmatter.
     * Cascades to all child periods (e.g., marking 2024 as done marks all quarters/months/weeks/days)
     * Only updates notes that exist - doesn't create new files.
     */
    async setDone(date: Date, periodType: PeriodType, isDone: boolean): Promise<void> {
        // Set pending state for the clicked period to prevent stale cache from reverting UI
        const pendingKey = this.getPendingDoneKey(date, periodType)
        this.pendingDoneStates.set(pendingKey, isDone)

        const notice = new Notice(`Updating ${periodType} notes...`, 0)
        try {
            await markPeriodWithCascade(this.app, date, periodType, this.settings, isDone)
            // Delay to allow metadata cache to update before refreshing views
            await new Promise((resolve) => setTimeout(resolve, 100))
            this.notifyDoneReviewsChanged()
        } finally {
            notice.hide()
            // Clear pending state after a longer delay to ensure cache is fully updated
            setTimeout(() => {
                this.pendingDoneStates.delete(pendingKey)
            }, 1000)
        }
    }

    /**
     * Toggle the done status of a period.
     * Cascades to all child periods.
     */
    async toggleDone(date: Date, periodType: PeriodType): Promise<void> {
        const currentlyDone = this.isDone(date, periodType)
        await this.setDone(date, periodType, !currentlyDone)
    }

    /**
     * Subscribe to done reviews changes.
     * @returns Unsubscribe function
     */
    onDoneReviewsChange(callback: () => void): () => void {
        this.doneReviewsChangeCallbacks.add(callback)
        return () => {
            this.doneReviewsChangeCallbacks.delete(callback)
        }
    }

    /**
     * Notify all subscribers that done reviews have changed
     */
    private notifyDoneReviewsChanged(): void {
        for (const callback of this.doneReviewsChangeCallbacks) {
            callback()
        }
    }
}
