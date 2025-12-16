# Periodic Notes Plugin - Implementation Plan

## Goal

Two custom Obsidian Base view types for periodic notes (daily/weekly/monthly/quarterly/yearly):

1. **Periodic Notes View**: Timeline of collapsible note cards with mode switching
2. **Periodic Review View**: Side-by-side columns (Andy Matuschak style) for cross-referencing

---

## Phase 1: Foundation

### 1.1 Rename Plugin

- `MyPlugin` → `PeriodicNotesPlugin` (`src/app/plugin.ts`)
- `MyPluginSettingTab` → `PeriodicNotesSettingTab` (`src/app/settings/settings-tab.ts`)
- Update export in `src/main.ts`

### 1.2 Types Definition

`src/app/types/periodic-note.types.ts`:

```typescript
export type PeriodType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export interface PeriodicNoteConfig {
    enabled: boolean
    folder: string
    format: string // moment.js format, e.g., "YYYY/WW/YYYY-MM-DD"
    template: string // vault path to Templater template
}

export type PeriodicNotesSettings = Record<PeriodType, PeriodicNoteConfig>
```

`src/app/types/plugin-settings.intf.ts`:

```typescript
import type { PeriodicNotesSettings } from './periodic-note.types'

export interface PluginSettings extends PeriodicNotesSettings {
    // Additional plugin-wide settings can go here
}

export const DEFAULT_SETTINGS: PluginSettings = {
    daily: { enabled: false, folder: '', format: 'YYYY-MM-DD', template: '' },
    weekly: { enabled: false, folder: '', format: 'gggg-[W]ww', template: '' },
    monthly: { enabled: false, folder: '', format: 'YYYY-MM', template: '' },
    quarterly: { enabled: false, folder: '', format: 'YYYY-[Q]Q', template: '' },
    yearly: { enabled: false, folder: '', format: 'YYYY', template: '' }
}
```

### 1.3 Plugin Integration Service

`src/app/services/plugin-integration.service.ts`:

```typescript
import { App, Notice } from 'obsidian'
import type { PluginSettings } from '../types/plugin-settings.intf'

export class PluginIntegrationService {
    constructor(private app: App) {}

    // Check if periodic-notes plugin is installed and enabled
    isPeriodicNotesPluginEnabled(): boolean {
        return this.app.plugins.enabledPlugins.has('periodic-notes')
    }

    // Get settings from periodic-notes plugin
    getPeriodicNotesSettings(): Partial<PluginSettings> | null {
        if (!this.isPeriodicNotesPluginEnabled()) return null
        const plugin = this.app.plugins.getPlugin('periodic-notes')
        return plugin?.settings ?? null
    }

    // Subscribe to periodic-notes settings changes
    // Event: this.app.workspace.on('periodic-notes:settings-updated', callback)

    // Check Templater
    isTemplaterEnabled(): boolean {
        return this.app.plugins.enabledPlugins.has('templater-obsidian')
    }

    showTemplaterMissingNotice(): void {
        new Notice('Templater plugin is required for template support', 5000)
    }
}
```

### 1.4 Settings Tab

`src/app/settings/settings-tab.ts` - Use Obsidian's `Setting` class:

```typescript
import { Setting, PluginSettingTab } from 'obsidian'

// Per period type section:
new Setting(containerEl).setName('Daily notes').setHeading()

new Setting(containerEl).setName('Enabled').addToggle((toggle) =>
    toggle.setValue(settings.daily.enabled).onChange(async (value) => {
        /* update settings */
    })
)

new Setting(containerEl).setName('Folder').addText((text) =>
    text.setValue(settings.daily.folder).onChange(async (value) => {
        /* update settings */
    })
)

// For folder/template pickers, use AbstractInputSuggest or FuzzySuggestModal
```

---

## Phase 2: Utilities

### 2.1 Date Utilities

`src/utils/date-utils.ts` - Use Obsidian's built-in `moment`:

