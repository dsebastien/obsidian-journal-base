import { beforeEach, describe, expect, test } from 'bun:test'
import { Component } from 'obsidian'
import { EmbeddableEditor } from './embeddable-editor.service'
import {
    FakeElement,
    FakeMarkdownEditor,
    createFakeApp,
    installFakeActiveDocument,
    type FakeAppHandle
} from '../../test/mocks/editor'

/** The single editor the code under test created. */
function createdEditor(): FakeMarkdownEditor {
    const editor = FakeMarkdownEditor.instances[0]
    if (!editor) throw new Error('No editor was created')
    return editor
}

describe('EmbeddableEditor lifecycle (issue #55)', () => {
    let fake: FakeAppHandle

    beforeEach(() => {
        FakeMarkdownEditor.instances = []
        installFakeActiveDocument()
        fake = createFakeApp()
    })

    function createEditor(onChange?: (content: string) => void): EmbeddableEditor {
        return new EmbeddableEditor(fake.app, new FakeElement().asHTMLElement(), {
            initialContent: 'content',
            onChange
        })
    }

    test('destroys the temporary editor it creates to find the editor class', () => {
        createEditor()

        // The prototype is cached in the module, so at most one probe exists
        // per spec file. It must never stay alive.
        for (const probe of fake.probes) {
            expect(probe.destroyCount).toBe(1)
        }
        expect(fake.probes.length).toBeLessThanOrEqual(1)
    })

    test('destroy() destroys an editor that was never loaded', () => {
        // The bug: unload() is a no-op on a component that was never loaded
        const editor = createEditor()

        editor.unload()
        expect(createdEditor().isDestroyed).toBe(false)

        editor.destroy()
        expect(createdEditor().destroyCount).toBe(1)
        expect(editor.isEditorDestroyed()).toBe(true)
    })

    test('unload() destroys a loaded editor, once', () => {
        const parent = new Component()
        parent.load()
        const editor = parent.addChild(createEditor())

        parent.removeChild(editor)
        editor.destroy()
        editor.unload()

        expect(createdEditor().destroyCount).toBe(1)
    })

    test('unloading the parent destroys the editor', () => {
        const parent = new Component()
        parent.load()
        parent.addChild(createEditor())

        parent.unload()

        expect(createdEditor().destroyCount).toBe(1)
    })

    test('removes its DOM listeners and its key scope on unload', () => {
        const parent = new Component()
        parent.load()
        parent.addChild(createEditor())
        const contentDOM = createdEditor().cm.contentDOM
        expect(contentDOM.listenerCount()).toBe(2)

        contentDOM.emit('focusin')
        expect(fake.scopeStack.length).toBe(1)

        parent.unload()

        expect(contentDOM.listenerCount()).toBe(0)
        expect(fake.scopeStack.length).toBe(0)
    })

    test('reports user changes before destroy and none after it', () => {
        const changes: string[] = []
        const editor = createEditor((content) => changes.push(content))
        const inner = createdEditor()

        inner.content = 'edited'
        inner.onUpdate({}, true)
        expect(changes).toEqual(['edited'])

        editor.destroy()
        // An update that arrives during or after the teardown (an emptied
        // document, for example) must not be saved as the note content.
        inner.content = ''
        inner.onUpdate({}, true)
        expect(changes).toEqual(['edited'])
    })

    test('clears workspace.activeEditor when it points at the destroyed editor', () => {
        const editor = createEditor()
        createdEditor().cm.contentDOM.emit('focusin')
        expect(fake.workspace.activeEditor).toBe(createdEditor().owner)

        editor.destroy()

        expect(fake.workspace.activeEditor).toBeNull()
    })

    test('leaves workspace.activeEditor alone when it is another editor', () => {
        const editor = createEditor()
        const other = { name: 'another editor' }
        fake.workspace.activeEditor = other

        editor.destroy()

        expect(fake.workspace.activeEditor).toBe(other)
    })
})
