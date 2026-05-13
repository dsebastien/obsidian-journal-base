import { mock } from 'bun:test'

// Provide minimal `window` global so Obsidian-targeted code (e.g. `window.setInterval`,
// `window.setTimeout`) runs in Bun's test environment, which has no DOM.
const g = globalThis as unknown as { window?: typeof globalThis }
if (!g.window) {
    g.window = globalThis
}

// Mock obsidian module before any tests run
// Note: This top-level await is intentional for module initialization
void mock.module('obsidian', () => ({
    Notice: class Notice {
        constructor(_message: string, _duration?: number) {}
    },
    App: class App {},
    TFile: class TFile {
        path: string = ''
        name: string = ''
        basename: string = ''
        extension: string = ''
    },
    Plugin: class Plugin {}
}))
