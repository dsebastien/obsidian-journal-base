import type { PeriodType } from '../types/periodic-note.types'

const PERIOD_LABELS: Record<PeriodType, string> = {
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    yearly: 'Yearly'
}

export class PeriodTabs {
    private containerEl: HTMLElement
    private tabs: Map<PeriodType, HTMLElement> = new Map()

    constructor(
        parent: HTMLElement,
        private availableModes: PeriodType[],
        private currentMode: PeriodType,
        private onChange: (mode: PeriodType) => void
    ) {
        this.containerEl = this.render(parent)
    }

    private render(parent: HTMLElement): HTMLElement {
        const container = parent.createDiv({ cls: 'pn-tabs' })

        for (const mode of this.availableModes) {
            const isActive = mode === this.currentMode
            const tab = container.createEl('button', {
                cls: `pn-tab ${isActive ? 'pn-tab--active' : ''}`,
                text: PERIOD_LABELS[mode],
                attr: {
                    'aria-pressed': isActive ? 'true' : 'false',
                    'data-mode': mode
                }
            })

            // Disable active tab
            if (isActive) {
                tab.disabled = true
            }

            tab.onclick = () => {
                if (mode !== this.currentMode) {
                    this.setActiveMode(mode)
                    this.onChange(mode)
                }
            }

            this.tabs.set(mode, tab)
        }

        return container
    }

    setActiveMode(mode: PeriodType): void {
        // Update previous active tab
        const previousTab = this.tabs.get(this.currentMode)
        if (previousTab) {
            previousTab.classList.remove('pn-tab--active')
            previousTab.setAttribute('aria-pressed', 'false')
            previousTab.disabled = false
        }

        // Update new active tab
        const newTab = this.tabs.get(mode)
        if (newTab) {
            newTab.classList.add('pn-tab--active')
            newTab.setAttribute('aria-pressed', 'true')
            newTab.disabled = true
        }

        this.currentMode = mode
    }

    getCurrentMode(): PeriodType {
        return this.currentMode
    }

    getElement(): HTMLElement {
        return this.containerEl
    }
}
