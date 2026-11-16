import type { PeriodicNoteConfig } from '../../types'

/**
 * One position in the card list of the Periodic Notes view: the card of an
 * existing note, or the "create" placeholder of a missing period.
 */
export interface CardOrderItem {
    type: 'card' | 'missing'
    /** File path, for an existing note */
    path?: string
    date: Date
}

/**
 * A string that is the same for two card lists exactly when the view would
 * render the same elements in the same order.
 *
 * The configuration is part of it because a "create" placeholder keeps the
 * folder, format and template it was rendered with.
 */
export function getCardOrderSignature(order: CardOrderItem[], config: PeriodicNoteConfig): string {
    const parts: string[] = [JSON.stringify([config.folder, config.format, config.template])]

    for (const item of order) {
        parts.push(
            item.type === 'card' ? `card:${item.path ?? ''}` : `missing:${item.date.getTime()}`
        )
    }

    return parts.join('\n')
}
