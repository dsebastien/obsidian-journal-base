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

interface DomEventTarget {
    addEventListener(type: string, callback: unknown, options?: unknown): void
    removeEventListener(type: string, callback: unknown, options?: unknown): void
}

/**
 * Mirrors the lifecycle of Obsidian's `Component` (read from the app's own
 * code, 1.15.1). The part that matters: `unload()` returns at once when the
 * component was never loaded, so a component that nobody loaded never runs
 * `onunload()` and never unloads its children.
 */
class MockComponent {
    _loaded = false
    _children: MockComponent[] = []
    _events: Array<() => void> = []

    load(): void {
        if (this._loaded) return
        this._loaded = true
        this.onload()
        for (const child of this._children.slice()) {
            child.load()
        }
    }

    onload(): void {}

    unload(): void {
        if (!this._loaded) return
        this._loaded = false
        while (this._children.length > 0) {
            this._children.pop()?.unload()
        }
        while (this._events.length > 0) {
            this._events.pop()?.()
        }
        this.onunload()
    }

    onunload(): void {}

    addChild<T extends MockComponent>(child: T): T {
        this._children.push(child)
        if (this._loaded) child.load()
        return child
    }

    removeChild<T extends MockComponent>(child: T): T {
        const index = this._children.indexOf(child)
        if (index !== -1) {
            this._children.splice(index, 1)
            child.unload()
        }
        return child
    }

    register(callback: () => void): void {
        this._events.push(callback)
    }

    registerDomEvent(el: DomEventTarget, type: string, callback: unknown, options?: unknown): void {
        el.addEventListener(type, callback, options)
        this.register(() => el.removeEventListener(type, callback, options))
    }
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
    Plugin: class Plugin {},
    TFolder: class TFolder {
        path: string = ''
        name: string = ''
    },
    // Component follows Obsidian's real lifecycle (see `MockComponent`), so specs
    // can assert that cleanup really runs.
    Component: MockComponent,
    // Base classes that plugin modules extend at import time. They only need to exist
    // as constructible classes; behaviour is exercised manually in a live vault.
    ItemView: class ItemView {},
    Modal: class Modal {},
    PluginSettingTab: class PluginSettingTab {},
    AbstractInputSuggest: class AbstractInputSuggest {},
    SuggestModal: class SuggestModal {},
    FuzzySuggestModal: class FuzzySuggestModal {},
    Setting: class Setting {},
    Menu: class Menu {},
    MarkdownRenderer: class MarkdownRenderer {
        static async render(): Promise<void> {}
    },
    // A Bases view is a Component that takes `app` and `config` from its controller
    BasesView: class BasesView extends MockComponent {
        app: unknown
        config: unknown
        data: unknown
        constructor(controller?: { app?: unknown; config?: unknown }) {
            super()
            this.app = controller?.app
            this.config = controller?.config
        }
    },
    Scope: class Scope {
        register(): void {}
    },
    Platform: { isMobile: false, isDesktop: true },
    setIcon: (_el: unknown, _icon: string): void => undefined,
    normalizePath: (path: string): string => path,
    // Runs the function at once. `cancel` and `run` exist as on Obsidian's Debouncer.
    debounce: <T extends unknown[]>(fn: (...args: T) => unknown) =>
        Object.assign((...args: T) => fn(...args), {
            cancel: (): void => undefined,
            run: (): void => undefined
        })
}))
