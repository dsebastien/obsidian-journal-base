import { App, PluginSettingTab, Setting } from 'obsidian'
import type JournalBasesPlugin from '../../main'
import type { PeriodType } from '../types/periodic-note.types'
import { produce } from 'immer'
import type { Draft } from 'immer'
import type { PluginSettings } from '../types/plugin-settings.intf'

const PERIOD_LABELS: Record<PeriodType, string> = {
    daily: 'Daily notes',
    weekly: 'Weekly notes',
    monthly: 'Monthly notes',
    quarterly: 'Quarterly notes',
    yearly: 'Yearly notes'
}

const PERIOD_FORMAT_HINTS: Record<PeriodType, string> = {
    daily: 'e.g., YYYY-MM-DD',
    weekly: 'e.g., gggg-[W]ww',
    monthly: 'e.g., YYYY-MM',
    quarterly: 'e.g., YYYY-[Q]Q',
    yearly: 'e.g., YYYY'
}

export class JournalBasesSettingTab extends PluginSettingTab {
    plugin: JournalBasesPlugin

    constructor(app: App, plugin: JournalBasesPlugin) {
        super(app, plugin)
        this.plugin = plugin
    }

    display(): void {
        const { containerEl } = this
        containerEl.empty()

        // Render period type sections
        const periodTypes: PeriodType[] = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']
        for (const periodType of periodTypes) {
            this.renderPeriodSection(containerEl, periodType)
        }

        // Render support section
        this.renderSupportHeader(containerEl)
    }

    private renderPeriodSection(containerEl: HTMLElement, periodType: PeriodType): void {
        const settings = this.plugin.settings[periodType]

        new Setting(containerEl).setName(PERIOD_LABELS[periodType]).setHeading()

        new Setting(containerEl).setName('Enabled').addToggle((toggle) =>
            toggle.setValue(settings.enabled).onChange(async (value) => {
                await this.updateSettings((draft) => {
                    draft[periodType].enabled = value
                })
            })
        )

        new Setting(containerEl)
            .setName('Folder')
            .setDesc('Folder where notes are stored')
            .addText((text) =>
                text
                    .setPlaceholder('e.g., Journal/Daily')
                    .setValue(settings.folder)
                    .onChange(async (value) => {
                        await this.updateSettings((draft) => {
                            draft[periodType].folder = value
                        })
                    })
            )

        new Setting(containerEl)
            .setName('Format')
            .setDesc(`Moment.js format string (${PERIOD_FORMAT_HINTS[periodType]})`)
            .addText((text) =>
                text
                    .setPlaceholder(PERIOD_FORMAT_HINTS[periodType])
                    .setValue(settings.format)
                    .onChange(async (value) => {
                        await this.updateSettings((draft) => {
                            draft[periodType].format = value
                        })
                    })
            )

        new Setting(containerEl)
            .setName('Template')
            .setDesc('Path to Templater template file')
            .addText((text) =>
                text
                    .setPlaceholder('e.g., Templates/Daily.md')
                    .setValue(settings.template)
                    .onChange(async (value) => {
                        await this.updateSettings((draft) => {
                            draft[periodType].template = value
                        })
                    })
            )
    }

    private async updateSettings(updater: (draft: Draft<PluginSettings>) => void): Promise<void> {
        this.plugin.settings = produce(this.plugin.settings, updater)
        await this.plugin.saveSettings()
    }

    private renderSupportHeader(containerEl: HTMLElement): void {
        new Setting(containerEl).setName('Support').setHeading()

        const supportDesc = new DocumentFragment()
        supportDesc.createDiv({
            text: 'Buy me a coffee to support the development of this plugin'
        })

        new Setting(containerEl).setDesc(supportDesc)

        this.renderBuyMeACoffeeBadge(containerEl)
        const spacing = containerEl.createDiv()
        spacing.classList.add('support-header-margin')
    }

    private renderBuyMeACoffeeBadge(contentEl: HTMLElement | DocumentFragment, width = 175): void {
        const linkEl = contentEl.createEl('a', {
            href: 'https://www.buymeacoffee.com/dsebastien'
        })
        const imgEl = linkEl.createEl('img')
        imgEl.src =
            'https://github.com/dsebastien/obsidian-plugin-template/blob/main/src/assets/buy-me-a-coffee.png?raw=true'
        imgEl.alt = 'Buy me a coffee'
        imgEl.width = width
    }
}
