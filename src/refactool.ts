import * as vsc from 'vscode'
import { MemFS } from './memFs'
import { defer } from './utils'
import { Emitter } from 'evtmitter'
import { minimatch } from 'minimatch'
import { posix } from 'path'

// Version: 0.1.0

type LanguageId =
  | 'javascript'
  | 'typescript'
  | 'typescriptreact'
  | 'json'
  | 'markdown'
  | 'html'
  | 'css'
  | 'scss'
  | 'python'
  | 'java'
  | 'csharp'
  | 'cpp'
  | 'c'
  | 'go'
  | 'ruby'
  | 'php'
  | 'perl'
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {})

export type RefactorConfig<V extends string> = {
  name: string
  description?: string
  enabledWhen?: {
    hasSelection?: true
    activeFileContains?: string
    activeLanguageIs?: LanguageId[]
  }
  variants?: { default?: string } & {
    [K in V]: string
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function config<T extends string = string>(cfg: RefactorConfig<T>) {
  return undefined
}

let refactorCtx: RefacToolsCtx<string> | null = null

type RefactorFn<V extends string> = (ctx: RefacToolsCtx<V>) => Promise<void> | void

type EditorMethods = {
  getSelected: () => Promise<Selected | null>
  getCursorPos: () => Promise<number>
  format: () => Promise<void>
  setContent: (content: string) => Promise<void>
  save: () => Promise<void>
  replaceContent: (
    content: string,
    range: { start: number; end: number },
  ) => Promise<void>
  insertContent: (content: string, position: number) => Thenable<void>
  focus: () => Thenable<void>
  filename: string
  filepath: string
  editorUri: vsc.Uri
  language: LanguageId
  extension: string
  getContent: () => Thenable<string>
}

type Selected = {
  replaceWith: (code: string) => Promise<void>
  text: string
  language: LanguageId
  range: {
    start: number
    end: number
  }
  editorUri: vsc.Uri
}

export type RefacToolsCtx<V extends string> = {
  variant: V
  history: {
    getLast: () => {
      get: <T>(key: string) => T | undefined
      variant: string
    } | null
    getAll: () => Record<string, unknown>[]
    add: (key: string, value: any) => void
  }
  log: (value: any) => void
  ide: {
    showInfoMessage: (message: string) => void
    showErrorMessage: (message: string) => void
    showWarningMessage: (message: string) => void
    newUnsavedFile: (editorProps: {
      content: string
      language?: string
      filename?: string
      editorGroup?: 'right' | 'current'
    }) => Promise<void>
    getEditor: (filePath: string) => EditorMethods | null
    openFile: (
      filePath: string,
      editorGroup?: 'right' | 'current',
    ) => Promise<EditorMethods | null>
    setGeneralProgress: (progress: {
      message?: string | undefined
      increment?: number | undefined
    }) => void
    showProgress: <T>(
      message: string,
      action: (runCtx: {
        abort: AbortController
        token: vsc.CancellationToken
      }) => Promise<T>,
    ) => Thenable<T>
    setCommandPaletteOptions: <T extends string>(
      options: {
        label: string
        description?: string
        value: T
      }[],
      onSelected: (value: T) => void,
    ) => void
  }
  fs: {
    memFs: MemFS
    createTempFile: (
      extension: string,
      initialContent?: string,
    ) => {
      uri: vsc.Uri
      dispose: () => void
      update: (content: string) => void
      getContent: () => string
      openEditor: (editorGroup?: 'right' | 'current') => Promise<EditorMethods>
    }
    createMemFsPath: (path: string) => void
    getWorkspacePath: () => string
    getPathRelativeToWorkspace: (relativePath: string) => string
    writeFile: (filePath: string, content: string) => Thenable<void>
    createFile: (filePath: string, content: string) => Thenable<void>
    readFile: (filePath: string) => Thenable<string>
    fileExists: (filePath: string) => Thenable<boolean>
    deleteFile: (filePath: string) => Thenable<void>
    moveFile: (filePath: string, newFilePath: string) => Thenable<void>
    createFolder: (dirPath: string) => Thenable<void>
    moveFolder: (dirPath: string, newDirPath: string) => Thenable<void>
    deleteFolder: (dirPath: string) => Thenable<void>
    renameFolder: (dirPath: string, newDirPath: string) => Thenable<void>
    renameFile: (filePath: string, newFilePath: string) => Thenable<void>
    readDirectory: (
      dirPath: string,
      options?: {
        filesFilter?: string[] | false
        includeFolders?: true | string[]
        recursive?: boolean
      },
    ) => Thenable<
      {
        path: string
        name: string
        nameWithoutExtension: string
        type: 'file' | 'folder'
      }[]
    >
  }
  activeEditor: EditorMethods
  showDiff: (props: {
    title?: string
    original: string | Selected | { editor: EditorMethods; replaceAtOffset: number }
    refactored: string
    ext?: string
  }) => Promise<string | false>
  onCancel: (fn: () => void) => void
  forceCancel: () => void
  vscodeCtx: typeof vsc
  prompt: {
    text: (message: string) => Promise<string | false>
    quickPick: <T extends string>(props: {
      options: { label: string; value: T }[]
      title: string
      defaultValue?: T
    }) => Promise<T | false>
    multiQuickPick: <T extends string>(props: {
      options: { label: string; value: T }[]
      title: string
      defaultValue?: T[]
    }) => Promise<T[] | false>
    waitTextSelection: (message: string, buttonLabel: string) => Promise<Selected | false>
    dialog: (
      message: string,
      options?: {
        title?: string
        buttons?: string[]
      },
    ) => Promise<string | boolean>
  }
}

export type RefactoringEvents = {
  cancel: undefined
  cancelParent: undefined
}

export type HistoryEntry = {
  runs: { values: Record<string, unknown>; variant: string }[]
}

/** @internal */
export function initializeCtx(
  vscode: typeof vsc,
  memFs: MemFS,
  refactoringEvents: Emitter<RefactoringEvents>,
  variant: string | null,
  activeWorkspaceFolder: vsc.WorkspaceFolder | null,
  setGeneralProgress: vsc.Progress<{ message?: string; increment?: number }>,
  addValueToHistory: (key: string, value: any) => void,
  getHistory: () => HistoryEntry,
  logOnExtChannel: (value: any) => void,
) {
  let isCancelled = false

  function throwIfCancelled() {
    if (isCancelled) {
      throw new Error('Cancelled refactoring')
    }
  }

  const initialActiveEditor = vscode.window.activeTextEditor

  if (!initialActiveEditor) {
    return
  }

  async function focusEditor(editor: vsc.TextEditor | undefined) {
    if (editor) {
      await vscode.window.showTextDocument(editor.document)
    }
  }

  refactoringEvents.on('cancel', () => {
    isCancelled = true
  })

  const showDiff: RefacToolsCtx<string>['showDiff'] = async ({
    title,
    original,
    refactored,
    ext: _ext,
  }) => {
    throwIfCancelled()

    const ext = _ext ? `.${_ext}` : ''

    const leftUri =
      typeof original === 'string' ? vscode.Uri.parse(`refactoolsfs:/diff.original${ext}`)
      : 'editor' in original ? original.editor.editorUri
      : original.editorUri

    if (typeof original === 'string') {
      memFs.writeFile(leftUri, Buffer.from(original), {
        create: true,
        overwrite: true,
      })
    }

    const virtualRefactoredFileUri = vscode.Uri.parse(
      `refactoolsfs:/diff.refactored${ext}`,
    )

    let refactoredFile = refactored

    if (typeof original !== 'string') {
      const originalFileContent = (await vscode.workspace.fs.readFile(leftUri)).toString()

      if ('replaceAtOffset' in original) {
        refactoredFile =
          originalFileContent.slice(0, original.replaceAtOffset) +
          refactored +
          originalFileContent.slice(original.replaceAtOffset)
      } else {
        refactoredFile =
          originalFileContent.slice(0, original.range.start) +
          refactored +
          originalFileContent.slice(original.range.end)
      }
    }

    memFs.writeFile(virtualRefactoredFileUri, Buffer.from(refactoredFile), {
      create: true,
      overwrite: false,
    })

    await vscode.commands.executeCommand(
      'vscode.diff',
      leftUri,
      virtualRefactoredFileUri,
      title ?? 'Confirm refactoring',
      {
        preview: true,
      },
    )

    const diffEditor = vscode.window.visibleTextEditors.find(
      (editor) => editor.document.uri.toString() === virtualRefactoredFileUri.toString(),
    )

    const userResponse = defer<string | false>()

    const dispose = vscode.commands.registerCommand(
      'refactools.acceptRefactoring',
      () => {
        userResponse.resolve(diffEditor?.document.getText() ?? false)
      },
    )

    const previewIsClosedDispose = vscode.workspace.onDidCloseTextDocument((doc) => {
      if (doc.uri.toString() === virtualRefactoredFileUri.toString()) {
        userResponse.resolve(false)
      }
    })

    refactoringEvents.on('cancel', () => {
      userResponse.resolve(false)
    })

    const result = await userResponse.promise

    dispose.dispose()
    previewIsClosedDispose.dispose()

    if (diffEditor) {
      await vscode.window.showTextDocument(diffEditor.document)
      vscode.commands.executeCommand('workbench.action.closeActiveEditor')
    }

    return result
  }

  async function promptText(message: string) {
    throwIfCancelled()

    await sleep(50)

    const input = await vscode.window.showInputBox({
      prompt: message,
    })

    return input || false
  }

  function getEditorMethods(_editor: vsc.TextEditor): EditorMethods {
    const editorUri = _editor.document.uri

    const getEditor = async () => {
      const editor = vscode.window.visibleTextEditors.find(
        (editor) => editor.document.uri.toString() === editorUri.toString(),
      )

      if (!editor) {
        return await vscode.window.showTextDocument(
          await vscode.workspace.openTextDocument(editorUri),
        )
      }

      return editor
    }

    const getSelected: RefacToolsCtx<string>['activeEditor']['getSelected'] =
      async () => {
        if (isCancelled) return null

        const editor = await getEditor()

        await focusEditor(editor)

        if (editor.selection.isEmpty) {
          return null
        }

        const text = editor.document.getText(editor.selection)

        return {
          text,
          language: editor.document.languageId as LanguageId,
          range: {
            start: editor.document.offsetAt(editor.selection.start),
            end: editor.document.offsetAt(editor.selection.end),
          },
          editorUri: editor.document.uri,
          replaceWith: async (code: string) => {
            const edtr = await getEditor()

            await edtr.edit((editBuilder) => {
              editBuilder.replace(edtr.selection, code)
            })
          },
        }
      }
    return {
      getSelected,
      language: _editor.document.languageId as LanguageId,
      extension: _editor.document.fileName.split('.').pop() ?? '',
      save: async () => {
        if (isCancelled) return

        const editor = await getEditor()

        await editor.document.save()
      },
      editorUri: _editor.document.uri,
      async getCursorPos() {
        if (isCancelled) return 0

        const editor = await getEditor()

        return editor.document.offsetAt(editor.selection.active)
      },
      async setContent(content) {
        if (isCancelled) return

        const editor = await getEditor()

        editor.edit((editBuilder) => {
          const fullRange = editor.document.validateRange(
            new vscode.Range(
              new vscode.Position(0, 0),
              new vscode.Position(Number.MAX_VALUE, Number.MAX_VALUE),
            ),
          )

          editBuilder.replace(fullRange, content)
        })
      },
      format: async () => {
        if (isCancelled) return

        await vscode.commands.executeCommand('editor.action.formatDocument')
      },
      async insertContent(content, position) {
        if (isCancelled) return

        const editor = await getEditor()

        editor.edit((editBuilder) => {
          editBuilder.insert(editor.document.positionAt(position), content)
        })
      },
      async replaceContent(content, range) {
        if (isCancelled) return

        const editor = await getEditor()

        editor.edit((editBuilder) => {
          editBuilder.replace(
            new vscode.Range(
              editor.document.positionAt(range.start),
              editor.document.positionAt(range.end),
            ),
            content,
          )
        })
      },
      filename: _editor.document.fileName,
      filepath: _editor.document.uri.fsPath,
      getContent: async () => {
        const editor = await getEditor()

        return editor.document.getText()
      },
      focus: async () => {
        if (isCancelled) return

        const editor = await getEditor()

        await focusEditor(editor)
      },
    }
  }

  let disposeCommandPaletteOptions: (() => void) | null = null

  refactoringEvents.on('cancel', () => {
    disposeCommandPaletteOptions?.()
  })

  const createTempFile: RefacToolsCtx<string>['fs']['createTempFile'] = (
    extension: string,
    initialContent = '',
  ) => {
    const uri = vscode.Uri.parse(
      `refactoolsfs:/temp-file-${Date.now()}${
        extension.startsWith('.') ? '' : '.'
      }${extension}`,
    )

    memFs.writeFile(uri, Buffer.from(initialContent), {
      create: true,
      overwrite: true,
    })

    return {
      uri,
      dispose() {
        memFs.delete(uri)
      },
      update(content: string) {
        memFs.writeFile(uri, Buffer.from(content), {
          create: true,
          overwrite: true,
        })
      },
      getContent() {
        return memFs.readFile(uri).toString()
      },
      async openEditor(editorGroup: 'right' | 'current' = 'current') {
        const editor = await vscode.workspace.openTextDocument(uri)

        await vscode.window.showTextDocument(
          editor,
          editorGroup === 'current' ? vscode.ViewColumn.Active : vscode.ViewColumn.Beside,
        )

        return getEditorMethods(vscode.window.activeTextEditor!)
      },
    }
  }

  refactorCtx = {
    onCancel(fn) {
      refactoringEvents.on('cancel', fn)
    },
    forceCancel() {
      refactoringEvents.emit('cancelParent')
    },
    log: logOnExtChannel,
    history: {
      add(key, value) {
        addValueToHistory(key, value)
      },
      getLast() {
        const lastHistoryEntry = getHistory().runs.at(-1)

        if (!lastHistoryEntry) {
          return null
        }

        return {
          get(key) {
            return lastHistoryEntry.values[key] as any
          },
          variant: lastHistoryEntry.variant,
        }
      },
      getAll() {
        return getHistory().runs.map((run) => run.values)
      },
    },
    prompt: {
      text: promptText,
      async quickPick({ options, title, defaultValue }) {
        throwIfCancelled()

        const selected = await vscode.window.showQuickPick(
          options.map(({ label, value }) => ({
            label,
            value,
            picked: value === defaultValue,
          })),
          { title },
        )

        return selected?.value || false
      },
      async multiQuickPick({ options, title, defaultValue }) {
        throwIfCancelled()

        const selected = await vscode.window.showQuickPick(
          options.map(({ label, value }) => ({
            label,
            value,
            picked: defaultValue?.includes(value) ?? false,
          })),
          { title, canPickMany: true },
        )

        return selected?.map((s) => s.value) || false
      },
      async waitTextSelection(message, buttonLabel) {
        throwIfCancelled()

        const selected = await vscode.window.showInformationMessage(message, buttonLabel)

        if (!selected) {
          return false
        }

        const selectedText = await getEditorMethods(
          vscode.window.activeTextEditor!,
        ).getSelected()

        if (!selectedText) {
          return false
        }

        return selectedText
      },
      async dialog(message, options) {
        throwIfCancelled()

        const selected = await vscode.window.showInformationMessage(
          message,
          ...(options?.buttons ?? []),
        )

        if (!selected) {
          return false
        }

        return selected
      },
    },
    variant: variant as any,
    vscodeCtx: vscode,
    ide: {
      setGeneralProgress(progress) {
        throwIfCancelled()

        setGeneralProgress.report(progress)
      },
      showProgress: (message, action) => {
        throwIfCancelled()

        return vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: message,
            cancellable: true,
          },
          async (progress, token) => {
            const abortController = new AbortController()

            token.onCancellationRequested(() => {
              refactoringEvents.emit('cancelParent')
              abortController.abort()
            })

            let resolveCancel: () => void

            return Promise.race([
              action({
                abort: abortController,
                token,
              }),
              new Promise<never>((res, reject) => {
                refactoringEvents.on('cancel', () => {
                  reject(true)
                })

                resolveCancel = () => {
                  reject(true)
                }
              }),
            ]).finally(() => {
              resolveCancel()
            })
          },
        )
      },
      showInfoMessage: (message: string) => {
        if (isCancelled) return

        vscode.window.showInformationMessage(message)
      },
      showErrorMessage: (message: string) => {
        if (isCancelled) return

        vscode.window.showErrorMessage(message)
      },
      showWarningMessage: (message: string) => {
        if (isCancelled) return

        vscode.window.showWarningMessage(message)
      },
      newUnsavedFile: async ({ content, language, editorGroup }) => {
        const editor = await vscode.workspace.openTextDocument({
          language,
          content,
        })

        await vscode.window.showTextDocument(
          editor,
          editorGroup === 'current' ? vscode.ViewColumn.Active : vscode.ViewColumn.Beside,
        )
      },
      getEditor: (filePath) => {
        if (isCancelled) return null

        const editor = vscode.window.visibleTextEditors.find(
          (editor) => editor.document.uri.fsPath === filePath,
        )

        return editor ? getEditorMethods(editor) : null
      },
      async openFile(filePath, editorGroup: 'right' | 'current' = 'current') {
        if (isCancelled) {
          return null
        }

        const editor = await vscode.workspace.openTextDocument(filePath)

        await vscode.window.showTextDocument(
          editor,
          editorGroup === 'current' ? vscode.ViewColumn.Active : vscode.ViewColumn.Beside,
        )

        return getEditorMethods(vscode.window.activeTextEditor!)
      },
      setCommandPaletteOptions(options, onSelected) {
        if (isCancelled) return

        disposeCommandPaletteOptions?.()

        vscode.commands.executeCommand(
          'setContext',
          'refactools.refactoringOptionsAvailable',
          true,
        )

        const disposable = vscode.commands.registerCommand(
          'refactools.selectCommandPaletteOption',
          async () => {
            const selected = await vscode.window.showQuickPick(
              options.map(({ label, description, value }) => ({
                label,
                description,
                value,
              })),
              { title: 'Select option' },
            )

            if (selected) {
              onSelected(selected.value)
            }
          },
        )

        disposeCommandPaletteOptions = () => {
          disposable.dispose()
          vscode.commands.executeCommand(
            'setContext',
            'refactools.refactoringOptionsAvailable',
            false,
          )
        }
      },
    },
    fs: {
      memFs,
      createTempFile,
      createMemFsPath(path) {
        throwIfCancelled()

        return `refactoolsfs:/${path}`
      },
      getWorkspacePath() {
        throwIfCancelled()

        if (!activeWorkspaceFolder) {
          throw new Error('No active workspace folder')
        }

        return activeWorkspaceFolder.uri.path
      },
      getPathRelativeToWorkspace(relativePath) {
        throwIfCancelled()

        if (!activeWorkspaceFolder) {
          throw new Error('No active workspace folder')
        }

        return posix.join(activeWorkspaceFolder.uri.path, relativePath)
      },
      async writeFile(filePath, content) {
        throwIfCancelled()

        const uri = vscode.Uri.file(filePath)

        await vscode.workspace.fs.writeFile(uri, Buffer.from(content))
      },
      createFolder(dirPath) {
        throwIfCancelled()

        return vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath))
      },
      async createFile(filePath, content) {
        throwIfCancelled()

        const uri = vscode.Uri.file(filePath)

        const fileExists = await vscode.workspace.fs.stat(uri).then(
          () => true,
          () => false,
        )

        if (fileExists) {
          throw new Error(`File already exists: ${filePath}`)
        }

        await vscode.workspace.fs.writeFile(uri, Buffer.from(content))
      },
      deleteFile(filePath) {
        throwIfCancelled()

        return vscode.workspace.fs.delete(vscode.Uri.file(filePath))
      },
      async readFile(filePath) {
        throwIfCancelled()

        const uri = vscode.Uri.file(filePath)

        const fileContent = await vscode.workspace.fs.readFile(uri)

        return fileContent.toString()
      },
      fileExists(filePath) {
        throwIfCancelled()

        return vscode.workspace.fs.stat(vscode.Uri.file(filePath)).then(
          () => true,
          () => false,
        )
      },
      moveFile(filePath, newFilePath) {
        throwIfCancelled()

        return vscode.workspace.fs.rename(
          vscode.Uri.file(filePath),
          vscode.Uri.file(newFilePath),
        )
      },
      renameFile(filePath, newFilePath) {
        throwIfCancelled()

        return vscode.workspace.fs.rename(
          vscode.Uri.file(filePath),
          vscode.Uri.file(newFilePath),
        )
      },
      moveFolder(dirPath, newDirPath) {
        throwIfCancelled()

        return vscode.workspace.fs.rename(
          vscode.Uri.file(dirPath),
          vscode.Uri.file(newDirPath),
        )
      },
      deleteFolder(dirPath) {
        throwIfCancelled()

        return vscode.workspace.fs.delete(vscode.Uri.file(dirPath))
      },
      renameFolder(dirPath, newDirPath) {
        throwIfCancelled()

        return vscode.workspace.fs.rename(
          vscode.Uri.file(dirPath),
          vscode.Uri.file(newDirPath),
        )
      },
      async readDirectory(dirPath, options) {
        throwIfCancelled()

        const uri = vscode.Uri.file(dirPath)

        const files = await vscode.workspace.fs.readDirectory(uri)

        const filesFilter = options?.filesFilter

        const includeFolders = options?.includeFolders

        const includedFiles: {
          path: string
          name: string
          nameWithoutExtension: string
          type: 'file' | 'folder'
        }[] = []

        for (const [name, type] of files) {
          if (type === vscode.FileType.File) {
            if (
              !filesFilter ? true : (
                filesFilter.some((pattern) => minimatch(name, pattern))
              )
            ) {
              includedFiles.push({
                path: posix.join(dirPath, name),
                name,
                nameWithoutExtension: posix.basename(name, posix.extname(name)),
                type: 'file',
              })
            }
          } else {
            if (
              !includeFolders ? false : (
                includeFolders === true ||
                includeFolders.some((pattern) => minimatch(name, pattern))
              )
            ) {
              includedFiles.push({
                path: posix.join(dirPath, name),
                name,
                nameWithoutExtension: posix.basename(name, posix.extname(name)),
                type: 'folder',
              })
            }

            if (options?.recursive) {
              const subDirFiles = await this.readDirectory(
                posix.join(dirPath, name),
                options,
              )

              includedFiles.push(...subDirFiles)
            }
          }
        }

        return includedFiles
      },
    },
    activeEditor: getEditorMethods(initialActiveEditor),
    showDiff,
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** @internal */
export function getCtx() {
  return refactorCtx
}

export function log(value: any) {
  if (!refactorCtx) {
    throw new Error('Refactor context not set')
  }

  refactorCtx.log(value)
}

export const refacTools = {
  config,
  runRefactor,
  log,
}

async function runRefactor<V extends string = string>(fn: RefactorFn<V>): Promise<void> {
  if (!refactorCtx) {
    throw new Error('Refactor context not set')
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  await fn(refactorCtx as any)
}
