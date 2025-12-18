import { describe, expect, test, mock, beforeAll, beforeEach } from 'bun:test'

// Mock obsidian module before importing the service
const mockNotice = mock(() => {})

beforeAll(() => {
    mock.module('obsidian', () => ({
        Notice: mockNotice,
        App: class {},
        TFile: class {},
        TFolder: class {},
        Plugin: class {}
    }))
})

// Types for mocking
interface MockTFile {
    path: string
    name?: string
    basename?: string
    extension?: string
}

interface MockTFolder {
    path: string
    name?: string
}

interface MockVault {
    getFileByPath: ReturnType<typeof mock>
    getFolderByPath: ReturnType<typeof mock>
    create: ReturnType<typeof mock>
    createFolder: ReturnType<typeof mock>
}

interface MockWorkspace {
    getLeaf: ReturnType<typeof mock>
}

interface MockApp {
    plugins: {
        enabledPlugins: Set<string>
        getPlugin: ReturnType<typeof mock>
    }
    vault: MockVault
    workspace: MockWorkspace
}

// Helper to create a mock App
function createMockApp(
    options: {
        enabledPlugins?: string[]
        existingFile?: MockTFile | null
        existingFolders?: string[]
        templaterPlugin?: unknown
        createdFile?: MockTFile | null
    } = {}
): MockApp {
    const {
        enabledPlugins = [],
        existingFile = null,
        existingFolders = [],
        templaterPlugin = null,
        createdFile = null
    } = options

    const enabledPluginsSet = new Set(enabledPlugins)
    const folderSet = new Set(existingFolders)
    const createdFolders: string[] = []

    const mockVault: MockVault = {
        getFileByPath: mock((path: string) => {
            if (existingFile && existingFile.path === path) {
                return existingFile
            }
            return null
        }),
        getFolderByPath: mock((path: string) => {
            if (folderSet.has(path) || createdFolders.includes(path)) {
                return { path, name: path.split('/').pop() } as MockTFolder
            }
            return null
        }),
        create: mock(async (path: string, _content: string) => {
            const file: MockTFile = { path, name: path.split('/').pop() }
            return createdFile ?? file
        }),
        createFolder: mock(async (path: string) => {
            createdFolders.push(path)
            return { path, name: path.split('/').pop() } as MockTFolder
        })
    }

    const mockLeaf = {
        openFile: mock(async () => {})
    }

    const mockWorkspace: MockWorkspace = {
        getLeaf: mock(() => mockLeaf)
    }

    return {
        plugins: {
            enabledPlugins: enabledPluginsSet,
            getPlugin: mock((id: string) => {
                if (id === 'templater-obsidian' && templaterPlugin) {
                    return templaterPlugin
                }
                return null
            })
        },
        vault: mockVault,
        workspace: mockWorkspace
    }
}

// Import after mocking
import { NoteCreationService } from './note-creation.service'
import type { App } from 'obsidian'
import type { PeriodicNoteConfig, PeriodType } from '../types'