```typescript
import { moment } from 'obsidian'

export function parseDateFromFormat(filename: string, format: string): moment.Moment | null {
    const parsed = moment(filename, format, true)
    return parsed.isValid() ? parsed : null
}

export function formatDate(date: moment.Moment, format: string): string {
    return date.format(format)
}

export function getNextPeriod(date: moment.Moment, periodType: PeriodType): moment.Moment {
    const unitMap: Record<PeriodType, moment.unitOfTime.DurationConstructor> = {
        daily: 'day',
        weekly: 'week',
        monthly: 'month',
        quarterly: 'quarter',
        yearly: 'year'
    }
    return date.clone().add(1, unitMap[periodType])
}

export function generateDateRange(
    start: moment.Moment,
    end: moment.Moment,
    periodType: PeriodType
): moment.Moment[] {
    const dates: moment.Moment[] = []
    const current = start.clone()
    const unitMap = {
        daily: 'day',
        weekly: 'week',
        monthly: 'month',
        quarterly: 'quarter',
        yearly: 'year'
    }
    while (current.isSameOrBefore(end)) {
        dates.push(current.clone())
        current.add(1, unitMap[periodType])
    }
    return dates
}

export function findMissingDates(
    existingDates: moment.Moment[],
    periodType: PeriodType,
    futureCount: number = 0
): moment.Moment[] {
    // Sort existing dates
    // Generate expected range from min to max (+ futureCount periods)
    // Return dates not in existingDates
}
```

### 2.2 Periodic Note Utilities

`src/utils/periodic-note-utils.ts`:

```typescript
import { TFile } from 'obsidian'
import type { BasesEntry } from 'obsidian'
import type { PluginSettings, PeriodType, PeriodicNoteConfig } from '../app/types'

export function detectPeriodType(file: TFile, settings: PluginSettings): PeriodType | null {
    // Check if file.path starts with any configured folder
    for (const [type, config] of Object.entries(settings)) {
        if (config.enabled && file.path.startsWith(config.folder)) {
            return type as PeriodType
        }
    }
    return null
}

export function extractDateFromNote(file: TFile, config: PeriodicNoteConfig): moment.Moment | null {
    // Extract filename without extension, parse with config.format
    const basename = file.basename
    return parseDateFromFormat(basename, config.format)
}

export function groupEntriesByPeriod(
    entries: BasesEntry[],
    settings: PluginSettings
): Map<PeriodType, BasesEntry[]> {
    const groups = new Map<PeriodType, BasesEntry[]>()
    for (const entry of entries) {
        const type = detectPeriodType(entry.file, settings)
        if (type) {
            if (!groups.has(type)) groups.set(type, [])
            groups.get(type)!.push(entry)
        }
    }
    return groups
}

export function getExpectedFilePath(date: moment.Moment, config: PeriodicNoteConfig): string {
    const filename = formatDate(date, config.format)
    return `${config.folder}/${filename}.md`
}
```

---

## Phase 3: Periodic Notes View

### 3.1 Constants

`src/app/views/periodic-notes/periodic-notes.constants.ts`:

```typescript
export const PERIODIC_NOTES_VIEW_TYPE = 'periodic-notes'
```

### 3.2 View Options

`src/app/views/periodic-notes/periodic-notes-options.ts`:

```typescript
import type { ViewOption, DropdownOption, SliderOption, ToggleOption } from 'obsidian'

export function getPeriodicNotesViewOptions(): ViewOption[] {
    return [
        {
            type: 'dropdown',
            key: 'mode',
            displayName: 'Period type',
            default: 'daily',
            options: {
                daily: 'Daily',
                weekly: 'Weekly',
                monthly: 'Monthly',
                quarterly: 'Quarterly',
                yearly: 'Yearly'
            }
        } as DropdownOption,
        {
            type: 'slider',
            key: 'futurePeriods',
            displayName: 'Future periods to show',
            min: 0,
            max: 12,
            step: 1,
            default: 3
        } as SliderOption,
        {
            type: 'toggle',
            key: 'expandFirst',
            displayName: 'Expand first card',
            default: true
        } as ToggleOption
    ]
}
```

