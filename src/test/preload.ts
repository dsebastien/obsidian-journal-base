import { mock } from 'bun:test'

// Mock obsidian module before any tests run
mock.module('obsidian', () => ({
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
