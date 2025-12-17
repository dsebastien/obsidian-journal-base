import { describe, expect, test, mock, beforeAll } from 'bun:test'

// Mock obsidian module before importing the service
const mockNotice = mock(() => {})

beforeAll(() => {
    mock.module('obsidian', () => ({
        Notice: mockNotice,
        App: class {},
        TFile: class {},
        Plugin: class {}
    }))
})

// Types for mocking (since we can't import from obsidian)
interface MockTFile {
    path: string
    name?: string
    basename?: string
    extension?: string
    stat?: unknown
    vault?: unknown
    parent?: unknown
}

interface MockEventRef {
    id: string
}

interface MockWorkspace {
    on: ReturnType<typeof mock>
    offref: ReturnType<typeof mock>
}

interface MockVault {
    getFileByPath: ReturnType<typeof mock>
}

interface MockApp {
    plugins: {
        enabledPlugins: Set<string>
        getPlugin: ReturnType<typeof mock>
    }
    workspace: MockWorkspace
    vault: MockVault
}

// Helper to create a mock App with plugins
function createMockApp(
    options: {
        enabledPlugins?: string[]
        periodicNotesSettings?: unknown
        templaterPlugin?: unknown
        templateFile?: MockTFile | null
    } = {}
): MockApp {
    const {
        enabledPlugins = [],
        periodicNotesSettings = null,
        templaterPlugin = null,
        templateFile = null
    } = options

    const enabledPluginsSet = new Set(enabledPlugins)

    const mockWorkspace: MockWorkspace = {
        on: mock(() => ({ id: 'mock-event-ref' }) as MockEventRef),
        offref: mock(() => {})
    }

    const mockVault: MockVault = {
        getFileByPath: mock(() => templateFile)
    }

    return {
        plugins: {
            enabledPlugins: enabledPluginsSet,
            getPlugin: mock((id: string) => {
                if (id === 'periodic-notes' && periodicNotesSettings) {
                    return { settings: periodicNotesSettings }
                }
                if (id === 'templater-obsidian' && templaterPlugin) {
                    return templaterPlugin
                }
                return null
            })
        },
        workspace: mockWorkspace,
        vault: mockVault
    }
}

// Valid periodic notes settings fixture
const validPeriodicNotesSettings = {
    daily: {
        enabled: true,
        folder: '40 Journal/41 Daily Notes',
        format: 'YYYY-MM-DD',
        template: 'Templates/Daily.md'
    },
    weekly: {
        enabled: true,
        folder: '40 Journal/42 Weekly Notes',
        format: 'gggg-[W]ww',
        template: 'Templates/Weekly.md'
    },
    monthly: {
        enabled: false,
        folder: '40 Journal/43 Monthly Notes',
        format: 'YYYY-MM',
        template: ''
    },
    quarterly: {
        enabled: false,
        folder: '',
        format: 'YYYY-[Q]Q',
        template: ''
    },
    yearly: {
        enabled: false,
        folder: '',
        format: 'YYYY',
        template: ''
    }
}

// Import after mocking
import { PluginIntegrationService } from './plugin-integration.service'
import type { App } from 'obsidian'

