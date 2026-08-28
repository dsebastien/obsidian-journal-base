import {
    AbstractInputSuggest,
    App,
    FuzzySuggestModal,
    Notice,
    PluginSettingTab,
    TFile
} from 'obsidian'
import type { Setting, SettingDefinitionItem, SettingGroupItem } from 'obsidian'
import type JournalBasesPlugin from '../../main'
import type { PeriodType } from '../types'
import { BUY_ME_A_COFFEE_BADGE_DATA_URL } from '../assets/buy-me-a-coffee'
import { renderSupportSection } from '../ui/support-links'

const PERIOD_TYPES: PeriodType[] = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']

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

/** The three per-period scalar fields edited through `<period>.<field>` keys. */
const PERIOD_FIELDS = ['enabled', 'folder', 'format', 'template'] as const
type PeriodField = (typeof PERIOD_FIELDS)[number]

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

/**
 * Settings tab, declared rather than rendered (Obsidian 1.13+).
 *
 * `getSettingDefinitions()` REPLACES `display()`: when it returns a non-empty
 * array, `display()` is never called. There is no partial adoption — the whole
 * settings UI is declarative, or none of it. In exchange, Obsidian owns
 * navigation, focus and ARIA, and every declared `name`/`desc` is indexed by
 * the settings search.
 *
 * Pane-specific shapes:
 *
 * - Periodic Notes sync: when `isPeriodicNotesSynced`, a notice banner shows
 *   (`visible:` predicate) and every period control is disabled through
 *   `disabled:` predicates. `setControlValue` ALSO rejects synced writes —
 *   the disabled state is UI, the rejection is the guarantee.
 * - A period's Folder/Format/Template rows are additionally disabled while
 *   the period itself is disabled. The Enabled toggle's write calls
 *   `refreshDomState()` so those predicates re-evaluate without a re-render.
 * - The Template row is a `render:` hook: it needs the inline
 *   `TemplateFileSuggest`, the browse modal, and the clear button. Its
 *   buttons re-sync the text input themselves instead of re-rendering.
 */
export class JournalBasesSettingTab extends PluginSettingTab {
    plugin: JournalBasesPlugin

    constructor(app: App, plugin: JournalBasesPlugin) {
        super(app, plugin)
        this.plugin = plugin
    }

    override getSettingDefinitions(): SettingDefinitionItem[] {
        return [
            {
                name: '',
                desc: 'Settings are synced from the Periodic Notes plugin. Configure settings there to make changes.',
                searchable: false,
                visible: (): boolean => this.plugin.isPeriodicNotesSynced,
                // The no-op render hook is load-bearing: the framework skips
                // a definition with neither control nor render.
                render: (setting): void => {
                    setting.settingEl.addClass('jb-sync-notice')
                }
            },
            ...PERIOD_TYPES.map((periodType) => this.periodGroup(periodType)),
            {
                type: 'group',
                heading: 'Done status',
                items: [
                    {
                        name: 'Property name',
                        desc: 'Frontmatter property name used to mark a periodic note as done',
                        control: {
                            type: 'text',
                            key: 'donePropertyName',
                            placeholder: 'periodic_review_completed'
                        }
                    }
                ]
            },
            {
                type: 'group',
                heading: 'Periodic Review',
                items: [
                    {
                        name: 'Collapse frontmatter',
                        desc: "Fold a note's YAML frontmatter when it opens in a Periodic Review column",
                        control: { type: 'toggle', key: 'collapseFrontmatter' }
                    },
                    {
                        name: 'Remember column state',
                        desc: "Remember each column's collapsed/expanded state in the Base view file and restore it when the view reopens",
                        control: { type: 'toggle', key: 'rememberColumnState' }
                    }
                ]
            },
            {
                type: 'group',
                heading: 'Troubleshooting',
                items: [
                    {
                        name: 'Debug logging',
                        desc: 'Write detailed plugin activity to the developer console. Keep this off unless you are investigating a problem.',
                        control: { type: 'toggle', key: 'debugModeEnabled' }
                    }
                ]
            },
            {
                type: 'group',
                // No heading: renderSupportSection draws its own.
                items: [
                    {
                        name: 'Support',
                        // Not a setting — keep it out of the settings search.
                        searchable: false,
                        render: (setting): void => {
                            setting.infoEl.remove() // the section draws its own headings
                            // `.setting-item` is a flex ROW. The support block
                            // is a stack of full-width rows, so without this it
                            // would lay heading, buttons and badge side by side.
                            setting.settingEl.addClass('jb-settings-embed')
                            renderSupportSection(setting.settingEl, (el) => {
                                this.renderBuyMeACoffeeBadge(el)
                            })
                        }
                    }
                ]
            }
        ]
    }

