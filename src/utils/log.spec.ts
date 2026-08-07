import { afterEach, describe, expect, spyOn, test } from 'bun:test'

import { LOG_PREFIX, isDebugLoggingEnabled, log, setDebugLogging } from './log'

type ConsoleSpies = {
    debug: ReturnType<typeof spyOn>
    info: ReturnType<typeof spyOn>
    warn: ReturnType<typeof spyOn>
    error: ReturnType<typeof spyOn>
}

let activeSpies: ConsoleSpies | undefined

const spyOnConsole = (): ConsoleSpies => {
    const spies: ConsoleSpies = {
        debug: spyOn(console, 'debug').mockImplementation(() => undefined),
        info: spyOn(console, 'info').mockImplementation(() => undefined),
        warn: spyOn(console, 'warn').mockImplementation(() => undefined),
        error: spyOn(console, 'error').mockImplementation(() => undefined)
    }
    activeSpies = spies
    return spies
}

describe('log', () => {
    // Restore here rather than at the end of each test: a failing assertion
    // would otherwise leave the spy installed, and the next `spyOn` call would
    // hand back the same mock with its call history intact — turning one real
    // failure into several misleading ones.
    afterEach(() => {
        setDebugLogging(false)
        activeSpies?.debug.mockRestore()
        activeSpies?.info.mockRestore()
        activeSpies?.warn.mockRestore()
        activeSpies?.error.mockRestore()
        activeSpies = undefined
    })

    test('debug logging is disabled by default', () => {
        expect(isDebugLoggingEnabled()).toBe(false)
    })

    test('does not write to the console when debug logging is disabled', () => {
        const spies = spyOnConsole()

        log('hello')
        log('hello', 'debug')
        log('hello', 'info')
        log('hello', 'warn')
        log('hello', 'error')

        expect(spies.debug).not.toHaveBeenCalled()
        expect(spies.info).not.toHaveBeenCalled()
        expect(spies.warn).not.toHaveBeenCalled()
        expect(spies.error).not.toHaveBeenCalled()
    })

    test('writes to the matching console method once debug logging is enabled', () => {
        const spies = spyOnConsole()
        setDebugLogging(true)

        log('plain')
        log('a debug message', 'debug')
        log('an info message', 'info')
        log('a warn message', 'warn')
        log('an error message', 'error')

        // The default level, 'debug' and 'info' all land on console.debug:
        // Obsidian's plugin guidelines only permit warn, error and debug.
        expect(spies.debug).toHaveBeenCalledTimes(3)
        expect(spies.info).not.toHaveBeenCalled()
        expect(spies.warn).toHaveBeenCalledTimes(1)
        expect(spies.error).toHaveBeenCalledTimes(1)
    })

    test('never calls console.info, which the plugin guidelines disallow', () => {
        const spies = spyOnConsole()
        setDebugLogging(true)

        log('an info message', 'info')

        expect(spies.info).not.toHaveBeenCalled()
        expect(spies.debug).toHaveBeenLastCalledWith(`${LOG_PREFIX} an info message`)
    })

    test('prefixes the message and spreads extra data instead of passing an array', () => {
        const spies = spyOnConsole()
        setDebugLogging(true)

        log('no extra data', 'info')
        expect(spies.debug).toHaveBeenLastCalledWith(`${LOG_PREFIX} no extra data`)

        log('with extra data', 'info', 1, 'two')
        expect(spies.debug).toHaveBeenLastCalledWith(`${LOG_PREFIX} with extra data`, 1, 'two')

        log('a warning', 'warn', { a: 1 })
        expect(spies.warn).toHaveBeenLastCalledWith(`${LOG_PREFIX} a warning`, { a: 1 })
    })

    test('can be turned back off', () => {
        const spies = spyOnConsole()
        setDebugLogging(true)
        setDebugLogging(false)

        log('silent again', 'error')

        expect(isDebugLoggingEnabled()).toBe(false)
        expect(spies.error).not.toHaveBeenCalled()
    })
})
