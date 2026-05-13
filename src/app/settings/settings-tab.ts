import {
    AbstractInputSuggest,
    App,
    FuzzySuggestModal,
    PluginSettingTab,
    Setting,
    TFile
} from 'obsidian'
import type { TextComponent, ToggleComponent } from 'obsidian'
import type JournalBasesPlugin from '../../main'
import type { PeriodType, PluginSettings } from '../types'
import { produce } from 'immer'
import type { Draft } from 'immer'
import { BUY_ME_A_COFFEE_BADGE_DATA_URL } from '../assets/buy-me-a-coffee'

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

class TemplateFileSuggest extends AbstractInputSuggest<TFile> {
    constructor(
        app: App,
        private inputEl: HTMLInputElement,
        private onChoose: (file: TFile) => void
    ) {
        super(app, inputEl)
    }

    protected override getSuggestions(query: string): TFile[] {
        const lower = query.toLowerCase()
        return this.app.vault
            .getFiles()
            .filter((f) => f.extension === 'md')
            .filter((f) => !lower || f.path.toLowerCase().includes(lower))
            .sort((a, b) => a.path.localeCompare(b.path))
            .slice(0, 50)
    }

    renderSuggestion(file: TFile, el: HTMLElement): void {
        el.setText(file.path)
    }

    override selectSuggestion(file: TFile): void {
        this.inputEl.value = file.path
        this.inputEl.trigger('input')
        this.onChoose(file)
        this.close()
    }
}

class TemplateFilePickerModal extends FuzzySuggestModal<TFile> {
    constructor(
        app: App,
        private onChoose: (file: TFile) => void
    ) {
        super(app)
        this.setPlaceholder('Search files...')
    }

    getItems(): TFile[] {
        return this.app.vault
            .getFiles()
            .filter((f) => f.extension === 'md')
            .sort((a, b) => a.path.localeCompare(b.path))
    }

    getItemText(file: TFile): string {
        return file.path
    }

    onChooseItem(file: TFile): void {
        this.onChoose(file)
    }
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

        // Show sync notice if settings are synced from Periodic Notes plugin
        if (this.plugin.isPeriodicNotesSynced) {
            this.renderSyncNotice(containerEl)
        }

        // Render period type sections
        const periodTypes: PeriodType[] = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']
        for (const periodType of periodTypes) {
            this.renderPeriodSection(containerEl, periodType)
        }

        // Render done status settings
        this.renderDoneStatusSection(containerEl)