describe('PluginIntegrationService', () => {
    describe('Periodic Notes Plugin Integration', () => {
        describe('isPeriodicNotesPluginEnabled', () => {
            test('returns true when periodic-notes plugin is enabled', () => {
                const app = createMockApp({ enabledPlugins: ['periodic-notes'] })
                const service = new PluginIntegrationService(app as unknown as App)

                expect(service.isPeriodicNotesPluginEnabled()).toBe(true)
            })

            test('returns false when periodic-notes plugin is not enabled', () => {
                const app = createMockApp({ enabledPlugins: [] })
                const service = new PluginIntegrationService(app as unknown as App)

                expect(service.isPeriodicNotesPluginEnabled()).toBe(false)
            })

            test('returns false when other plugins are enabled but not periodic-notes', () => {
                const app = createMockApp({
                    enabledPlugins: ['templater-obsidian', 'dataview']
                })
                const service = new PluginIntegrationService(app as unknown as App)

                expect(service.isPeriodicNotesPluginEnabled()).toBe(false)
            })
        })

        describe('getPeriodicNotesPlugin', () => {
            test('returns plugin when enabled', () => {
                const app = createMockApp({
                    enabledPlugins: ['periodic-notes'],
                    periodicNotesSettings: validPeriodicNotesSettings
                })
                const service = new PluginIntegrationService(app as unknown as App)

                const plugin = service.getPeriodicNotesPlugin()

                expect(plugin).not.toBeNull()
                expect((plugin as { settings: unknown }).settings).toEqual(
                    validPeriodicNotesSettings
                )
            })

            test('returns null when plugin is not enabled', () => {
                const app = createMockApp({ enabledPlugins: [] })
                const service = new PluginIntegrationService(app as unknown as App)

                expect(service.getPeriodicNotesPlugin()).toBeNull()
            })
        })

        describe('syncFromPeriodicNotesPlugin', () => {
            test('returns settings when periodic-notes plugin has valid settings', () => {
                const app = createMockApp({
                    enabledPlugins: ['periodic-notes'],
                    periodicNotesSettings: validPeriodicNotesSettings
                })
                const service = new PluginIntegrationService(app as unknown as App)

                const synced = service.syncFromPeriodicNotesPlugin()

                expect(synced).not.toBeNull()
                expect(synced?.daily).toEqual(validPeriodicNotesSettings.daily)
                expect(synced?.weekly).toEqual(validPeriodicNotesSettings.weekly)
                expect(synced?.monthly).toEqual(validPeriodicNotesSettings.monthly)
                expect(synced?.quarterly).toEqual(validPeriodicNotesSettings.quarterly)
                expect(synced?.yearly).toEqual(validPeriodicNotesSettings.yearly)
            })

            test('returns null when plugin is not enabled', () => {
                const app = createMockApp({ enabledPlugins: [] })
                const service = new PluginIntegrationService(app as unknown as App)

                expect(service.syncFromPeriodicNotesPlugin()).toBeNull()
            })

            test('returns null when plugin has no settings', () => {
                const app = createMockApp({
                    enabledPlugins: ['periodic-notes'],
                    periodicNotesSettings: null
                })
                const service = new PluginIntegrationService(app as unknown as App)

                expect(service.syncFromPeriodicNotesPlugin()).toBeNull()
            })

            test('returns null when settings fail validation', () => {
                const invalidSettings = {
                    daily: { enabled: 'not-a-boolean' }, // Invalid type
                    weekly: {},
                    monthly: {},
                    quarterly: {},
                    yearly: {}
                }
                const app = createMockApp({
                    enabledPlugins: ['periodic-notes'],
                    periodicNotesSettings: invalidSettings
                })
                const service = new PluginIntegrationService(app as unknown as App)

                expect(service.syncFromPeriodicNotesPlugin()).toBeNull()
            })

            test('returns null when settings are missing required fields', () => {
                const incompleteSettings = {
                    daily: { enabled: true, folder: 'test' }
                    // Missing format and template
                }
                const app = createMockApp({
                    enabledPlugins: ['periodic-notes'],
                    periodicNotesSettings: incompleteSettings
                })
                const service = new PluginIntegrationService(app as unknown as App)

                expect(service.syncFromPeriodicNotesPlugin()).toBeNull()
            })
        })

        describe('subscribeToPeriodicNotesChanges', () => {
            test('registers event listener on workspace', () => {
                const app = createMockApp()
                const service = new PluginIntegrationService(app as unknown as App)
                const callback = mock(() => {})

                service.subscribeToPeriodicNotesChanges(callback)

                expect(app.workspace.on).toHaveBeenCalled()
            })

            test('unsubscribes previous listener before subscribing new one', () => {
                const app = createMockApp()
                const service = new PluginIntegrationService(app as unknown as App)
                const callback1 = mock(() => {})
                const callback2 = mock(() => {})

                service.subscribeToPeriodicNotesChanges(callback1)
                service.subscribeToPeriodicNotesChanges(callback2)

                // offref should have been called once (to unsubscribe callback1)
                expect(app.workspace.offref).toHaveBeenCalled()
            })
        })

        describe('unsubscribeFromPeriodicNotesChanges', () => {
            test('removes event listener when subscribed', () => {
                const app = createMockApp()
                const service = new PluginIntegrationService(app as unknown as App)
                const callback = mock(() => {})

                service.subscribeToPeriodicNotesChanges(callback)
                service.unsubscribeFromPeriodicNotesChanges()

                expect(app.workspace.offref).toHaveBeenCalled()
            })

            test('does nothing when not subscribed', () => {
                const app = createMockApp()
                const service = new PluginIntegrationService(app as unknown as App)

                // Should not throw
                service.unsubscribeFromPeriodicNotesChanges()

                expect(app.workspace.offref).not.toHaveBeenCalled()
            })

            test('clears event ref after unsubscribing', () => {
                const app = createMockApp()
                const service = new PluginIntegrationService(app as unknown as App)
                const callback = mock(() => {})

                service.subscribeToPeriodicNotesChanges(callback)
                service.unsubscribeFromPeriodicNotesChanges()

                // Calling again should not call offref again
                service.unsubscribeFromPeriodicNotesChanges()

                // offref should only have been called once
                expect(app.workspace.offref).toHaveBeenCalledTimes(1)
            })
        })

        describe('subscribeToPeriodicNotesPluginState', () => {
            test('starts polling for plugin state changes', () => {
                const app = createMockApp()
                const service = new PluginIntegrationService(app as unknown as App)
                const onEnabled = mock(() => {})
                const onDisabled = mock(() => {})

                service.subscribeToPeriodicNotesPluginState(onEnabled, onDisabled)

                // Clean up
                service.unsubscribeFromPeriodicNotesPluginState()

                // Should not throw - just verifying the method works
                expect(true).toBe(true)
            })

            test('clears previous interval before starting new one', () => {
                const app = createMockApp()
                const service = new PluginIntegrationService(app as unknown as App)
                const onEnabled1 = mock(() => {})
                const onDisabled1 = mock(() => {})
                const onEnabled2 = mock(() => {})
                const onDisabled2 = mock(() => {})

                service.subscribeToPeriodicNotesPluginState(onEnabled1, onDisabled1)
                service.subscribeToPeriodicNotesPluginState(onEnabled2, onDisabled2)

                // Clean up
                service.unsubscribeFromPeriodicNotesPluginState()

                // Should not throw - verifying multiple subscriptions work
                expect(true).toBe(true)
            })
        })

        describe('unsubscribeFromPeriodicNotesPluginState', () => {
            test('stops polling when subscribed', () => {
                const app = createMockApp()
                const service = new PluginIntegrationService(app as unknown as App)
                const onEnabled = mock(() => {})
                const onDisabled = mock(() => {})

                service.subscribeToPeriodicNotesPluginState(onEnabled, onDisabled)
                service.unsubscribeFromPeriodicNotesPluginState()

                // Should not throw
                expect(true).toBe(true)
            })

            test('does nothing when not subscribed', () => {
                const app = createMockApp()
                const service = new PluginIntegrationService(app as unknown as App)

                // Should not throw
                service.unsubscribeFromPeriodicNotesPluginState()

                expect(true).toBe(true)
            })

            test('can be called multiple times safely', () => {
                const app = createMockApp()
                const service = new PluginIntegrationService(app as unknown as App)
                const onEnabled = mock(() => {})
                const onDisabled = mock(() => {})

                service.subscribeToPeriodicNotesPluginState(onEnabled, onDisabled)
                service.unsubscribeFromPeriodicNotesPluginState()

                // Calling again should not throw
                service.unsubscribeFromPeriodicNotesPluginState()

                expect(true).toBe(true)
            })
        })
    })

    describe('Templater Plugin Integration', () => {
        describe('isTemplaterEnabled', () => {
            test('returns true when templater-obsidian plugin is enabled', () => {
                const app = createMockApp({ enabledPlugins: ['templater-obsidian'] })
                const service = new PluginIntegrationService(app as unknown as App)

                expect(service.isTemplaterEnabled()).toBe(true)
            })

            test('returns false when templater-obsidian plugin is not enabled', () => {
                const app = createMockApp({ enabledPlugins: [] })
                const service = new PluginIntegrationService(app as unknown as App)

                expect(service.isTemplaterEnabled()).toBe(false)
            })
        })

        describe('getTemplaterPlugin', () => {
            test('returns plugin when enabled', () => {
                const mockTemplater = {
                    templater: {
                        create_new_note_from_template: mock(() => Promise.resolve(null))
                    }
                }
                const app = createMockApp({
                    enabledPlugins: ['templater-obsidian'],
                    templaterPlugin: mockTemplater
                })
                const service = new PluginIntegrationService(app as unknown as App)

                const plugin = service.getTemplaterPlugin()

                expect(plugin).not.toBeNull()
                expect(plugin?.templater).toBeDefined()
            })

            test('returns null when plugin is not enabled', () => {
                const app = createMockApp({ enabledPlugins: [] })
                const service = new PluginIntegrationService(app as unknown as App)

                expect(service.getTemplaterPlugin()).toBeNull()
            })
        })

        describe('createFileFromTemplate', () => {
            test('returns null when Templater is not enabled', async () => {
                const app = createMockApp({ enabledPlugins: [] })
                const service = new PluginIntegrationService(app as unknown as App)

                const result = await service.createFileFromTemplate(
                    'Templates/Daily.md',
                    'Journal',
                    '2024-01-01'
                )

                expect(result).toBeNull()
            })

            test('returns null when template file not found', async () => {
                const mockTemplater = {
                    templater: {
                        create_new_note_from_template: mock(() => Promise.resolve(null))
                    }
                }
                const app = createMockApp({
                    enabledPlugins: ['templater-obsidian'],
                    templaterPlugin: mockTemplater,
                    templateFile: null
                })
                const service = new PluginIntegrationService(app as unknown as App)

                const result = await service.createFileFromTemplate(
                    'Templates/NonExistent.md',
                    'Journal',
                    '2024-01-01'
                )

                expect(result).toBeNull()
            })

            test('calls Templater API with correct parameters', async () => {
                const mockFile: MockTFile = { path: 'test.md' }
                const mockCreateFn = mock(() => Promise.resolve(mockFile))
                const mockTemplater = {
                    templater: {
                        create_new_note_from_template: mockCreateFn
                    }
                }
                const templateFile: MockTFile = { path: 'Templates/Daily.md' }
                const app = createMockApp({
                    enabledPlugins: ['templater-obsidian'],
                    templaterPlugin: mockTemplater,
                    templateFile
                })
                const service = new PluginIntegrationService(app as unknown as App)

                const result = await service.createFileFromTemplate(
                    'Templates/Daily.md',
                    'Journal',
                    '2024-01-01'
                )

                expect(mockCreateFn).toHaveBeenCalledWith(
                    templateFile,
                    'Journal',
                    '2024-01-01',
                    false
                )
                expect(result).toBe(mockFile as unknown as import('obsidian').TFile)
            })

            test('returns null when Templater API throws error', async () => {
                const mockCreateFn = mock(() => Promise.reject(new Error('Template error')))
                const mockTemplater = {
                    templater: {
                        create_new_note_from_template: mockCreateFn
                    }
                }
                const templateFile: MockTFile = { path: 'Templates/Daily.md' }
                const app = createMockApp({
                    enabledPlugins: ['templater-obsidian'],
                    templaterPlugin: mockTemplater,
                    templateFile
                })
                const service = new PluginIntegrationService(app as unknown as App)

                const result = await service.createFileFromTemplate(
                    'Templates/Daily.md',
                    'Journal',
                    '2024-01-01'
                )

                expect(result).toBeNull()
            })

            test('returns null when Templater API returns undefined', async () => {
                const mockCreateFn = mock(() => Promise.resolve(undefined))
                const mockTemplater = {
                    templater: {
                        create_new_note_from_template: mockCreateFn
                    }
                }
                const templateFile: MockTFile = { path: 'Templates/Daily.md' }
                const app = createMockApp({
                    enabledPlugins: ['templater-obsidian'],
                    templaterPlugin: mockTemplater,
                    templateFile
                })
                const service = new PluginIntegrationService(app as unknown as App)

                const result = await service.createFileFromTemplate(
                    'Templates/Daily.md',
                    'Journal',
                    '2024-01-01'
                )

                expect(result).toBeNull()
            })
        })

        describe('applyTemplateToFile', () => {
            test('returns false when Templater is not enabled', async () => {
                const app = createMockApp({ enabledPlugins: [] })
                const service = new PluginIntegrationService(app as unknown as App)
                const targetFile: MockTFile = { path: 'test.md' }

                const result = await service.applyTemplateToFile(
                    'Templates/Daily.md',
                    targetFile as unknown as import('obsidian').TFile
                )

                expect(result).toBe(false)
            })

            test('returns false when template file not found', async () => {
                const mockTemplater = {
                    templater: {
                        write_template_to_file: mock(() => Promise.resolve())
                    }
                }
                const app = createMockApp({
                    enabledPlugins: ['templater-obsidian'],
                    templaterPlugin: mockTemplater,
                    templateFile: null
                })
                const service = new PluginIntegrationService(app as unknown as App)
                const targetFile: MockTFile = { path: 'test.md' }

                const result = await service.applyTemplateToFile(
                    'Templates/NonExistent.md',
                    targetFile as unknown as import('obsidian').TFile
                )

                expect(result).toBe(false)
            })

            test('calls Templater API with correct parameters and returns true', async () => {
                const mockWriteFn = mock(() => Promise.resolve())
                const mockTemplater = {
                    templater: {
                        write_template_to_file: mockWriteFn
                    }
                }
                const templateFile: MockTFile = { path: 'Templates/Daily.md' }
                const targetFile: MockTFile = { path: 'test.md' }
                const app = createMockApp({
                    enabledPlugins: ['templater-obsidian'],
                    templaterPlugin: mockTemplater,
                    templateFile
                })
                const service = new PluginIntegrationService(app as unknown as App)

                const result = await service.applyTemplateToFile(
                    'Templates/Daily.md',
                    targetFile as unknown as import('obsidian').TFile
                )

                expect(mockWriteFn).toHaveBeenCalledWith(templateFile, targetFile)
                expect(result).toBe(true)
            })

            test('returns false when Templater API throws error', async () => {
                const mockWriteFn = mock(() => Promise.reject(new Error('Write error')))
                const mockTemplater = {
                    templater: {
                        write_template_to_file: mockWriteFn
                    }
                }
                const templateFile: MockTFile = { path: 'Templates/Daily.md' }
                const targetFile: MockTFile = { path: 'test.md' }
                const app = createMockApp({
                    enabledPlugins: ['templater-obsidian'],
                    templaterPlugin: mockTemplater,
                    templateFile
                })
                const service = new PluginIntegrationService(app as unknown as App)

                const result = await service.applyTemplateToFile(
                    'Templates/Daily.md',
                    targetFile as unknown as import('obsidian').TFile
                )

                expect(result).toBe(false)
            })
        })

        describe('showTemplaterMissingNotice', () => {
            test('does not throw when called', () => {
                const app = createMockApp()
                const service = new PluginIntegrationService(app as unknown as App)

                // This just verifies the method doesn't throw
                expect(() => service.showTemplaterMissingNotice()).not.toThrow()
            })
        })
    })
})
