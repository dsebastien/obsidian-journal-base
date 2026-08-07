import * as pluginManifest from '../../manifest.json'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export const LOG_SEPARATOR = '--------------------------------------------------------'
export const LOG_PREFIX = `${pluginManifest.name}:`

/**
 * Whether verbose logging to the developer console is enabled.
 * Defaults to false: the plugin must stay silent during normal operation.
 */
let debugLoggingEnabled = false

/**
 * Enable or disable logging to the developer console.
 * Meant to be called by the plugin when a debug/verbose setting changes.
 * @param enabled
 */
export const setDebugLogging = (enabled: boolean): void => {
    debugLoggingEnabled = enabled
}

/**
 * Whether logging to the developer console is currently enabled.
 */
export const isDebugLoggingEnabled = (): boolean => debugLoggingEnabled

/**
 * Log a message. No-op unless debug logging has been explicitly enabled.
 * @param message
 * @param level
 * @param data
 */
export const log = (message: string, level?: LogLevel, ...data: unknown[]): void => {
    if (!debugLoggingEnabled) {
        return
    }

    const logMessage = `${LOG_PREFIX} ${message}`
    switch (level) {
        // Obsidian's guidelines allow only warn, error and debug on the console
        // (obsidianmd/rule-custom-message wrapping no-console), so 'info' is
        // emitted through console.debug too. Empty case, no fallthrough warning.
        case 'debug':
        case 'info':
            console.debug(logMessage, ...data)
            break
        case 'warn':
            console.warn(logMessage, ...data)
            break
        case 'error':
            console.error(logMessage, ...data)
            break
        default:
            // Obsidian requires console.debug for normal logs
            console.debug(logMessage, ...data)
    }
}