### 3.3 View Implementation

`src/app/views/periodic-notes/periodic-notes-view.ts`:

```typescript
import { BasesView, QueryController, BasesEntry, MarkdownRenderer, TFile } from 'obsidian'
import type PeriodicNotesPlugin from '../../../main'
import { PERIODIC_NOTES_VIEW_TYPE } from './periodic-notes.constants'

export class PeriodicNotesView extends BasesView {
    type = PERIODIC_NOTES_VIEW_TYPE

    private plugin: PeriodicNotesPlugin
    private containerEl: HTMLElement

    constructor(controller: QueryController, scrollEl: HTMLElement, plugin: PeriodicNotesPlugin) {
        super(controller)
        this.plugin = plugin
        this.containerEl = scrollEl.createDiv({ cls: 'periodic-notes-view' })
    }

    override onDataUpdated(): void {
        this.containerEl.empty()

        // Get current mode from view config
        const mode = (this.config.get('mode') as string) ?? 'daily'
        const futurePeriods = (this.config.get('futurePeriods') as number) ?? 3
        const expandFirst = (this.config.get('expandFirst') as boolean) ?? true

        // Check if mode is enabled in plugin settings
        const periodConfig = this.plugin.settings[mode]
        if (!periodConfig?.enabled) {
            this.renderEmptyState('Configure this period type in plugin settings')
            return
        }

        // Filter entries by current mode
        const entries = this.data.data.filter(
            (entry) => detectPeriodType(entry.file, this.plugin.settings) === mode
        )

        if (entries.length === 0) {
            this.renderEmptyState('No notes found. Check Base filters.')
            return
        }

        // Render mode tabs
        this.renderModeTabs(mode)

        // Find missing dates (gaps + future)
        const existingDates = entries.map((e) => extractDateFromNote(e.file, periodConfig))
        const missingDates = findMissingDates(existingDates, mode, futurePeriods)

        // Merge and sort all dates
        // Render cards for each date (existing or missing)
        this.renderCards(entries, missingDates, periodConfig, expandFirst)
    }

    private renderModeTabs(currentMode: string): void {
        const tabsEl = this.containerEl.createDiv({ cls: 'pn-mode-tabs' })
        const modes = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']

        for (const mode of modes) {
            if (!this.plugin.settings[mode]?.enabled) continue
            const tab = tabsEl.createEl('button', {
                cls: `pn-tab ${mode === currentMode ? 'pn-tab--active' : ''}`,
                text: mode.charAt(0).toUpperCase() + mode.slice(1)
            })
            tab.onclick = () => {
                this.config.set('mode', mode)
                this.onDataUpdated()
            }
        }
    }

    private renderCards(
        entries: BasesEntry[],
        missingDates: moment.Moment[],
        config: PeriodicNoteConfig,
        expandFirst: boolean
    ): void {
        const cardsEl = this.containerEl.createDiv({ cls: 'pn-cards' })

        // For existing entries
        entries.forEach((entry, index) => {
            this.renderNoteCard(cardsEl, entry, index === 0 && expandFirst)
        })

        // For missing dates
        missingDates.forEach((date) => {
            this.renderMissingCard(cardsEl, date, config)
        })
    }

    private async renderNoteCard(
        container: HTMLElement,
        entry: BasesEntry,
        expanded: boolean
    ): void {
        const card = container.createDiv({ cls: `pn-card ${expanded ? 'pn-card--expanded' : ''}` })
        const header = card.createDiv({ cls: 'pn-card__header' })
        header.createSpan({ text: entry.file.basename })

        const content = card.createDiv({ cls: 'pn-card__content' })

        if (expanded) {
            // Render preview using MarkdownRenderer.render()
            const fileContent = await this.app.vault.cachedRead(entry.file)
            await MarkdownRenderer.render(this.app, fileContent, content, entry.file.path, this)
        }

        header.onclick = () => {
            card.classList.toggle('pn-card--expanded')
            if (card.classList.contains('pn-card--expanded') && content.childElementCount === 0) {
                // Lazy load content
                this.loadCardContent(entry.file, content)
            }
        }
    }

    private renderMissingCard(
        container: HTMLElement,
        date: moment.Moment,
        config: PeriodicNoteConfig
    ): void {
        const card = container.createDiv({ cls: 'pn-card pn-card--missing' })
        card.createSpan({ text: formatDate(date, config.format) })

        const createBtn = card.createEl('button', {
            cls: 'pn-create-btn',
            text: 'Create'
        })
        createBtn.onclick = () => this.createNote(date, config)
    }

    private renderEmptyState(message: string): void {
        this.containerEl.createDiv({
            cls: 'pn-empty-state',
            text: message
        })
    }
}
```

