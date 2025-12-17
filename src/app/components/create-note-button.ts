import type { PeriodicNoteConfig, PeriodType } from '../types'
import { formatFilenameWithSuffix, isCurrentPeriod } from '../../utils/date-utils'

// SVG icons
const PLUS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`
const SPINNER_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="pn-spinner"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`

export class CreateNoteButton {
    private containerEl: HTMLElement
    private buttonEl!: HTMLButtonElement
    private iconEl!: HTMLSpanElement
    private isLoading = false

    constructor(
        parent: HTMLElement,
        private date: Date,
        private config: PeriodicNoteConfig,
        private periodType: PeriodType,
        private onClick: (date: Date) => Promise<boolean>
    ) {
        this.containerEl = this.render(parent)
    }

    private render(parent: HTMLElement): HTMLElement {
        const isCurrent = isCurrentPeriod(this.date, this.periodType)
        const container = parent.createDiv({
            cls: `pn-card pn-card--missing ${isCurrent ? 'pn-card--current' : ''}`
        })

        const header = container.createDiv({ cls: 'pn-card__header pn-card__header--missing' })

        // Date label (filename with period-specific suffix)
        header.createSpan({
            cls: 'pn-card__title pn-card__title--missing',
            text: formatFilenameWithSuffix(this.date, this.config.format, this.periodType)
        })

        // Create button
        this.buttonEl = header.createEl('button', {
            cls: 'pn-create-btn',
            attr: { 'aria-label': 'Create note' }
        })

        // Icon container
        this.iconEl = this.buttonEl.createSpan({ cls: 'pn-create-btn__icon' })
        this.iconEl.innerHTML = PLUS_ICON
        this.buttonEl.createSpan({ text: 'Create' })

        this.buttonEl.onclick = async (e) => {
            e.stopPropagation()
            if (this.isLoading) return

            this.setLoading(true)
            const success = await this.onClick(this.date)
            // Only clear loading on failure - on success the card will be replaced by view re-render
            if (!success && this.containerEl.isConnected) {
                this.setLoading(false)
            }
        }

        return container
    }

    private setLoading(loading: boolean): void {
        this.isLoading = loading
        if (loading) {
            this.buttonEl.disabled = true
            this.buttonEl.addClass('pn-create-btn--loading')
            this.iconEl.innerHTML = SPINNER_ICON
        } else {
            this.buttonEl.disabled = false
            this.buttonEl.removeClass('pn-create-btn--loading')
            this.iconEl.innerHTML = PLUS_ICON
        }
    }

    getDate(): Date {
        return this.date
    }

    getElement(): HTMLElement {
        return this.containerEl
    }
}
