import { App, PluginSettingTab, Setting } from 'obsidian'
import type { TextComponent, ToggleComponent } from 'obsidian'
import type JournalBasesPlugin from '../../main'
import type { PeriodType, PluginSettings } from '../types'
import { produce } from 'immer'
import type { Draft } from 'immer'

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

        // Show sync notice if settings are synced from Periodic Notes plugin
        if (this.plugin.isPeriodicNotesSynced) {
            this.renderSyncNotice(containerEl)
        }

        // Render period type sections
        const periodTypes: PeriodType[] = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']
        for (const periodType of periodTypes) {
            this.renderPeriodSection(containerEl, periodType)
        }

        // Render support section
        this.renderSupportHeader(containerEl)
    }

    private renderSyncNotice(containerEl: HTMLElement): void {
        const noticeEl = containerEl.createDiv({ cls: 'setting-item mod-info' })
        noticeEl.createDiv({
            cls: 'setting-item-info',
            text: 'Settings are synced from the Periodic Notes plugin. Configure settings there to make changes.'
        })
        noticeEl.style.marginBottom = '1em'
        noticeEl.style.padding = '0.75em 1em'
        noticeEl.style.backgroundColor = 'var(--background-modifier-info)'
        noticeEl.style.borderRadius = 'var(--radius-s)'
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
            text.inputEl.style.cursor = isReadOnly || isDisabled ? 'not-allowed' : 'pointer'
            text.inputEl.readOnly = true // Always read-only, use button to select

            if (!isReadOnly && !isDisabled) {
                text.inputEl.addEventListener('click', () => {
                    this.openFileSuggester(periodType, text)
                })
            }
        })

        // Add browse button
        if (!isReadOnly && !isDisabled) {
            templateSetting.addButton((button) => {
                button.setIcon('folder').setTooltip('Browse for template file')
                button.onClick(() => {
                    this.openTemplateFilePicker(periodType)
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
            text.inputEl.style.opacity = '0.6'
            text.inputEl.style.cursor = 'not-allowed'
        }
    }

    private setToggleReadOnlyState(toggle: ToggleComponent, readOnly: boolean): void {
        if (readOnly) {
            toggle.toggleEl.style.opacity = '0.6'
            toggle.toggleEl.style.cursor = 'not-allowed'
        }
    }

    private openFileSuggester(periodType: PeriodType, textComponent: TextComponent): void {
        // Get all markdown files that could be templates
        const files = this.app.vault
            .getFiles()
            .filter((f) => f.extension === 'md')
            .sort((a, b) => a.path.localeCompare(b.path))

        // Create a simple dropdown menu
        const menu = document.createElement('div')
        menu.addClass('suggestion-container')
        menu.style.position = 'absolute'
        menu.style.zIndex = '1000'
        menu.style.maxHeight = '300px'
        menu.style.overflowY = 'auto'
        menu.style.backgroundColor = 'var(--background-primary)'
        menu.style.border = '1px solid var(--background-modifier-border)'
        menu.style.borderRadius = 'var(--radius-s)'
        menu.style.boxShadow = 'var(--shadow-s)'

        const rect = textComponent.inputEl.getBoundingClientRect()
        menu.style.top = `${rect.bottom + 5}px`
        menu.style.left = `${rect.left}px`
        menu.style.width = `${rect.width}px`

        // Filter for template-like files
        const templateFiles = files.filter(
            (f) =>
                f.path.toLowerCase().includes('template') || f.name.toLowerCase().startsWith('tpl')
        )

        const filesToShow = templateFiles.length > 0 ? templateFiles : files.slice(0, 50)

        for (const file of filesToShow) {
            const item = menu.createDiv({ cls: 'suggestion-item' })
            item.style.padding = '0.5em 0.75em'
            item.style.cursor = 'pointer'
            item.textContent = file.path
            item.addEventListener('mouseenter', () => {
                item.style.backgroundColor = 'var(--background-modifier-hover)'
            })
            item.addEventListener('mouseleave', () => {
                item.style.backgroundColor = ''
            })
            item.addEventListener('click', async () => {
                await this.updateSettings((draft) => {
                    draft[periodType].template = file.path
                })
                document.body.removeChild(menu)
                this.display()
            })
        }

        // Click outside to close
        const closeMenu = (e: MouseEvent): void => {
            if (!menu.contains(e.target as Node)) {
                if (menu.parentNode) {
                    document.body.removeChild(menu)
                }
                document.removeEventListener('click', closeMenu)
            }
        }

        document.body.appendChild(menu)
        setTimeout(() => document.addEventListener('click', closeMenu), 0)
    }

    private openTemplateFilePicker(periodType: PeriodType): void {
        // Get all markdown files
        const files = this.app.vault
            .getFiles()
            .filter((f) => f.extension === 'md')
            .sort((a, b) => a.path.localeCompare(b.path))

        // Create modal-like file picker
        const modal = document.createElement('div')
        modal.addClass('modal-container')
        modal.style.position = 'fixed'
        modal.style.inset = '0'
        modal.style.zIndex = '1000'
        modal.style.display = 'flex'
        modal.style.alignItems = 'center'
        modal.style.justifyContent = 'center'
        modal.style.backgroundColor = 'var(--background-modifier-cover)'

        const content = modal.createDiv({ cls: 'modal' })
        content.style.maxWidth = '600px'
        content.style.maxHeight = '80vh'
        content.style.display = 'flex'
        content.style.flexDirection = 'column'
        content.style.backgroundColor = 'var(--background-primary)'
        content.style.borderRadius = 'var(--radius-l)'
        content.style.overflow = 'hidden'

        // Header
        const header = content.createDiv()
        header.style.padding = '1em'
        header.style.borderBottom = '1px solid var(--background-modifier-border)'
        header.createEl('h3', { text: 'Select template file' }).style.margin = '0'

        // Search input
        const searchContainer = content.createDiv()
        searchContainer.style.padding = '0.75em'
        searchContainer.style.borderBottom = '1px solid var(--background-modifier-border)'
        const searchInput = searchContainer.createEl('input', {
            type: 'text',
            placeholder: 'Search files...'
        })
        searchInput.style.width = '100%'
        searchInput.style.padding = '0.5em'

        // File list
        const fileList = content.createDiv()
        fileList.style.flex = '1'
        fileList.style.overflowY = 'auto'
        fileList.style.padding = '0.5em'

        const renderFiles = (filter: string): void => {
            fileList.empty()
            const filtered = files.filter((f) =>
                f.path.toLowerCase().includes(filter.toLowerCase())
            )
            for (const file of filtered.slice(0, 100)) {
                const item = fileList.createDiv()
                item.style.padding = '0.5em 0.75em'
                item.style.cursor = 'pointer'
                item.style.borderRadius = 'var(--radius-s)'
                item.textContent = file.path
                item.addEventListener('mouseenter', () => {
                    item.style.backgroundColor = 'var(--background-modifier-hover)'
                })
                item.addEventListener('mouseleave', () => {
                    item.style.backgroundColor = ''
                })
                item.addEventListener('click', async () => {
                    await this.updateSettings((draft) => {
                        draft[periodType].template = file.path
                    })
                    document.body.removeChild(modal)
                    this.display()
                })
            }
        }

        searchInput.addEventListener('input', () => {
            renderFiles(searchInput.value)
        })

        renderFiles('')
        searchInput.focus()

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal)
            }
        })

        // Close on escape
        const handleEscape = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') {
                document.body.removeChild(modal)
                document.removeEventListener('keydown', handleEscape)
            }
        }
        document.addEventListener('keydown', handleEscape)

        document.body.appendChild(modal)
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
