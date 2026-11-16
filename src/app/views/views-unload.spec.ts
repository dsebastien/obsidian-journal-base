import { beforeEach, describe, expect, test } from 'bun:test'
import type { QueryController } from 'obsidian'
import type { JournalBasesPlugin } from '../plugin'
import { DEFAULT_SETTINGS, type PluginSettings } from '../types'
import { PeriodicNotesView } from './periodic-notes/periodic-notes-view'
import { PeriodicReviewView } from './periodic-review/periodic-review-view'
import { FakeElement, createFakeApp } from '../../test/mocks/editor'

/**
 * Issue #55, second leak path: Bases can call `onDataUpdated()` on a view that
 * was already closed. The view then built its columns and cards again, with
 * live editors, in a DOM tree that was removed and that nothing unloads.
 */
describe('a data update after the view was closed', () => {
    let settingsReads: number
    let configReads: number
    let unsubscribed: number
    let plugin: JournalBasesPlugin
    let controller: QueryController
    let scrollEl: FakeElement

    /** Every element that was created below the root, at any depth. */
    function countElements(root: FakeElement): number {
        let count = 0
        for (const child of root.children) {
            count += 1 + countElements(child)
        }
        return count
    }

    beforeEach(() => {
        settingsReads = 0
        configReads = 0
        unsubscribed = 0
        scrollEl = new FakeElement()

        const fakePlugin = {
            get settings(): PluginSettings {
                settingsReads++
                return DEFAULT_SETTINGS
            },
            setActiveFileProvider: (): void => undefined,
            onSettingsChange: (): (() => void) => () => {
                unsubscribed++
            },
            onDoneReviewsChange: (): (() => void) => () => {
                unsubscribed++
            }
        }
        plugin = fakePlugin as unknown as JournalBasesPlugin

        const fakeController = {
            app: createFakeApp().app,
            config: {
                get: (): undefined => {
                    configReads++
                    return undefined
                }
            }
        }
        controller = fakeController as unknown as QueryController
    })

    test('the Periodic Review view renders on an update while it is open', () => {
        const view = new PeriodicReviewView(controller, scrollEl.asHTMLElement(), plugin)
        view.load()
        const before = countElements(scrollEl)

        view.onDataUpdated()

        // No period type is enabled in the default settings: the empty state
        expect(settingsReads).toBeGreaterThan(0)
        expect(countElements(scrollEl)).toBeGreaterThan(before)
    })

    test('the Periodic Review view does nothing on an update after unload', () => {
        const view = new PeriodicReviewView(controller, scrollEl.asHTMLElement(), plugin)
        view.load()
        view.onDataUpdated()

        view.unload()
        expect(unsubscribed).toBe(2)
        const elements = countElements(scrollEl)
        const reads = settingsReads

        view.onDataUpdated()
        view.onDataUpdated()

        expect(settingsReads).toBe(reads)
        expect(countElements(scrollEl)).toBe(elements)
    })

    test('the Periodic Notes view renders on an update while it is open', () => {
        const view = new PeriodicNotesView(controller, scrollEl.asHTMLElement(), plugin)
        view.load()
        const before = countElements(scrollEl)

        view.onDataUpdated()

        expect(configReads).toBeGreaterThan(0)
        expect(countElements(scrollEl)).toBeGreaterThan(before)
    })

    test('the Periodic Notes view does nothing on an update after unload', () => {
        const view = new PeriodicNotesView(controller, scrollEl.asHTMLElement(), plugin)
        view.load()
        view.onDataUpdated()

        view.unload()
        expect(unsubscribed).toBe(1)
        const elements = countElements(scrollEl)
        const reads = configReads

        view.onDataUpdated()

        expect(configReads).toBe(reads)
        expect(countElements(scrollEl)).toBe(elements)
    })
})