        // Render support section
        this.renderSupportHeader(containerEl)
    }

    private renderSyncNotice(containerEl: HTMLElement): void {
        const noticeEl = containerEl.createDiv({ cls: 'setting-item mod-info jb-sync-notice' })
        noticeEl.createDiv({
            cls: 'setting-item-info',
            text: 'Settings are synced from the Periodic Notes plugin. Configure settings there to make changes.'
        })
    }

    private renderPeriodSection(containerEl: HTMLElement, periodType: PeriodType): void {
        const settings = this.plugin.settings[periodType]
        const isReadOnly = this.plugin.isPeriodicNotesSynced
        const isDisabled = !settings.enabled

        new Setting(containerEl).setName(PERIOD_LABELS[periodType]).setHeading()

        // Enabled toggle - always editable when not synced
        const enabledSetting = new Setting(containerEl).setName('Enabled')
        if (isReadOnly) {
            enabledSetting.setDesc('Synced from Periodic Notes plugin')
        }
        enabledSetting.addToggle((toggle) => {
            toggle.setValue(settings.enabled).setDisabled(isReadOnly)
            this.setToggleReadOnlyState(toggle, isReadOnly)
            if (!isReadOnly) {
                toggle.onChange(async (value) => {
                    await this.updateSettings((draft) => {
                        draft[periodType].enabled = value
                    })
                    // Re-render to update read-only states
                    this.display()
                })
            }
        })

        // Folder setting
        const folderSetting = new Setting(containerEl)
            .setName('Folder')
            .setDesc('Folder where notes are stored')
        folderSetting.addText((text) => {
            text.setPlaceholder('e.g., Journal/Daily').setValue(settings.folder)
            this.setReadOnlyState(text, isReadOnly || isDisabled)
            if (!isReadOnly && !isDisabled) {
                text.onChange(async (value) => {
                    await this.updateSettings((draft) => {
                        draft[periodType].folder = value
                    })
                })
            }
        })

        // Format setting
        const formatSetting = new Setting(containerEl)
            .setName('Format')
            .setDesc(`Moment.js format string (${PERIOD_FORMAT_HINTS[periodType]})`)
        formatSetting.addText((text) => {
            text.setPlaceholder(PERIOD_FORMAT_HINTS[periodType]).setValue(settings.format)
            this.setReadOnlyState(text, isReadOnly || isDisabled)
            if (!isReadOnly && !isDisabled) {
                text.onChange(async (value) => {
                    await this.updateSettings((draft) => {
                        draft[periodType].format = value
                    })
                })
            }
        })

        // Template setting with file selector
        const templateSetting = new Setting(containerEl)
            .setName('Template')
            .setDesc('Templater template file')

        // Add text input for display
        templateSetting.addText((text) => {
            text.setPlaceholder('Select a template file...').setValue(settings.template)
            this.setReadOnlyState(text, isReadOnly || isDisabled)

            if (!isReadOnly && !isDisabled) {
                new TemplateFileSuggest(this.app, text.inputEl, (file) => {
                    void this.updateSettings((draft) => {
                        draft[periodType].template = file.path
                    }).then(() => this.display())
                })

                text.onChange(async (value) => {
                    await this.updateSettings((draft) => {
                        draft[periodType].template = value
                    })
                })
            }
        })

        // Add browse button
        if (!isReadOnly && !isDisabled) {
            templateSetting.addButton((button) => {
                button.setIcon('folder').setTooltip('Browse for template file')
                button.onClick(() => {
                    new TemplateFilePickerModal(this.app, (file) => {
                        void this.updateSettings((draft) => {
                            draft[periodType].template = file.path
                        }).then(() => this.display())
                    }).open()
                })
            })
        }

        // Add clear button if template is set
        if (settings.template && !isReadOnly && !isDisabled) {
            templateSetting.addButton((button) => {
                button.setIcon('x').setTooltip('Clear template')
                button.onClick(async () => {
                    await this.updateSettings((draft) => {
                        draft[periodType].template = ''
                    })
                    this.display()
                })
            })
        }
    }

    private setReadOnlyState(text: TextComponent, readOnly: boolean): void {
        if (readOnly) {
            text.inputEl.disabled = true
            text.inputEl.classList.add('jb-input-readonly')
        }
    }

    private setToggleReadOnlyState(toggle: ToggleComponent, readOnly: boolean): void {
        if (readOnly) {
            toggle.toggleEl.classList.add('jb-input-readonly')
        }
    }

    private async updateSettings(updater: (draft: Draft<PluginSettings>) => void): Promise<void> {
        this.plugin.settings = produce(this.plugin.settings, updater)
        await this.plugin.saveSettings()
    }

    private renderDoneStatusSection(containerEl: HTMLElement): void {
        new Setting(containerEl).setName('Done status').setHeading()

        new Setting(containerEl)
            .setName('Property name')
            .setDesc('Frontmatter property name used to mark periodic notes as done')
            .addText((text) => {
                text.setPlaceholder('periodic_review_completed')
                    .setValue(this.plugin.settings.donePropertyName)
                    .onChange(async (value) => {
                        await this.updateSettings((draft) => {
                            draft.donePropertyName = value.trim() || 'periodic_review_completed'
                        })
                    })
            })
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
        imgEl.src = BUY_ME_A_COFFEE_BADGE_DATA_URL
        imgEl.alt = 'Buy me a coffee'
        imgEl.width = width
    }
}
