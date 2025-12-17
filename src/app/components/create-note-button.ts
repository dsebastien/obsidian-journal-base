import type { PeriodicNoteConfig } from '../types/periodic-note.types'
import { formatDate } from '../../utils/date-utils'

export class CreateNoteButton {
    private containerEl: HTMLElement

    constructor(
        parent: HTMLElement,
        private date: Date,
        private config: PeriodicNoteConfig,
        private onClick: (date: Date) => void
    ) {
        this.containerEl = this.render(parent)
    }

    private render(parent: HTMLElement): HTMLElement {
        const container = parent.createDiv({ cls: 'pn-card pn-card--missing' })

        const header = container.createDiv({ cls: 'pn-card__header pn-card__header--missing' })

        // Date label
        header.createSpan({
            cls: 'pn-card__title pn-card__title--missing',
            text: formatDate(this.date, this.config.format)
        })

        // Create button
        const createBtn = header.createEl('button', {
            cls: 'pn-create-btn',
            attr: { 'aria-label': 'Create note' }
        })

        // Plus icon
        createBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`
        createBtn.createSpan({ text: 'Create' })

        createBtn.onclick = (e) => {
            e.stopPropagation()
            this.onClick(this.date)
        }

        return container
    }

    getDate(): Date {
        return this.date
    }

    getElement(): HTMLElement {
        return this.containerEl
    }
}