### 3.4 Note Creation Service

`src/app/services/note-creation.service.ts`:

```typescript
import { App, TFile, TFolder, Notice } from 'obsidian'
import type { PeriodicNoteConfig } from '../types/periodic-note.types'

export class NoteCreationService {
    constructor(private app: App) {}

    async createPeriodicNote(
        date: moment.Moment,
        config: PeriodicNoteConfig
    ): Promise<TFile | null> {
        const filePath = getExpectedFilePath(date, config)

        // Ensure folder exists
        const folderPath = filePath.substring(0, filePath.lastIndexOf('/'))
        await this.ensureFolderExists(folderPath)

        // Create empty file
        const file = await this.app.vault.create(filePath, '')

        // Apply Templater template if configured
        if (config.template) {
            await this.applyTemplaterTemplate(file, config.template)
        }

        return file
    }

    private async ensureFolderExists(path: string): Promise<void> {
        const folder = this.app.vault.getFolderByPath(path)
        if (!folder) {
            await this.app.vault.createFolder(path)
        }
    }

    private async applyTemplaterTemplate(file: TFile, templatePath: string): Promise<void> {
        const templater = this.app.plugins.getPlugin('templater-obsidian')
        if (!templater) {
            new Notice('Templater plugin not found')
            return
        }

        // Open the file first (Templater requires active file)
        await this.app.workspace.getLeaf().openFile(file)

        // Get template file
        const templateFile = this.app.vault.getFileByPath(templatePath)
        if (!templateFile) {
            new Notice(`Template not found: ${templatePath}`)
            return
        }

        // Apply template using Templater API
        // templater.templater.append_template_to_active_file(templateFile)
    }
}
```

### 3.5 View Registration

In `src/app/plugin.ts`:

```typescript
import { PERIODIC_NOTES_VIEW_TYPE } from './views/periodic-notes/periodic-notes.constants'
import { PeriodicNotesView } from './views/periodic-notes/periodic-notes-view'
import { getPeriodicNotesViewOptions } from './views/periodic-notes/periodic-notes-options'

override async onload() {
    // ... load settings ...

    // Register Base view
    const registered = this.registerBasesView(PERIODIC_NOTES_VIEW_TYPE, {
        name: 'Periodic Notes',
        icon: 'calendar',
        factory: (controller, containerEl) => new PeriodicNotesView(controller, containerEl, this),
        options: getPeriodicNotesViewOptions,
    })

    if (!registered) {
        console.warn('Bases feature is not enabled in this vault')
    }
}
```

---

## Phase 4: Periodic Review View

### 4.1 Constants

`src/app/views/periodic-review/periodic-review.constants.ts`:

```typescript
export const PERIODIC_REVIEW_VIEW_TYPE = 'periodic-review'
```

### 4.2 View Options

`src/app/views/periodic-review/periodic-review-options.ts`:

```typescript
import type { ViewOption, ToggleOption, GroupOption } from 'obsidian'

export function getPeriodicReviewViewOptions(): ViewOption[] {
    return [
        {
            type: 'toggle',
            key: 'showDaily',
            displayName: 'Show daily column',
            default: true
        } as ToggleOption,
        {
            type: 'toggle',
            key: 'showWeekly',
            displayName: 'Show weekly column',
            default: true
        } as ToggleOption
        // ... more column toggles
    ]
}
```

### 4.3 View Implementation

`src/app/views/periodic-review/periodic-review-view.ts`:

```typescript
import { BasesView, QueryController, BasesEntry } from 'obsidian'
import { PERIODIC_REVIEW_VIEW_TYPE } from './periodic-review.constants'

export class PeriodicReviewView extends BasesView {
    type = PERIODIC_REVIEW_VIEW_TYPE

    private plugin: PeriodicNotesPlugin
    private containerEl: HTMLElement
    private selectedPeriods: Map<PeriodType, moment.Moment> = new Map()

    constructor(controller: QueryController, scrollEl: HTMLElement, plugin: PeriodicNotesPlugin) {
        super(controller)
        this.plugin = plugin
        this.containerEl = scrollEl.createDiv({ cls: 'periodic-review-view' })
    }

    override onDataUpdated(): void {
        this.containerEl.empty()

        // Group entries by period type
        const grouped = groupEntriesByPeriod(this.data.data, this.plugin.settings)

        // Render columns for each enabled type
        const columnsEl = this.containerEl.createDiv({ cls: 'pr-columns' })
        const order: PeriodType[] = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']

        for (const type of order) {
            if (!this.plugin.settings[type]?.enabled) continue
            const entries = grouped.get(type) ?? []
            this.renderColumn(columnsEl, type, entries)
        }
    }

    private renderColumn(container: HTMLElement, type: PeriodType, entries: BasesEntry[]): void {
        const column = container.createDiv({ cls: 'pr-column' })

        // Header with fold toggle
        const header = column.createDiv({ cls: 'pr-column__header' })
        header.createSpan({ text: type.charAt(0).toUpperCase() + type.slice(1) })

        // Period selector (list of available periods)
        const selector = column.createDiv({ cls: 'pr-column__selector' })
        this.renderPeriodSelector(selector, type, entries)

        // Content area for selected period's note
        const content = column.createDiv({ cls: 'pr-column__content' })
        this.renderSelectedPeriodContent(content, type, entries)
    }

    private renderPeriodSelector(
        container: HTMLElement,
        type: PeriodType,
        entries: BasesEntry[]
    ): void {
        // Extract dates from entries
        const config = this.plugin.settings[type]
        const dates = entries
            .map((e) => ({ entry: e, date: extractDateFromNote(e.file, config) }))
            .filter((d) => d.date !== null)
            .sort((a, b) => b.date!.valueOf() - a.date!.valueOf())

        // Add future dates
        const futureDates = getFuturePeriods(type, 4) // Next 4 periods

        // Render selectable items
        for (const item of [...futureDates.map((d) => ({ date: d, entry: null })), ...dates]) {
            const el = container.createDiv({
                cls: 'pr-period-item',
                text: formatDate(item.date!, config.format)
            })
            el.onclick = () => {
                this.selectedPeriods.set(type, item.date!)
                this.onDataUpdated()
            }
        }
    }

    private async renderSelectedPeriodContent(
        container: HTMLElement,
        type: PeriodType,
        entries: BasesEntry[]
    ): Promise<void> {
        const selected = this.selectedPeriods.get(type)
        if (!selected) {
            // Auto-select most recent
            const config = this.plugin.settings[type]
            const mostRecent = entries
                .map((e) => extractDateFromNote(e.file, config))
                .filter((d) => d !== null)
                .sort((a, b) => b!.valueOf() - a!.valueOf())[0]
            if (mostRecent) this.selectedPeriods.set(type, mostRecent)
        }

        // Find matching entry
        const config = this.plugin.settings[type]
        const entry = entries.find((e) => {
            const date = extractDateFromNote(e.file, config)
            return date?.isSame(this.selectedPeriods.get(type), 'day')
        })

        if (entry) {
            // Render note content with section copy buttons
            await this.renderNoteWithSectionCopy(container, entry)
        } else {
            // Show create button
            this.renderCreateButton(container, type, this.selectedPeriods.get(type)!)
        }
    }

    private async renderNoteWithSectionCopy(
        container: HTMLElement,
        entry: BasesEntry
    ): Promise<void> {
        const content = await this.app.vault.cachedRead(entry.file)

        // Parse sections (## headers)
        const sections = this.parseSections(content)

        for (const section of sections) {
            const sectionEl = container.createDiv({ cls: 'pr-section' })
            const headerEl = sectionEl.createDiv({ cls: 'pr-section__header' })
            headerEl.createSpan({ text: section.title })

            // Copy button if matching sections exist elsewhere
            const copyBtn = headerEl.createEl('button', { cls: 'pr-copy-btn', text: 'Copy to...' })
            copyBtn.onclick = () => this.showCopyTargets(section, entry)

            // Section content
            await MarkdownRenderer.render(
                this.app,
                section.content,
                sectionEl.createDiv({ cls: 'pr-section__content' }),
                entry.file.path,
                this
            )
        }
    }

    private parseSections(content: string): Array<{ title: string; content: string }> {
        // Parse markdown headers (##) and their content
        const sections: Array<{ title: string; content: string }> = []
        const lines = content.split('\n')
        let currentSection: { title: string; content: string } | null = null

        for (const line of lines) {
            const headerMatch = line.match(/^##\s+(.+)$/)
            if (headerMatch) {
                if (currentSection) sections.push(currentSection)
                currentSection = { title: headerMatch[1]!, content: '' }
            } else if (currentSection) {
                currentSection.content += line + '\n'
            }
        }
        if (currentSection) sections.push(currentSection)

        return sections
    }

    private async showCopyTargets(
        section: { title: string; content: string },
        sourceEntry: BasesEntry
    ): Promise<void> {
        // Find other notes with matching section header
        // Show menu to select target
        // Append content to target section using vault.process()
    }
}
```

