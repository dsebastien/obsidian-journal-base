import { afterEach, beforeEach, describe, expect, spyOn, test, type Mock } from 'bun:test'
import { Component, MarkdownRenderer } from 'obsidian'
import { NoteCard, type NoteCardOptions } from './note-card'
import {
    FakeElement,
    FakeMarkdownEditor,
    createFakeApp,
    createFakeFile,
    flushPromises,
    installFakeActiveDocument,
    type FakeAppHandle
} from '../../test/mocks/editor'

/** What the specs read from the mocked Component (see src/test/preload.ts). */
interface LoadState {
    _loaded: boolean
}

function isLoaded(component: Component): boolean {
    return (component as unknown as LoadState)._loaded
}

describe('NoteCard lifecycle (issue #55)', () => {
    let fake: FakeAppHandle
    let renderSpy: Mock<typeof MarkdownRenderer.render>
    /** The component passed to each MarkdownRenderer.render call, in order. */
    let renderComponents: Component[]

    beforeEach(() => {
        FakeMarkdownEditor.instances = []
        installFakeActiveDocument()
        fake = createFakeApp()
        renderComponents = []
        renderSpy = spyOn(MarkdownRenderer, 'render').mockImplementation(
            (_app, _markdown, _el, _sourcePath, component) => {
                renderComponents.push(component)
                return Promise.resolve()
            }
        )
    })

    afterEach(() => {
        renderSpy.mockRestore()
    })

    function createCard(options?: NoteCardOptions): NoteCard {
        return new NoteCard(
            new FakeElement().asHTMLElement(),
            fake.app,
            createFakeFile('Journal/2026-10.md'),
            'monthly',
            new Date(2026, 9, 1),
            true,
            undefined,
            options
        )
    }

    /** A card as the Periodic Review view creates it: always a source editor. */
    async function createEditorCard(): Promise<NoteCard> {
        const card = createCard({ foldable: false, forcedMode: 'source', hideModeToggle: true })
        fake.resolveReads('note content')
        await flushPromises()
        return card
    }

    test('unload() destroys the editor of the card', async () => {
        const card = await createEditorCard()
        expect(FakeMarkdownEditor.instances.length).toBe(1)
        expect(FakeMarkdownEditor.instances[0]?.isDestroyed).toBe(false)

        card.unload()

        expect(FakeMarkdownEditor.instances[0]?.destroyCount).toBe(1)
    })

    test('no editor stays alive after many cards are created and unloaded', async () => {
        for (let i = 0; i < 5; i++) {
            const card = await createEditorCard()
            card.unload()
        }

        expect(FakeMarkdownEditor.instances.length).toBe(5)
        expect(FakeMarkdownEditor.instances.filter((editor) => !editor.isDestroyed)).toEqual([])
    })

    test('a mode change destroys the editor of the previous mode', async () => {
        const card = createCard()
        fake.resolveReads('note content')
        await flushPromises()

        card.setMode('source')
        fake.resolveReads('note content')
        await flushPromises()
        card.setMode('edit')
        fake.resolveReads('note content')
        await flushPromises()

        expect(FakeMarkdownEditor.instances.length).toBe(2)
        expect(FakeMarkdownEditor.instances[0]?.destroyCount).toBe(1)
        expect(FakeMarkdownEditor.instances[1]?.isDestroyed).toBe(false)

        card.setMode('view')
        fake.resolveReads('note content')
        await flushPromises()

        expect(FakeMarkdownEditor.instances[1]?.destroyCount).toBe(1)
    })

    test('creates no editor when the card is unloaded while the note is read', async () => {
        const card = createCard({ foldable: false, forcedMode: 'source' })
        expect(fake.pendingReadCount()).toBe(1)

        card.unload()
        fake.resolveReads('note content')
        await flushPromises()

        expect(FakeMarkdownEditor.instances.length).toBe(0)
    })

    test('creates one editor when two loads overlap', async () => {
        const card = createCard()
        // The first load (reading view) still reads the file when the mode changes
        card.setMode('source')
        expect(fake.pendingReadCount()).toBe(2)

        fake.resolveReads('note content')
        await flushPromises()

        expect(FakeMarkdownEditor.instances.length).toBe(1)
        expect(renderComponents.length).toBe(0)

        card.unload()
        expect(FakeMarkdownEditor.instances[0]?.destroyCount).toBe(1)
    })

    test('does nothing after unload', async () => {
        const card = createCard()
        fake.resolveReads('note content')
        await flushPromises()
        card.unload()

        card.setMode('source')
        fake.resolveReads('note content')
        await flushPromises()

        expect(FakeMarkdownEditor.instances.length).toBe(0)
    })

    test('a new reading-view render unloads the children of the previous render', async () => {
        const card = createCard()
        fake.resolveReads('first')
        await flushPromises()
        expect(renderComponents.length).toBe(1)
        const firstRender = renderComponents[0] as Component
        // The render does not get the card itself: the card lives longer than a render
        expect(firstRender).not.toBe(card)
        expect(isLoaded(firstRender)).toBe(true)

        const refresh = card.refreshContent()
        fake.resolveReads('second')
        expect(await refresh).toBe(true)

        expect(renderComponents.length).toBe(2)
        const secondRender = renderComponents[1] as Component
        expect(isLoaded(firstRender)).toBe(false)
        expect(isLoaded(secondRender)).toBe(true)

        card.unload()
        expect(isLoaded(secondRender)).toBe(false)
    })

    test('saves an edit that was made before the card was unloaded', async () => {
        const card = await createEditorCard()
        const editor = FakeMarkdownEditor.instances[0] as FakeMarkdownEditor

        editor.content = 'edited content'
        editor.onUpdate({}, true)
        card.unload()
        // Nothing the teardown does can replace the saved content
        editor.content = ''
        editor.onUpdate({}, true)

        expect(fake.saved).toEqual(['edited content'])
    })
})
