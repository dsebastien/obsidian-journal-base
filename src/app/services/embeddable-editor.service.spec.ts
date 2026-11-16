import { beforeEach, describe, expect, test } from 'bun:test'
import { Component } from 'obsidian'
import { unfoldEffect } from '@codemirror/language'
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

    describe('foldFrontmatter', () => {
        const note = '---\ntitle: Note\n---\nBody\n'

        function createEditorWith(content: string): EmbeddableEditor {
            return new EmbeddableEditor(fake.app, new FakeElement().asHTMLElement(), {
                initialContent: content
            })
        }

        test('folds the frontmatter block', () => {
            const editor = createEditorWith(note)

            expect(editor.foldFrontmatter()).toBe(true)
            expect(createdEditor().dispatched.length).toBe(1)
        })

        test('dispatches nothing when the block is already folded', () => {
            // The card re-folds on every data update. A transaction that changes
            // nothing still runs every editor extension of every plugin.
            const editor = createEditorWith(note)
            editor.foldFrontmatter()

            expect(editor.foldFrontmatter()).toBe(false)
            expect(editor.foldFrontmatter()).toBe(false)
            expect(createdEditor().dispatched.length).toBe(1)
        })

        test('folds again when the fold was lost', () => {
            const editor = createEditorWith(note)
            editor.foldFrontmatter()
            const inner = createdEditor()
            // Obsidian drops the fold when it syncs a change inside the block
            // (the done property, for example)
            inner.cm.dispatch({
                effects: unfoldEffect.of({ from: 0, to: '---\ntitle: Note\n---'.length })
            })

            expect(editor.foldFrontmatter()).toBe(true)
            expect(inner.dispatched.length).toBe(3)
        })

        test('keeps the block folded when it grows', () => {
            const editor = createEditorWith(note)
            editor.foldFrontmatter()
            const inner = createdEditor()
            // CodeMirror moves the end of the folded range with the edit
            inner.cm.dispatch({ changes: { from: 4, insert: 'done: true\n' } })

            expect(editor.foldFrontmatter()).toBe(false)
            expect(inner.dispatched.length).toBe(2)
        })

        test('dispatches nothing for a note without frontmatter', () => {
            const editor = createEditorWith('Body only\n')

            expect(editor.foldFrontmatter()).toBe(false)
            expect(createdEditor().dispatched.length).toBe(0)
        })
    })

    test('leaves workspace.activeEditor alone when it is another editor', () => {
        const editor = createEditor()
        const other = { name: 'another editor' }
        fake.workspace.activeEditor = other

        editor.destroy()

        expect(fake.workspace.activeEditor).toBe(other)
    })
})
