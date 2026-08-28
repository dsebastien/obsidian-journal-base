import { describe, expect, test, mock } from 'bun:test'
import { produce } from 'immer'
import JournalBasesPlugin from '../../main'
import { JournalBasesSettingTab } from './settings-tab'
import { DEFAULT_SETTINGS } from '../types'

/**
 * Behavioral coverage for the settings write path.
 *
 * `settings-guard.spec.ts` only scans source text, and nothing in CI renders a
 * settings pane. These tests exercise the properties no UI test can reach:
 * writes are serialized, memory is committed only after persistence succeeds,
 * the debug/notify side effects fire only after a successful commit, and
 * synced-mode writes are rejected.
 */

async function expectRejection(promise: Promise<unknown>, contains: string): Promise<void> {
    let caught: unknown
    await promise.catch((error: unknown) => {
        caught = error
    })
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain(contains)
}

interface Harness {
    plugin: JournalBasesPlugin
    tab: JournalBasesSettingTab
    saveData: ReturnType<typeof mock>
    applyDebugLogging: ReturnType<typeof mock>
    notifySettingsChanged: ReturnType<typeof mock>
}

function createHarness(options?: { saveData?: () => Promise<void>; synced?: boolean }): Harness {
    const saveData = mock(async () => {
        if (options?.saveData) {
            await options.saveData()
        }
    })
    const applyDebugLogging = mock(() => {})
    const notifySettingsChanged = mock(() => {})

    const plugin = Object.create(JournalBasesPlugin.prototype) as JournalBasesPlugin
    const internals = plugin as unknown as Record<string, unknown>
    internals['settings'] = produce(DEFAULT_SETTINGS, () => DEFAULT_SETTINGS)
    internals['settingsWriteChain'] = Promise.resolve()
    internals['saveData'] = saveData
    internals['applyDebugLogging'] = applyDebugLogging
    internals['notifySettingsChanged'] = notifySettingsChanged
    internals['isPeriodicNotesSynced'] = options?.synced ?? false

    const tab = Object.create(JournalBasesSettingTab.prototype) as JournalBasesSettingTab
    const tabInternals = tab as unknown as Record<string, unknown>
    tabInternals['plugin'] = plugin
    tabInternals['update'] = () => {}

    return { plugin, tab, saveData, applyDebugLogging, notifySettingsChanged }
}

describe('updateSettings', () => {
    test('commits to memory only after the write is persisted', async () => {
        let release = (): void => {}
        const gate = new Promise<void>((resolve) => {
            release = resolve
        })
        const { plugin, saveData, notifySettingsChanged } = createHarness({
            saveData: () => gate
        })

        const pending = plugin.updateSettings((draft) => {
            draft.daily.folder = 'Journal/Daily'
        })

        // Let the queued write start and reach its save await; a bare
        // synchronous assertion would pass even with the ordering reversed,
        // because the chain defers the work to a microtask.
        await Promise.resolve()
        await Promise.resolve()
        expect(saveData).toHaveBeenCalledTimes(1)
        expect(plugin.settings.daily.folder).toBe(DEFAULT_SETTINGS.daily.folder)
        expect(notifySettingsChanged).not.toHaveBeenCalled()

        release()
        await pending
        expect(plugin.settings.daily.folder).toBe('Journal/Daily')
        expect(notifySettingsChanged).toHaveBeenCalledTimes(1)
    })

    test('leaves memory untouched and fires no side effects when persistence fails', async () => {
        const { plugin, applyDebugLogging, notifySettingsChanged } = createHarness({
            saveData: () => Promise.reject(new Error('disk full'))
        })

        await expectRejection(
            plugin.updateSettings((draft) => {
                draft.debugModeEnabled = true
            }),
            'disk full'
        )

        expect(plugin.settings.debugModeEnabled).toBe(DEFAULT_SETTINGS.debugModeEnabled)
        expect(applyDebugLogging).not.toHaveBeenCalled()
        expect(notifySettingsChanged).not.toHaveBeenCalled()
    })

    test('overlapping writes do not drop each other', async () => {
        let releaseFirst = (): void => {}
        const first = new Promise<void>((resolve) => {
            releaseFirst = resolve
        })
        let call = 0
        const { plugin } = createHarness({
            saveData: () => {
                call += 1
                return call === 1 ? first : Promise.resolve()
            }
        })

        const a = plugin.updateSettings((draft) => {
            draft.weekly.enabled = !DEFAULT_SETTINGS.weekly.enabled
        })
        const b = plugin.updateSettings((draft) => {
            draft.collapseFrontmatter = !DEFAULT_SETTINGS.collapseFrontmatter
        })

        releaseFirst()
        await Promise.all([a, b])

        expect(plugin.settings.weekly.enabled).toBe(!DEFAULT_SETTINGS.weekly.enabled)
        expect(plugin.settings.collapseFrontmatter).toBe(!DEFAULT_SETTINGS.collapseFrontmatter)
    })
})

