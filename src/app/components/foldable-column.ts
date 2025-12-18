import { Component } from 'obsidian'

// SVG icons for fold button
const ICON_COLLAPSE = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`
const ICON_EXPAND = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`

export class FoldableColumn extends Component {
    private containerEl!: HTMLElement
    private headerEl!: HTMLElement
    private headerActionsEl!: HTMLElement
    private selectorEl!: HTMLElement
    private contentEl!: HTMLElement
    private foldBtn!: HTMLButtonElement
    private folded: boolean = false
    private configuredWidth: number | null = null

    constructor(
        parent: HTMLElement,
        private title: string
    ) {
        super()
        this.containerEl = this.render(parent)
    }

    private render(parent: HTMLElement): HTMLElement {
        const container = parent.createDiv({ cls: 'pr-column' })

        // Header
        this.headerEl = container.createDiv({ cls: 'pr-column__header' })

        // Fold button (at the top)
        this.foldBtn = this.headerEl.createEl('button', {
            cls: 'pr-column__fold-btn clickable-icon',
            attr: { 'aria-label': 'Collapse column' }
        })
        this.foldBtn.innerHTML = ICON_COLLAPSE

        this.headerEl.createSpan({
            cls: 'pr-column__title',
            text: this.title
        })

        // Header actions container (for action buttons on the right)
        this.headerActionsEl = this.headerEl.createDiv({ cls: 'pr-column__header-actions' })

        this.registerDomEvent(this.foldBtn, 'click', (e) => {
            e.stopPropagation()
            this.toggleFold()
        })

        // Click on header to toggle fold (but not on the actions area)
        this.registerDomEvent(this.headerEl, 'click', (e) => {
            if (!this.headerActionsEl.contains(e.target as Node)) {
                this.toggleFold()
            }
        })

        // Selector area (for period selection)
        this.selectorEl = container.createDiv({ cls: 'pr-column__selector' })

        // Content area
        this.contentEl = container.createDiv({ cls: 'pr-column__content' })

        return container
    }

    toggleFold(): void {
        this.folded = !this.folded
        this.containerEl.classList.toggle('pr-column--folded', this.folded)
        this.updateWidthStyles()
        this.updateFoldButton()
    }

    private updateFoldButton(): void {
        this.foldBtn.innerHTML = this.folded ? ICON_EXPAND : ICON_COLLAPSE
        this.foldBtn.setAttribute('aria-label', this.folded ? 'Expand column' : 'Collapse column')
    }

    private updateWidthStyles(): void {
        if (this.folded) {
            // Clear inline styles so CSS can take over
            this.containerEl.style.minWidth = ''
            this.containerEl.style.maxWidth = ''
        } else if (this.configuredWidth !== null) {
            // Restore configured width
            this.containerEl.style.minWidth = `${this.configuredWidth}px`
            this.containerEl.style.maxWidth = `${this.configuredWidth}px`
        }
    }

    setWidth(width: number): void {
        this.configuredWidth = width
        if (!this.folded) {
            this.containerEl.style.minWidth = `${width}px`
            this.containerEl.style.maxWidth = `${width}px`
        }
    }

    fold(): void {
        if (!this.folded) {
            this.toggleFold()
        }
    }

    unfold(): void {
        if (this.folded) {
            this.toggleFold()
        }
    }

    isFolded(): boolean {
        return this.folded
    }

    getSelectorEl(): HTMLElement {
        return this.selectorEl
    }

    getContentEl(): HTMLElement {
        return this.contentEl
    }

    getHeaderActionsEl(): HTMLElement {
        return this.headerActionsEl
    }

    getElement(): HTMLElement {
        return this.containerEl
    }

    setTitle(title: string): void {
        this.title = title
        const titleEl = this.headerEl.querySelector('.pr-column__title')
        if (titleEl) {
            titleEl.textContent = title
        }
    }

    clearSelector(): void {
        this.selectorEl.empty()
    }

    clearContent(): void {
        this.contentEl.empty()
    }

    clear(): void {
        this.clearSelector()
        this.clearContent()
    }
}