---

## Phase 5: UI Components

`src/app/components/`:

### note-card.ts

```typescript
import { MarkdownRenderer, TFile, Component } from 'obsidian'

export class NoteCard extends Component {
    private containerEl: HTMLElement
    private contentEl: HTMLElement
    private expanded: boolean = false
    private contentLoaded: boolean = false

    constructor(
        parent: HTMLElement,
        private app: App,
        private file: TFile,
        initiallyExpanded: boolean = false
    ) {
        super()
        this.expanded = initiallyExpanded
        this.render(parent)
    }

    private render(parent: HTMLElement): void {
        this.containerEl = parent.createDiv({
            cls: `pn-card ${this.expanded ? 'pn-card--expanded' : ''}`
        })

        const header = this.containerEl.createDiv({ cls: 'pn-card__header' })
        header.createSpan({ cls: 'pn-card__title', text: this.file.basename })

        const toggleIcon = header.createSpan({ cls: 'pn-card__toggle' })
        // Add chevron icon

        this.contentEl = this.containerEl.createDiv({ cls: 'pn-card__content' })

        // Click to toggle
        this.registerDomEvent(header, 'click', () => this.toggle())

        // Load content if initially expanded
        if (this.expanded) this.loadContent()
    }

    toggle(): void {
        this.expanded = !this.expanded
        this.containerEl.classList.toggle('pn-card--expanded', this.expanded)
        if (this.expanded && !this.contentLoaded) {
            this.loadContent()
        }
    }

    private async loadContent(): Promise<void> {
        // Preview mode
        const content = await this.app.vault.cachedRead(this.file)
        await MarkdownRenderer.render(this.app, content, this.contentEl, this.file.path, this)
        this.contentLoaded = true
    }
}
```