describe('setControlValue', () => {
    test('writes period fields through their dot keys', async () => {
        const { tab, plugin } = createHarness()

        await tab.setControlValue('daily.enabled', !DEFAULT_SETTINGS.daily.enabled)
        await tab.setControlValue('weekly.folder', 'Journal/Weekly')
        await tab.setControlValue('monthly.format', 'YYYY-MM')
        await tab.setControlValue('yearly.template', 'Templates/Yearly.md')

        expect(plugin.settings.daily.enabled).toBe(!DEFAULT_SETTINGS.daily.enabled)
        expect(plugin.settings.weekly.folder).toBe('Journal/Weekly')
        expect(plugin.settings.monthly.format).toBe('YYYY-MM')
        expect(plugin.settings.yearly.template).toBe('Templates/Yearly.md')
        expect(tab.getControlValue('weekly.folder')).toBe('Journal/Weekly')
    })

    test('rejects every period write while synced from Periodic Notes', async () => {
        const { tab, plugin, saveData } = createHarness({ synced: true })

        await expectRejection(tab.setControlValue('daily.enabled', true), 'synced')
        await expectRejection(tab.setControlValue('daily.folder', 'X'), 'synced')
        expect(saveData).not.toHaveBeenCalled()
        expect(plugin.settings.daily.folder).toBe(DEFAULT_SETTINGS.daily.folder)
    })

    test('a cleared done property falls back to its default, trimmed', async () => {
        const { tab, plugin } = createHarness()

        await tab.setControlValue('donePropertyName', '  ')
        expect(plugin.settings.donePropertyName).toBe('periodic_review_completed')

        await tab.setControlValue('donePropertyName', ' my_done ')
        expect(plugin.settings.donePropertyName).toBe('my_done')
    })

    test('rejects a wrongly typed value, an unknown key, and an unknown period field', async () => {
        const { tab, saveData } = createHarness()

        await expectRejection(tab.setControlValue('daily.enabled', 'yes'), 'boolean')
        await expectRejection(tab.setControlValue('collapseFrontmatter', 1), 'boolean')
        await expectRejection(tab.setControlValue('nope', true), 'known field')
        await expectRejection(tab.setControlValue('daily.__proto__', 'x'), 'known field')
        expect(saveData).not.toHaveBeenCalled()
    })

    test('persists the plain scalar controls', async () => {
        const { tab, plugin } = createHarness()

        await tab.setControlValue('collapseFrontmatter', !DEFAULT_SETTINGS.collapseFrontmatter)
        await tab.setControlValue('rememberColumnState', !DEFAULT_SETTINGS.rememberColumnState)
        await tab.setControlValue('debugModeEnabled', !DEFAULT_SETTINGS.debugModeEnabled)

        expect(plugin.settings).toMatchObject({
            collapseFrontmatter: !DEFAULT_SETTINGS.collapseFrontmatter,
            rememberColumnState: !DEFAULT_SETTINGS.rememberColumnState,
            debugModeEnabled: !DEFAULT_SETTINGS.debugModeEnabled
        })
    })

    test('getControlValue answers for every declared scalar and period key', () => {
        const { tab, plugin } = createHarness()

        for (const period of ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const) {
            for (const field of ['enabled', 'folder', 'format', 'template'] as const) {
                expect(tab.getControlValue(`${period}.${field}`), `${period}.${field}`).toBe(
                    plugin.settings[period][field]
                )
            }
        }
        expect(tab.getControlValue('donePropertyName')).toBe(plugin.settings.donePropertyName)
        expect(tab.getControlValue('collapseFrontmatter')).toBe(plugin.settings.collapseFrontmatter)
        expect(tab.getControlValue('rememberColumnState')).toBe(plugin.settings.rememberColumnState)
        expect(tab.getControlValue('debugModeEnabled')).toBe(plugin.settings.debugModeEnabled)
        expect(tab.getControlValue('nope')).toBeUndefined()
    })
})

describe('setting definitions', () => {
    interface Def {
        name?: string
        heading?: string
        items?: Def[]
        render?: unknown
        visible?: unknown
        control?: { type: string; key: string; defaultValue?: unknown }
    }

    function definitions(synced = false): Def[] {
        const { tab } = createHarness({ synced })
        return (tab as unknown as { getSettingDefinitions: () => Def[] }).getSettingDefinitions()
    }

    function flatten(defs: Def[]): Def[] {
        return defs.flatMap((d) => (d.items ? [d, ...flatten(d.items)] : [d]))
    }

    test('declares every section heading the old pane had', () => {
        const headings = definitions()
            .map((d) => d.heading)
            .filter((h): h is string => typeof h === 'string')
        expect(headings).toEqual([
            'Daily notes',
            'Weekly notes',
            'Monthly notes',
            'Quarterly notes',
            'Yearly notes',
            'Done status',
            'Periodic Review',
            'Troubleshooting'
        ])
    })

    test('every period declares enabled/folder/format controls and a template render row', () => {
        const all = flatten(definitions())
        for (const period of ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']) {
            expect(
                all.some(
                    (d) => d.control?.key === `${period}.enabled` && d.control.type === 'toggle'
                ),
                period
            ).toBe(true)
            expect(
                all.some((d) => d.control?.key === `${period}.folder` && d.control.type === 'text'),
                period
            ).toBe(true)
            expect(
                all.some((d) => d.control?.key === `${period}.format` && d.control.type === 'text'),
                period
            ).toBe(true)
            expect(
                all.some((d) => d.name === 'Template' && d.render),
                period
            ).toBe(true)
        }
        expect(all.some((d) => d.name === 'Support' && d.render)).toBe(true)
        for (const d of all) {
            if (d.control) {
                expect('defaultValue' in d.control, d.control.key).toBe(false)
            }
        }
    })

    test('the sync notice is a visibility-gated info row', () => {
        const notice = flatten(definitions()).find((d) =>
            String((d as { desc?: string }).desc ?? '').includes('synced from the Periodic Notes')
        )
        expect(notice).toBeDefined()
        expect(typeof notice!.visible).toBe('function')
        expect(notice!.render).toBeDefined()
    })
})
