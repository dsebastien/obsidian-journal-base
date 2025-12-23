import { Plugin } from 'obsidian'
import {
    DEFAULT_SETTINGS,
    DEFAULT_DONE_REVIEWS,
    PERIOD_TYPES,
    type PluginSettings,
    type DoneReviews,
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
     * Track which periodic reviews have been marked as done
     */
    doneReviews: DoneReviews = { ...DEFAULT_DONE_REVIEWS }

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
     * Load the plugin settings and done reviews
     */
    async loadSettings(): Promise<void> {
        log('Loading settings', 'debug')
        const loadedData = (await this.loadData()) as
            | (PluginSettings & { doneReviews?: DoneReviews })
            | null

        if (!loadedData) {
            log('Using default settings', 'debug')
            return
        }

        // Merge loaded settings with defaults to handle missing properties
        this.settings = produce(this.settings, (draft: Draft<PluginSettings>) => {
            for (const periodType of PERIOD_TYPES) {
                const loaded = loadedData[periodType]
                if (loaded) {
                    draft[periodType].enabled = loaded.enabled ?? false
                    draft[periodType].folder = loaded.folder ?? ''
                    draft[periodType].format = loaded.format ?? DEFAULT_SETTINGS[periodType].format
                    draft[periodType].template = loaded.template ?? ''
                }
            }
        })

        // Load done reviews if present
        if (loadedData.doneReviews) {
            this.doneReviews = {
                daily: { ...loadedData.doneReviews.daily },
                weekly: { ...loadedData.doneReviews.weekly },
                monthly: { ...loadedData.doneReviews.monthly },
                quarterly: { ...loadedData.doneReviews.quarterly },
                yearly: { ...loadedData.doneReviews.yearly }
            }
        }

        log('Settings loaded', 'debug', this.settings)
    }

    /**
     * Save the plugin settings and done reviews
     */
    async saveSettings(): Promise<void> {
        log('Saving settings', 'debug', this.settings)
        const dataToSave = {
            ...this.settings,
            doneReviews: this.doneReviews
        }
        await this.saveData(dataToSave)
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
    // ========================================

    /**
     * Check if a period is marked as done
     */
    isDone(date: Date, periodType: PeriodType): boolean {
        return isPeriodDone(this.doneReviews, date, periodType, this.settings)
    }

    /**
     * Mark a period as done or not done.
     * Cascades to all child periods (e.g., marking 2024 as done marks all quarters/months/weeks/days)
     */
    async setDone(date: Date, periodType: PeriodType, isDone: boolean): Promise<void> {
        this.doneReviews = markPeriodWithCascade(
            this.doneReviews,
            date,
            periodType,
            this.settings,
            isDone
        )
        await this.saveSettings()
        this.notifyDoneReviewsChanged()
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
