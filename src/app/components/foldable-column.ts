import { Component } from 'obsidian'

export class FoldableColumn extends Component {
    private containerEl!: HTMLElement
    private headerEl!: HTMLElement
    private selectorEl!: HTMLElement
    private contentEl!: HTMLElement
    private folded: boolean = false

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

        const titleEl = this.headerEl.createSpan({
            cls: 'pr-column__title',
            text: this.title
        })

        // Fold button
        const foldBtn = this.headerEl.createEl('button', {
            cls: 'pr-column__fold-btn clickable-icon',
            attr: { 'aria-label': 'Toggle column' }
        })
        foldBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`

        this.registerDomEvent(foldBtn, 'click', () => this.toggleFold())

        // Also allow clicking header to fold (except on title for selection)
        this.registerDomEvent(titleEl, 'click', () => this.toggleFold())

        // Selector area (for period selection)
        this.selectorEl = container.createDiv({ cls: 'pr-column__selector' })

        // Content area
        this.contentEl = container.createDiv({ cls: 'pr-column__content' })

        return container
    }

    toggleFold(): void {
        this.folded = !this.folded
        this.containerEl.classList.toggle('pr-column--folded', this.folded)
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
