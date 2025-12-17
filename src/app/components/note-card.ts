import { App, Component, MarkdownRenderer, TFile } from 'obsidian'
import type { PeriodType } from '../types/periodic-note.types'
import { getPeriodSuffix } from '../../utils/date-utils'

export class NoteCard extends Component {
    private containerEl!: HTMLElement
    private contentEl!: HTMLElement
    private expanded: boolean
    private contentLoaded: boolean = false

    constructor(
        parent: HTMLElement,
        private app: App,
        private file: TFile,
        private periodType: PeriodType,
        private noteDate: Date | null,
        initiallyExpanded: boolean = false,
        private onOpen?: (file: TFile) => void
    ) {
        super()
        this.expanded = initiallyExpanded
        this.containerEl = this.render(parent)
    }

    private render(parent: HTMLElement): HTMLElement {
        const container = parent.createDiv({
            cls: `pn-card ${this.expanded ? 'pn-card--expanded' : ''}`
        })

        // Header
        const header = container.createDiv({ cls: 'pn-card__header' })

        // Build title with period suffix if date is available
        const suffix = this.noteDate ? getPeriodSuffix(this.noteDate, this.periodType) : ''
        const titleText = suffix ? `${this.file.basename} ${suffix}` : this.file.basename
        const titleEl = header.createSpan({ cls: 'pn-card__title', text: titleText })

        // Open button
        const openBtn = header.createEl('button', {
            cls: 'pn-card__open-btn clickable-icon',
            attr: { 'aria-label': 'Open note' }
        })
        openBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`
        this.registerDomEvent(openBtn, 'click', (e) => {
            e.stopPropagation()
            this.onOpen?.(this.file)
        })

        // Toggle icon
        const toggleIcon = header.createSpan({ cls: 'pn-card__toggle' })
        toggleIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`

        // Content area
        this.contentEl = container.createDiv({ cls: 'pn-card__content' })

        // Click header to toggle
        this.registerDomEvent(header, 'click', () => this.toggle())

        // Double-click title to open
        this.registerDomEvent(titleEl, 'dblclick', (e) => {
            e.stopPropagation()
            this.onOpen?.(this.file)
        })

        // Load content if initially expanded
        if (this.expanded) {
            this.loadContent()
        }

        return container
    }

    toggle(): void {
        this.expanded = !this.expanded
        this.containerEl.classList.toggle('pn-card--expanded', this.expanded)

        if (this.expanded && !this.contentLoaded) {
            this.loadContent()
        }
    }

    expand(): void {
        if (!this.expanded) {
            this.toggle()
        }
    }

    collapse(): void {
        if (this.expanded) {
            this.toggle()
        }
    }

    private async loadContent(): Promise<void> {
        if (this.contentLoaded) return

        try {
            const content = await this.app.vault.cachedRead(this.file)
            await MarkdownRenderer.render(this.app, content, this.contentEl, this.file.path, this)
            this.contentLoaded = true
        } catch (error) {
            console.error('Failed to load note content:', error)
            this.contentEl.createDiv({
                cls: 'pn-card__error',
                text: 'Failed to load content'
            })
        }
    }

    getFile(): TFile {
        return this.file
    }

    isExpanded(): boolean {
        return this.expanded
    }
}
