import { mock } from 'bun:test'

// Provide a minimal `window` global so Obsidian-targeted code (e.g. `window.setInterval`,
// `window.setTimeout`) runs in Bun's test environment, which has no DOM.
//
// `self` is the global object under Bun, and not a name obsidianmd/no-global-this
// bans (it only bans `global` and `globalThis`): this line is what creates the
// `window` the rule wants everything else to use. This is the headless test
// bootstrap, never bundled into the plugin.
const globalScope: { window?: unknown } = self
globalScope.window ??= globalScope

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
    Plugin: class Plugin {},
    TFolder: class TFolder {
        path: string = ''
        name: string = ''
    },
    // Base classes that plugin modules extend at import time. They only need to exist
    // as constructible classes; behaviour is exercised manually in a live vault.
    Component: class Component {},
    ItemView: class ItemView {},
    Modal: class Modal {},
    PluginSettingTab: class PluginSettingTab {},
    AbstractInputSuggest: class AbstractInputSuggest {},
    SuggestModal: class SuggestModal {},
    FuzzySuggestModal: class FuzzySuggestModal {},
    Setting: class Setting {},
    Menu: class Menu {},
    MarkdownRenderer: class MarkdownRenderer {},
    BasesView: class BasesView {},
    Scope: class Scope {},
    Platform: { isMobile: false, isDesktop: true },
    setIcon: (_el: unknown, _icon: string): void => undefined,
    normalizePath: (path: string): string => path,
    debounce: <T extends unknown[]>(fn: (...args: T) => unknown) => fn
}))