    // ─── Period sections ───────────────────────────────────────────────────

    private isSynced(): boolean {
        return this.plugin.isPeriodicNotesSynced
    }

    private isPeriodLocked(periodType: PeriodType): boolean {
        return this.isSynced() || !this.plugin.settings[periodType].enabled
    }

    private periodGroup(periodType: PeriodType): SettingDefinitionItem {
        // `disabled:` lives on the CONTROL object (SettingControlBase), not
        // on the definition. The Template row has no control, so its render
        // hook applies the locked state itself; the Enabled write triggers a
        // full update() so that row re-renders with fresh state.
        const items: SettingGroupItem[] = [
            {
                name: 'Enabled',
                desc: this.isSynced() ? 'Synced from Periodic Notes plugin' : undefined,
                control: {
                    type: 'toggle',
                    key: `${periodType}.enabled`,
                    disabled: (): boolean => this.isSynced()
                }
            },
            {
                name: 'Folder',
                desc: 'Folder where notes are stored',
                control: {
                    type: 'text',
                    key: `${periodType}.folder`,
                    placeholder: 'e.g., Journal/Daily',
                    disabled: (): boolean => this.isPeriodLocked(periodType)
                }
            },
            {
                name: 'Format',
                desc: `Moment.js format string (${PERIOD_FORMAT_HINTS[periodType]})`,
                control: {
                    type: 'text',
                    key: `${periodType}.format`,
                    placeholder: PERIOD_FORMAT_HINTS[periodType],
                    disabled: (): boolean => this.isPeriodLocked(periodType)
                }
            },
            {
                name: 'Template',
                desc: 'Templater template file',
                render: (setting): void => {
                    this.renderTemplateControls(setting, periodType)
                }
            }
        ]
        return { type: 'group', heading: PERIOD_LABELS[periodType], items }
    }

    /**
     * The template row: text input with inline file autocomplete, a browse
     * button opening the fuzzy picker, and a clear button.
     *
     * Two write flavors, matching the old tab:
     * - Typing writes per keystroke and NEVER touches the input on success —
     *   re-syncing after each queued save would clobber text typed while a
     *   slow write was in flight. Failure rolls back to the stored truth.
     * - Picks (suggest, browse) and clear re-render the pane on success,
     *   exactly as the old tab's display() calls did — which also keeps the
     *   conditional clear button in sync. Failure rolls the input back.
     */
    private renderTemplateControls(setting: Setting, periodType: PeriodType): void {
        let inputEl: HTMLInputElement | null = null

        const rollback = (): void => {
            if (inputEl) {
                inputEl.value = this.plugin.settings[periodType].template
            }
            new Notice('Failed to save settings.')
        }

        /** Keystroke write: fire-and-forget, input owns its value. */
        const writeTyped = (path: string): void => {
            void this.setTemplate(periodType, path).catch(rollback)
        }

        /** Pick/clear write: re-render on success so the row reflects it. */
        const writePicked = (path: string): void => {
            void this.setTemplate(periodType, path)
                .then(() => {
                    this.update()
                })
                .catch(rollback)
        }

        const locked = this.isPeriodLocked(periodType)

        setting.addText((text) => {
            inputEl = text.inputEl
            text.setPlaceholder('Select a template file...').setValue(
                this.plugin.settings[periodType].template
            )
            if (locked) {
                text.inputEl.disabled = true
                text.inputEl.classList.add('jb-input-readonly')
                return
            }
            new TemplateFileSuggest(this.app, text.inputEl, (file) => {
                writePicked(file.path)
            })
            text.onChange((value) => {
                writeTyped(value)
            })
        })

        if (locked) {
            return
        }

        setting.addButton((button) => {
            button.setIcon('folder').setTooltip('Browse for template file')
            button.onClick(() => {
                new TemplateFilePickerModal(this.app, (file) => {
                    writePicked(file.path)
                }).open()
            })
        })

        if (this.plugin.settings[periodType].template) {
            setting.addButton((button) => {
                button.setIcon('x').setTooltip('Clear template')
                button.onClick(() => {
                    writePicked('')
                })
            })
        }
    }

