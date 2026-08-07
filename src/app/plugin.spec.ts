import { afterEach, describe, expect, test } from 'bun:test'
import type { App, PluginManifest } from 'obsidian'
import { produce } from 'immer'

import { JournalBasesPlugin } from './plugin'
import { isDebugLoggingEnabled, setDebugLogging } from '../utils/log'

/**
 * Build a plugin instance whose persistence layer is backed by the given data.json content.
 */
const createPlugin = (persistedData: unknown): JournalBasesPlugin => {
    const plugin = new JournalBasesPlugin({} as unknown as App, {} as unknown as PluginManifest)
    plugin.loadData = (): Promise<unknown> => Promise.resolve(persistedData)
    plugin.saveData = (): Promise<void> => Promise.resolve()
    return plugin
}

describe('JournalBasesPlugin debug logging setting', () => {
    afterEach(() => {
        setDebugLogging(false)
    })

    test('defaults debugModeEnabled to false on a fresh install', async () => {
        const plugin = createPlugin(null)

        await plugin.loadSettings()

        expect(plugin.settings.debugModeEnabled).toBe(false)
        expect(isDebugLoggingEnabled()).toBe(false)
    })

    test('defaults debugModeEnabled to false when the key is missing from data.json', async () => {
        const plugin = createPlugin({ donePropertyName: 'reviewed' })

        await plugin.loadSettings()

        expect(plugin.settings.debugModeEnabled).toBe(false)
        expect(isDebugLoggingEnabled()).toBe(false)
    })

    test('restores a persisted debugModeEnabled value and applies it to the logger', async () => {
        const plugin = createPlugin({ debugModeEnabled: true })

        await plugin.loadSettings()

        expect(plugin.settings.debugModeEnabled).toBe(true)
        expect(isDebugLoggingEnabled()).toBe(true)
    })

    test('does not enable logging when the persisted value is false', async () => {
        const plugin = createPlugin({ debugModeEnabled: false })

        await plugin.loadSettings()

        expect(isDebugLoggingEnabled()).toBe(false)
    })

    test('saving settings applies the new value immediately, without a reload', async () => {
        const plugin = createPlugin(null)
        await plugin.loadSettings()
        expect(isDebugLoggingEnabled()).toBe(false)

        // Mirrors what the settings tab's updateSettings() does when the toggle changes
        plugin.settings = produce(plugin.settings, (draft) => {
            draft.debugModeEnabled = true
        })
        await plugin.saveSettings()

        expect(isDebugLoggingEnabled()).toBe(true)

        plugin.settings = produce(plugin.settings, (draft) => {
            draft.debugModeEnabled = false
        })
        await plugin.saveSettings()

        expect(isDebugLoggingEnabled()).toBe(false)
    })
})