### create-note-button.ts

```typescript
export class CreateNoteButton {
    constructor(
        parent: HTMLElement,
        date: moment.Moment,
        config: PeriodicNoteConfig,
        onClick: () => void
    ) {
        const btn = parent.createEl('button', { cls: 'pn-create-btn' })
        btn.createSpan({ cls: 'pn-create-btn__icon' }) // Plus icon
        btn.createSpan({
            cls: 'pn-create-btn__text',
            text: `Create ${formatDate(date, config.format)}`
        })
        btn.onclick = onClick
    }
}
```

### period-tabs.ts

```typescript
export class PeriodTabs {
    constructor(
        parent: HTMLElement,
        modes: PeriodType[],
        currentMode: PeriodType,
        onChange: (mode: PeriodType) => void
    ) {
        const container = parent.createDiv({ cls: 'pn-tabs' })
        for (const mode of modes) {
            const tab = container.createEl('button', {
                cls: `pn-tab ${mode === currentMode ? 'pn-tab--active' : ''}`,
                text: mode.charAt(0).toUpperCase() + mode.slice(1)
            })
            tab.onclick = () => onChange(mode)
        }
    }
}
```

### foldable-column.ts

```typescript
export class FoldableColumn extends Component {
    private folded: boolean = false
    private containerEl: HTMLElement
    private contentEl: HTMLElement

    constructor(parent: HTMLElement, title: string) {
        super()
        this.containerEl = parent.createDiv({ cls: 'pr-column' })

        const header = this.containerEl.createDiv({ cls: 'pr-column__header' })
        header.createSpan({ text: title })

        const foldBtn = header.createEl('button', { cls: 'pr-column__fold-btn' })
        this.registerDomEvent(foldBtn, 'click', () => this.toggleFold())

        this.contentEl = this.containerEl.createDiv({ cls: 'pr-column__content' })
    }

    toggleFold(): void {
        this.folded = !this.folded
        this.containerEl.classList.toggle('pr-column--folded', this.folded)
    }

    getContentEl(): HTMLElement {
        return this.contentEl
    }
}
```

---

## Phase 6: Styles

`src/styles.src.css`:

```css
/* ===== Periodic Notes View ===== */
.periodic-notes-view {
    @apply flex flex-col gap-4 p-4;
}

.pn-mode-tabs {
    @apply flex gap-2 mb-4;
}

.pn-tab {
    @apply px-3 py-1.5 rounded cursor-pointer transition-all duration-150;
    background-color: var(--background-secondary);
    color: var(--text-muted);
}

.pn-tab:hover {
    background-color: var(--background-modifier-hover);
}

.pn-tab--active {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
}

/* Note Cards */
.pn-card {
    @apply rounded border overflow-hidden;
    background-color: var(--background-primary);
    border-color: var(--background-modifier-border);
}

.pn-card__header {
    @apply flex items-center justify-between px-4 py-3 cursor-pointer;
    background-color: var(--background-secondary);
}

.pn-card__header:hover {
    background-color: var(--background-modifier-hover);
}

.pn-card__content {
    @apply hidden px-4 py-3;
}

.pn-card--expanded .pn-card__content {
    @apply block;
}

.pn-card--missing {
    @apply opacity-60;
    border-style: dashed;
}

/* Create Button */
.pn-create-btn {
    @apply flex items-center gap-2 px-4 py-2 rounded cursor-pointer;
    @apply transition-all duration-150 font-medium;
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
}

.pn-create-btn:hover {
    @apply opacity-90;
}

/* Empty State */
.pn-empty-state {
    @apply text-center py-8;
    color: var(--text-muted);
}

/* ===== Periodic Review View ===== */
.periodic-review-view {
    @apply h-full overflow-hidden;
}

.pr-columns {
    @apply flex h-full;
}

.pr-column {
    @apply flex flex-col border-r min-w-[300px];
    @apply transition-all duration-200;
    border-color: var(--background-modifier-border);
}

.pr-column--folded {
    @apply min-w-[40px] w-[40px];
}

.pr-column__header {
    @apply flex items-center justify-between px-3 py-2;
    background-color: var(--background-secondary);
}

.pr-column__selector {
    @apply flex-shrink-0 overflow-y-auto max-h-[200px] border-b;
    border-color: var(--background-modifier-border);
}

.pr-column__content {
    @apply flex-1 overflow-y-auto p-3;
}

.pr-period-item {
    @apply px-3 py-1.5 cursor-pointer;
}

.pr-period-item:hover {
    background-color: var(--background-modifier-hover);
}

.pr-period-item--selected {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
}

/* Section Copy */
.pr-section {
    @apply mb-4;
}

.pr-section__header {
    @apply flex items-center justify-between mb-2;
}

.pr-copy-btn {
    @apply text-sm px-2 py-1 rounded;
    background-color: var(--background-modifier-hover);
}
```