    /** Writes a period's template path; rejects while synced. */
    private async setTemplate(periodType: PeriodType, path: string): Promise<void> {
        if (this.isSynced()) {
            throw new Error('Settings are synced from the Periodic Notes plugin.')
        }
        await this.plugin.updateSettings((draft) => {
            draft[periodType].template = path
        })
    }

    // ─── Control values ────────────────────────────────────────────────────

    private parsePeriodKey(key: string): { period: PeriodType; field: PeriodField } | null {
        const dot = key.indexOf('.')
        if (dot <= 0) {
            return null
        }
        const period = key.slice(0, dot) as PeriodType
        const field = key.slice(dot + 1) as PeriodField
        if (!PERIOD_TYPES.includes(period) || !PERIOD_FIELDS.includes(field)) {
            return null
        }
        return { period, field }
    }

    /**
     * Reads the value behind a control `key`. Returning undefined/null makes
     * the framework fall back to the control's declared `defaultValue`.
     */
    override getControlValue(key: string): unknown {
        const periodKey = this.parsePeriodKey(key)
        if (periodKey) {
            return this.plugin.settings[periodKey.period][periodKey.field]
        }
        switch (key) {
            case 'donePropertyName':
                return this.plugin.settings.donePropertyName
            case 'collapseFrontmatter':
                return this.plugin.settings.collapseFrontmatter
            case 'rememberColumnState':
                return this.plugin.settings.rememberColumnState
            case 'debugModeEnabled':
                return this.plugin.settings.debugModeEnabled
            default:
                return undefined
        }
    }

    /**
     * Persists a control edit. Rejecting (not resolving) on failure is what
     * lets the framework roll the control back to the stored truth.
     *
     * Period writes reject while settings are synced from Periodic Notes —
     * the `disabled:` predicates are UI, this rejection is the guarantee.
     */
    override async setControlValue(key: string, value: unknown): Promise<void> {
        const periodKey = this.parsePeriodKey(key)
        if (periodKey) {
            if (this.isSynced()) {
                new Notice('Settings are synced from the Periodic Notes plugin.')
                throw new Error('Settings are synced from the Periodic Notes plugin.')
            }
            const { period, field } = periodKey
            if (field === 'enabled') {
                const next = this.expectBoolean(key, value)
                await this.plugin.updateSettings((draft) => {
                    draft[period].enabled = next
                })
                // The other rows' locked states depend on this value. The
                // declared controls' disabled: predicates could refresh in
                // place, but the Template render row cannot — re-render the
                // pane, exactly as the old tab did.
                this.update()
                return
            }
            const next = this.expectString(key, value)
            await this.plugin.updateSettings((draft) => {
                draft[period][field] = next
            })
            return
        }
        switch (key) {
            case 'donePropertyName': {
                const next = this.expectString(key, value).trim() || 'periodic_review_completed'
                await this.plugin.updateSettings((draft) => {
                    draft.donePropertyName = next
                })
                return
            }
            case 'collapseFrontmatter': {
                const next = this.expectBoolean(key, value)
                await this.plugin.updateSettings((draft) => {
                    draft.collapseFrontmatter = next
                })
                return
            }
            case 'rememberColumnState': {
                const next = this.expectBoolean(key, value)
                await this.plugin.updateSettings((draft) => {
                    draft.rememberColumnState = next
                })
                return
            }
            case 'debugModeEnabled': {
                const next = this.expectBoolean(key, value)
                await this.plugin.updateSettings((draft) => {
                    draft.debugModeEnabled = next
                })
                return
            }
            default:
                new Notice('Failed to save settings.')
                throw new Error(`Setting "${key}" does not address a known field.`)
        }
    }

    /** Rejects rather than coerces: a bad value must not reach the store. */
    private expectBoolean(key: string, value: unknown): boolean {
        if (typeof value !== 'boolean') {
            throw new Error(`Setting "${key}" expects a boolean.`)
        }
        return value
    }

    /** Rejects rather than coerces: a bad value must not reach the store. */
    private expectString(key: string, value: unknown): string {
        if (typeof value !== 'string') {
            throw new Error(`Setting "${key}" expects a string.`)
        }
        return value
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