describe('NoteCreationService', () => {
    beforeEach(() => {
        mockNotice.mockClear()
    })

    describe('createPeriodicNote', () => {
        describe('file path construction', () => {
            test('creates file in the configured folder for daily notes', async () => {
                const app = createMockApp({
                    existingFolders: ['40 Journal/41 Daily Notes']
                })
                const service = new NoteCreationService(app as unknown as App)

                const config: PeriodicNoteConfig = {
                    enabled: true,
                    folder: '40 Journal/41 Daily Notes',
                    format: 'YYYY-MM-DD',
                    template: ''
                }

                const result = await service.createPeriodicNote(
                    new Date(2024, 0, 15), // Jan 15, 2024
                    config,
                    'daily'
                )

                expect(result).not.toBeNull()
                expect(app.vault.create).toHaveBeenCalledWith(
                    '40 Journal/41 Daily Notes/2024-01-15.md',
                    ''
                )
            })

            test('creates file in the configured folder for weekly notes', async () => {
                const app = createMockApp({
                    existingFolders: ['40 Journal/42 Weekly Notes']
                })
                const service = new NoteCreationService(app as unknown as App)

                const config: PeriodicNoteConfig = {
                    enabled: true,
                    folder: '40 Journal/42 Weekly Notes',
                    format: 'gggg-[W]ww',
                    template: ''
                }

                // Jan 15, 2024 is in week 3 of 2024
                const result = await service.createPeriodicNote(
                    new Date(2024, 0, 15),
                    config,
                    'weekly'
                )

                expect(result).not.toBeNull()
                expect(app.vault.create).toHaveBeenCalledWith(
                    '40 Journal/42 Weekly Notes/2024-W03.md',
                    ''
                )
            })

            test('creates file in the configured folder for monthly notes', async () => {
                const app = createMockApp({
                    existingFolders: ['40 Journal/43 Monthly Notes']
                })
                const service = new NoteCreationService(app as unknown as App)

                const config: PeriodicNoteConfig = {
                    enabled: true,
                    folder: '40 Journal/43 Monthly Notes',
                    format: 'YYYY-MM',
                    template: ''
                }

                const result = await service.createPeriodicNote(
                    new Date(2024, 5, 15), // June 15, 2024
                    config,
                    'monthly'
                )

                expect(result).not.toBeNull()
                expect(app.vault.create).toHaveBeenCalledWith(
                    '40 Journal/43 Monthly Notes/2024-06.md',
                    ''
                )
            })

            test('creates file in the configured folder for quarterly notes', async () => {
                const app = createMockApp({
                    existingFolders: ['40 Journal/44 Quarterly Notes']
                })
                const service = new NoteCreationService(app as unknown as App)

                const config: PeriodicNoteConfig = {
                    enabled: true,
                    folder: '40 Journal/44 Quarterly Notes',
                    format: 'YYYY-[Q]Q',
                    template: ''
                }

                const result = await service.createPeriodicNote(
                    new Date(2024, 9, 15), // Oct 15, 2024 - Q4
                    config,
                    'quarterly'
                )

                expect(result).not.toBeNull()
                expect(app.vault.create).toHaveBeenCalledWith(
                    '40 Journal/44 Quarterly Notes/2024-Q4.md',
                    ''
                )
            })

            test('creates file in the configured folder for yearly notes', async () => {
                const app = createMockApp({
                    existingFolders: ['40 Journal/45 Yearly Notes']
                })
                const service = new NoteCreationService(app as unknown as App)

                const config: PeriodicNoteConfig = {
                    enabled: true,
                    folder: '40 Journal/45 Yearly Notes',
                    format: 'YYYY',
                    template: ''
                }

                const result = await service.createPeriodicNote(
                    new Date(2024, 0, 1),
                    config,
                    'yearly'
                )

                expect(result).not.toBeNull()
                expect(app.vault.create).toHaveBeenCalledWith(
                    '40 Journal/45 Yearly Notes/2024.md',
                    ''
                )
            })

            test('uses different folders for different period types', async () => {
                // Test that each period type respects its own folder setting
                const dailyApp = createMockApp({ existingFolders: ['Daily'] })
                const weeklyApp = createMockApp({ existingFolders: ['Weekly'] })

                const dailyService = new NoteCreationService(dailyApp as unknown as App)
                const weeklyService = new NoteCreationService(weeklyApp as unknown as App)

                const dailyConfig: PeriodicNoteConfig = {
                    enabled: true,
                    folder: 'Daily',
                    format: 'YYYY-MM-DD',
                    template: ''
                }

                const weeklyConfig: PeriodicNoteConfig = {
                    enabled: true,
                    folder: 'Weekly',
                    format: 'gggg-[W]ww',
                    template: ''
                }

                await dailyService.createPeriodicNote(new Date(2024, 0, 15), dailyConfig, 'daily')
                await weeklyService.createPeriodicNote(
                    new Date(2024, 0, 15),
                    weeklyConfig,
                    'weekly'
                )

                expect(dailyApp.vault.create).toHaveBeenCalledWith('Daily/2024-01-15.md', '')
                expect(weeklyApp.vault.create).toHaveBeenCalledWith('Weekly/2024-W03.md', '')
            })
        })

        describe('duplicate prevention', () => {
            test('returns existing file without creating new one when file already exists', async () => {
                const existingFile: MockTFile = {
                    path: '40 Journal/41 Daily Notes/2024-01-15.md'
                }
                const app = createMockApp({
                    existingFile,
                    existingFolders: ['40 Journal/41 Daily Notes']
                })
                const service = new NoteCreationService(app as unknown as App)

                const config: PeriodicNoteConfig = {
                    enabled: true,
                    folder: '40 Journal/41 Daily Notes',
                    format: 'YYYY-MM-DD',
                    template: ''
                }

                const result = await service.createPeriodicNote(
                    new Date(2024, 0, 15),
                    config,
                    'daily'
                )

                // Should return existing file
                expect(result).toBe(existingFile as unknown as import('obsidian').TFile)
                // Should NOT call vault.create
                expect(app.vault.create).not.toHaveBeenCalled()
            })

            test('shows notice when file already exists', async () => {
                const existingFile: MockTFile = {
                    path: '40 Journal/41 Daily Notes/2024-01-15.md'
                }
                const app = createMockApp({
                    existingFile,
                    existingFolders: ['40 Journal/41 Daily Notes']
                })
                const service = new NoteCreationService(app as unknown as App)

                const config: PeriodicNoteConfig = {
                    enabled: true,
                    folder: '40 Journal/41 Daily Notes',
                    format: 'YYYY-MM-DD',
                    template: ''
                }

                await service.createPeriodicNote(new Date(2024, 0, 15), config, 'daily')

                expect(mockNotice).toHaveBeenCalledWith('Note already exists: 2024-01-15')
            })

            test('does not overwrite existing file content', async () => {
                const existingFile: MockTFile = {
                    path: '40 Journal/41 Daily Notes/2024-01-15.md'
                }
                const app = createMockApp({
                    existingFile,
                    existingFolders: ['40 Journal/41 Daily Notes']
                })
                const service = new NoteCreationService(app as unknown as App)

                const config: PeriodicNoteConfig = {
                    enabled: true,
                    folder: '40 Journal/41 Daily Notes',
                    format: 'YYYY-MM-DD',
                    template: 'Templates/Daily.md'
                }

                await service.createPeriodicNote(new Date(2024, 0, 15), config, 'daily')

                // Neither create nor any template application should occur
                expect(app.vault.create).not.toHaveBeenCalled()
            })
        })

        describe('folder creation', () => {
            test('creates folder if it does not exist', async () => {
                const app = createMockApp({
                    existingFolders: [] // No folders exist
                })
                const service = new NoteCreationService(app as unknown as App)

                const config: PeriodicNoteConfig = {
                    enabled: true,
                    folder: 'Journal',
                    format: 'YYYY-MM-DD',
                    template: ''
                }

                await service.createPeriodicNote(new Date(2024, 0, 15), config, 'daily')

                expect(app.vault.createFolder).toHaveBeenCalledWith('Journal')
            })

            test('creates nested folders recursively', async () => {
                const app = createMockApp({
                    existingFolders: [] // No folders exist
                })
                const service = new NoteCreationService(app as unknown as App)

                const config: PeriodicNoteConfig = {
                    enabled: true,
                    folder: '40 Journal/41 Daily Notes',
                    format: 'YYYY-MM-DD',
                    template: ''
                }

                await service.createPeriodicNote(new Date(2024, 0, 15), config, 'daily')

                // Should create both parent and child folders
                expect(app.vault.createFolder).toHaveBeenCalledWith('40 Journal')
                expect(app.vault.createFolder).toHaveBeenCalledWith('40 Journal/41 Daily Notes')
            })

            test('does not create folder if it already exists', async () => {
                const app = createMockApp({
                    existingFolders: ['40 Journal/41 Daily Notes']
                })
                const service = new NoteCreationService(app as unknown as App)

                const config: PeriodicNoteConfig = {
                    enabled: true,
                    folder: '40 Journal/41 Daily Notes',
                    format: 'YYYY-MM-DD',
                    template: ''
                }

                await service.createPeriodicNote(new Date(2024, 0, 15), config, 'daily')

                expect(app.vault.createFolder).not.toHaveBeenCalled()
            })

            test('handles empty folder path gracefully', async () => {
                const app = createMockApp({
                    existingFolders: []
                })
                const service = new NoteCreationService(app as unknown as App)

                const config: PeriodicNoteConfig = {
                    enabled: true,
                    folder: '',
                    format: 'YYYY-MM-DD',
                    template: ''
                }

                const result = await service.createPeriodicNote(
                    new Date(2024, 0, 15),
                    config,
                    'daily'
                )

                expect(result).not.toBeNull()
                // Should create file at vault root
                expect(app.vault.create).toHaveBeenCalledWith('/2024-01-15.md', '')
            })
        })

        describe('date normalization', () => {
            test('normalizes daily date to start of day', async () => {
                const app = createMockApp({
                    existingFolders: ['Daily']
                })
                const service = new NoteCreationService(app as unknown as App)

                const config: PeriodicNoteConfig = {
                    enabled: true,
                    folder: 'Daily',
                    format: 'YYYY-MM-DD',
                    template: ''
                }

                // Pass a date with time component
                await service.createPeriodicNote(new Date(2024, 0, 15, 14, 30, 45), config, 'daily')

                // Should still create file for 2024-01-15
                expect(app.vault.create).toHaveBeenCalledWith('Daily/2024-01-15.md', '')
            })

            test('normalizes weekly date to start of week (Monday)', async () => {
                const app = createMockApp({
                    existingFolders: ['Weekly']
                })
                const service = new NoteCreationService(app as unknown as App)

                const config: PeriodicNoteConfig = {
                    enabled: true,
                    folder: 'Weekly',
                    format: 'gggg-[W]ww',
                    template: ''
                }

                // Jan 17, 2024 is a Wednesday in week 3
                await service.createPeriodicNote(new Date(2024, 0, 17), config, 'weekly')

                // Should create file for week 3 (which starts Jan 15, 2024 Monday)
                expect(app.vault.create).toHaveBeenCalledWith('Weekly/2024-W03.md', '')
            })

            test('normalizes monthly date to start of month', async () => {
                const app = createMockApp({
                    existingFolders: ['Monthly']
                })
                const service = new NoteCreationService(app as unknown as App)

                const config: PeriodicNoteConfig = {
                    enabled: true,
                    folder: 'Monthly',
                    format: 'YYYY-MM',
                    template: ''
                }

                // Jan 25, 2024
                await service.createPeriodicNote(new Date(2024, 0, 25), config, 'monthly')

                // Should create file for 2024-01
                expect(app.vault.create).toHaveBeenCalledWith('Monthly/2024-01.md', '')
            })
        })

        describe('template handling', () => {
            test('uses Templater when template is configured and Templater is enabled', async () => {
                const createdFile: MockTFile = { path: 'Daily/2024-01-15.md' }
                const templateFile: MockTFile = { path: 'Templates/Daily.md' }
                const mockCreateFn = mock(async () => createdFile)
                const mockTemplater = {
                    templater: {
                        create_new_note_from_template: mockCreateFn
                    }
                }
                const app = createMockApp({
                    enabledPlugins: ['templater-obsidian'],
                    templaterPlugin: mockTemplater,
                    existingFolders: ['Daily']
                })
                // Override getFileByPath to return template file for template path
                app.vault.getFileByPath = mock((path: string) => {
                    if (path === 'Templates/Daily.md') return templateFile
                    return null
                })

                const service = new NoteCreationService(app as unknown as App)

                const config: PeriodicNoteConfig = {
                    enabled: true,
                    folder: 'Daily',
                    format: 'YYYY-MM-DD',
                    template: 'Templates/Daily.md'
                }

                const result = await service.createPeriodicNote(
                    new Date(2024, 0, 15),
                    config,
                    'daily'
                )

                expect(result).toBe(createdFile as unknown as import('obsidian').TFile)
                expect(mockCreateFn).toHaveBeenCalledWith(
                    templateFile,
                    'Daily',
                    '2024-01-15',
                    false
                )
            })

            test('falls back to empty file when Templater is not enabled', async () => {
                const app = createMockApp({
                    enabledPlugins: [], // Templater not enabled
                    existingFolders: ['Daily']
                })
                const service = new NoteCreationService(app as unknown as App)

                const config: PeriodicNoteConfig = {
                    enabled: true,
                    folder: 'Daily',
                    format: 'YYYY-MM-DD',
                    template: 'Templates/Daily.md' // Template configured but Templater not available
                }

                await service.createPeriodicNote(new Date(2024, 0, 15), config, 'daily')

                // Should create empty file
                expect(app.vault.create).toHaveBeenCalledWith('Daily/2024-01-15.md', '')
            })

            test('creates empty file when no template is configured', async () => {
                const app = createMockApp({
                    existingFolders: ['Daily']
                })
                const service = new NoteCreationService(app as unknown as App)

                const config: PeriodicNoteConfig = {
                    enabled: true,
                    folder: 'Daily',
                    format: 'YYYY-MM-DD',
                    template: '' // No template
                }

                await service.createPeriodicNote(new Date(2024, 0, 15), config, 'daily')

                expect(app.vault.create).toHaveBeenCalledWith('Daily/2024-01-15.md', '')
            })
        })

        describe('error handling', () => {
            test('returns null and shows notice when file creation fails', async () => {
                const app = createMockApp({
                    existingFolders: ['Daily']
                })
                app.vault.create = mock(async () => {
                    throw new Error('Failed to create file')
                })
                const service = new NoteCreationService(app as unknown as App)

                const config: PeriodicNoteConfig = {
                    enabled: true,
                    folder: 'Daily',
                    format: 'YYYY-MM-DD',
                    template: ''
                }

                const result = await service.createPeriodicNote(
                    new Date(2024, 0, 15),
                    config,
                    'daily'
                )

                expect(result).toBeNull()
                expect(mockNotice).toHaveBeenCalled()
            })
        })
    })

    describe('openPeriodicNote', () => {
        test('opens file in current leaf by default', async () => {
            const mockLeaf = {
                openFile: mock(async () => {})
            }
            const app = createMockApp()
            app.workspace.getLeaf = mock(() => mockLeaf)
            const service = new NoteCreationService(app as unknown as App)

            const file = { path: 'test.md' } as unknown as import('obsidian').TFile

            await service.openPeriodicNote(file)

            expect(app.workspace.getLeaf).toHaveBeenCalledWith()
            expect(mockLeaf.openFile).toHaveBeenCalledWith(file)
        })

        test('opens file in new tab when newLeaf is true', async () => {
            const mockLeaf = {
                openFile: mock(async () => {})
            }
            const app = createMockApp()
            app.workspace.getLeaf = mock(() => mockLeaf)
            const service = new NoteCreationService(app as unknown as App)

            const file = { path: 'test.md' } as unknown as import('obsidian').TFile

            await service.openPeriodicNote(file, true)

            expect(app.workspace.getLeaf).toHaveBeenCalledWith('tab')
            expect(mockLeaf.openFile).toHaveBeenCalledWith(file)
        })
    })

    describe('createAndOpenPeriodicNote', () => {
        test('creates note and opens it', async () => {
            const mockLeaf = {
                openFile: mock(async () => {})
            }
            const app = createMockApp({
                existingFolders: ['Daily']
            })
            app.workspace.getLeaf = mock(() => mockLeaf)
            const service = new NoteCreationService(app as unknown as App)

            const config: PeriodicNoteConfig = {
                enabled: true,
                folder: 'Daily',
                format: 'YYYY-MM-DD',
                template: ''
            }

            const result = await service.createAndOpenPeriodicNote(
                new Date(2024, 0, 15),
                config,
                'daily'
            )

            expect(result).not.toBeNull()
            expect(app.vault.create).toHaveBeenCalled()
            expect(mockLeaf.openFile).toHaveBeenCalled()
        })

        test('does not open file when creation fails', async () => {
            const existingFile: MockTFile = { path: 'Daily/2024-01-15.md' }
            const mockLeaf = {
                openFile: mock(async () => {})
            }
            const app = createMockApp({
                existingFile,
                existingFolders: ['Daily']
            })
            app.vault.create = mock(async () => {
                throw new Error('Failed')
            })
            // Override getFileByPath to simulate no existing file initially but creation fails
            app.vault.getFileByPath = mock(() => null)
            app.workspace.getLeaf = mock(() => mockLeaf)
            const service = new NoteCreationService(app as unknown as App)

            const config: PeriodicNoteConfig = {
                enabled: true,
                folder: 'Daily',
                format: 'YYYY-MM-DD',
                template: ''
            }

            const result = await service.createAndOpenPeriodicNote(
                new Date(2024, 0, 15),
                config,
                'daily'
            )

            expect(result).toBeNull()
            expect(mockLeaf.openFile).not.toHaveBeenCalled()
        })
    })

    describe('business rule compliance', () => {
        test('file path follows pattern: {folder}/{formatted_date}.md', async () => {
            const app = createMockApp({
                existingFolders: ['My/Custom/Folder']
            })
            const service = new NoteCreationService(app as unknown as App)

            const config: PeriodicNoteConfig = {
                enabled: true,
                folder: 'My/Custom/Folder',
                format: 'DD-MM-YYYY',
                template: ''
            }

            await service.createPeriodicNote(new Date(2024, 0, 15), config, 'daily')

            expect(app.vault.create).toHaveBeenCalledWith('My/Custom/Folder/15-01-2024.md', '')
        })

        test('respects folder setting for each period type independently', async () => {
            const tests: Array<{ periodType: PeriodType; folder: string; format: string }> = [
                { periodType: 'daily', folder: 'Journal/Daily', format: 'YYYY-MM-DD' },
                { periodType: 'weekly', folder: 'Journal/Weekly', format: 'gggg-[W]ww' },
                { periodType: 'monthly', folder: 'Journal/Monthly', format: 'YYYY-MM' },
                { periodType: 'quarterly', folder: 'Journal/Quarterly', format: 'YYYY-[Q]Q' },
                { periodType: 'yearly', folder: 'Journal/Yearly', format: 'YYYY' }
            ]

            for (const { periodType, folder, format } of tests) {
                const app = createMockApp({ existingFolders: [folder] })
                const service = new NoteCreationService(app as unknown as App)

                const config: PeriodicNoteConfig = {
                    enabled: true,
                    folder,
                    format,
                    template: ''
                }

                await service.createPeriodicNote(new Date(2024, 0, 15), config, periodType)

                const createCall = app.vault.create.mock.calls[0]
                expect(createCall?.[0]).toMatch(new RegExp(`^${folder}/`))
            }
        })
    })
})