---

## File Structure (Final)

```
src/
├── main.ts
├── app/
│   ├── plugin.ts
│   ├── services/
│   │   ├── plugin-integration.service.ts
│   │   └── note-creation.service.ts
│   ├── settings/
│   │   └── settings-tab.ts
│   ├── types/
│   │   ├── plugin-settings.intf.ts
│   │   └── periodic-note.types.ts
│   ├── views/
│   │   ├── periodic-notes/
│   │   │   ├── periodic-notes-view.ts
│   │   │   ├── periodic-notes-options.ts
│   │   │   └── periodic-notes.constants.ts
│   │   └── periodic-review/
│   │       ├── periodic-review-view.ts
│   │       ├── periodic-review-options.ts
│   │       └── periodic-review.constants.ts
│   └── components/
│       ├── note-card.ts
│       ├── create-note-button.ts
│       ├── period-tabs.ts
│       └── foldable-column.ts
├── utils/
│   ├── log.ts
│   ├── date-utils.ts
│   └── periodic-note-utils.ts
└── styles.src.css
```

---

## Implementation Sequence

1. Phase 1 (Foundation) - Types, settings, plugin integration
2. Phase 2 (Utilities) - Date and periodic note helpers
3. Phase 5 (Components) - Reusable UI components
4. Phase 3 (Periodic Notes View) - Register and implement first view
5. Phase 6 (Styles) - CSS for both views
6. Phase 4 (Periodic Review View) - Implement second view

---

## Key API References

| API                               | Usage                                        |
| --------------------------------- | -------------------------------------------- |
| `registerBasesView()`             | Register custom Base view types              |
| `BasesView`                       | Abstract class to extend for custom views    |
| `BasesEntry.file: TFile`          | Access underlying file                       |
| `BasesEntry.getValue(propertyId)` | Get property value                           |
| `BasesViewConfig.get(key)`        | Read view option value                       |
| `BasesViewConfig.set(key, value)` | Store view state                             |
| `ViewOption` types                | slider, dropdown, toggle, text, file, folder |
| `Vault.create(path, data)`        | Create new file                              |
| `Vault.cachedRead(file)`          | Read file content                            |
| `Vault.process(file, fn)`         | Atomically modify file                       |
| `MarkdownRenderer.render()`       | Render markdown to HTML                      |
| `moment`                          | Built-in date library                        |
| `Notice`                          | Show notifications                           |

---

## Key Decisions

| Decision            | Choice                                                 |
| ------------------- | ------------------------------------------------------ |
| Card display mode   | Toggle: preview by default, click to edit inline       |
| Gap detection scope | Between existing notes + configurable future extension |
| Forward-looking     | Support creating/editing future periodic notes         |
| Section matching    | Exact header match (future: configurable mapping)      |
| Settings sync       | Auto-sync from periodic-notes plugin if available      |
| Date library        | Use Obsidian's built-in `moment`                       |
