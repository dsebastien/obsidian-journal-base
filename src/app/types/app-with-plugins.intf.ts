import type { App, Plugin } from 'obsidian'

/**
 * Extend App to include the plugins property (exists at runtime but not in types)
 */
export interface AppWithPlugins extends App {
    plugins: {
        enabledPlugins: Set<string>
        getPlugin(id: string): Plugin | null
    }
}
