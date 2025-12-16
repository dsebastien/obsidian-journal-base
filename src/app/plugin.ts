import { Plugin } from 'obsidian'
import { DEFAULT_SETTINGS } from './types/plugin-settings.intf'
import type { PluginSettings } from './types/plugin-settings.intf'
import { JournalBasesSettingTab } from './settings/settings-tab'
import { log } from '../utils/log'
import { produce } from 'immer'
import type { Draft } from 'immer'

export class JournalBasesPlugin extends Plugin {
    /**
     * The plugin settings are immutable
     */
    settings: PluginSettings = produce(DEFAULT_SETTINGS, () => DEFAULT_SETTINGS)

    /**
     * Executed as soon as the plugin loads
     */
    override async onload() {
        log('Initializing', 'debug')
        await this.loadSettings()

        // Add a settings screen for the plugin
        this.addSettingTab(new JournalBasesSettingTab(this.app, this))
    }

    override onunload() {}

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
            const periodTypes = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const
            for (const periodType of periodTypes) {
                const loaded = loadedSettings[periodType]
                if (loaded) {
                    draft[periodType].enabled = loaded.enabled ?? false
                    draft[periodType].folder = loaded.folder ?? ''
                    draft[periodType].format = loaded.format ?? DEFAULT_SETTINGS[periodType].format
                    draft[periodType].template = loaded.template ?? ''
                }
            }
        })

        log('Settings loaded', 'debug', this.settings)
    }

    /**
     * Save the plugin settings
     */
    async saveSettings() {
        log('Saving settings', 'debug', this.settings)
        await this.saveData(this.settings)
        log('Settings saved', 'debug', this.settings)
    }
}
