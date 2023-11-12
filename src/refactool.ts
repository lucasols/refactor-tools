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
  | (string & {})

export type RefactorConfig = {
  name: string
  description: string
  enabledWhen?: {
    hasSelection?: true
    activeFileContains?: string
    activeLanguageIs?: LanguageId[]
  }
  variants?: {
    [id: string]: string
  }
}

function config(config: RefactorConfig) {
  return undefined
}

let refactorCtx: RefacToolsCtx | null = null

type RefactorFn = (ctx: RefacToolsCtx) => Promise<void> | void

/** @internal */
export type RunResult = {}

type EditorMethods = {
  getSelected: () => Selected | null
  format: () => void
  setContent: (content: string) => void
  replaceContent: (
    content: string,
    range: { start: number; end: number }
  ) => void
  insertContent: (content: string, position: number) => void
  focus: () => void
  filename: string
  filepath: string
  getContent: () => string
}

type Selected = {
  replaceWith: (code: string) => void
  text: string
  range: {
    start: number
    end: number
  }
  editorUri: vsc.Uri
}

export type RefacToolsCtx = {
  variant: string | null
  runResult: RunResult
  ide: {
    showInfoMessage: (message: string) => void
    showErrorMessage: (message: string) => void
    showWarningMessage: (message: string) => void
    newUnsavedFile: (editorProps: {
      content: string
      language?: string
      filename?: string
    }) => void
    getEditor: (filePath: string) => EditorMethods | null
    openFile: (filePath: string) => Promise<EditorMethods | null>
    setGeneralProgress: (progress: {
      message?: string | undefined
      increment?: number | undefined
    }) => void
    showProgress: <T>(
      message: string,
      action: (runCtx: {
        abort: AbortController
        token: vsc.CancellationToken
      }) => Promise<T>
    ) => Thenable<T>
    setCommandPaletteOptions: <T extends string>(
      options: {
        label: string
        description?: string
        value: T
      }[],
      onSelected: (value: T) => void
    ) => void
  }
  fs: {
    memFs: MemFS
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
      }
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
    original: string | Selected
    refactored: string
    ext?: string
  }) => Promise<string | false>
  onCancel: (fn: () => void) => void
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
    waitTextSelection: (
      message: string,
      buttonLabel: string
    ) => Promise<Selected | false>
    dialog: (
      message: string,
      options?: {
        title?: string
        buttons?: string[]
      }
    ) => Promise<string | boolean>
  }
}

export type RefactoringEvents = {
  cancel: undefined
  cancelParent: undefined
}

/** @internal */
export async function initializeCtx(
  vscode: typeof vsc,
  memFs: MemFS,
  refactoringEvents: Emitter<RefactoringEvents>,
  variant: string | null,
  activeWorkspaceFolder: vsc.WorkspaceFolder,
  setGeneralProgress: vsc.Progress<{ message?: string; increment?: number }>
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

  function focusEditor(editor: vsc.TextEditor | undefined) {
    if (editor) {
      vscode.window.showTextDocument(editor.document)
    }
  }

  refactoringEvents.on('cancel', () => {
    isCancelled = true
  })

  const showDiff: RefacToolsCtx['showDiff'] = async ({
    title,
    original,
    refactored,
    ext,
  }) => {
    throwIfCancelled()

    const leftUri =
      typeof original === 'string'
        ? vscode.Uri.parse(`refactoolsfs:/diff.original${ext || ''}`)
        : original.editorUri

    if (typeof original === 'string') {
      memFs.writeFile(leftUri, Buffer.from(original), {
        create: true,
        overwrite: true,
      })
    }

    const virtualRefactoredFileUri = vscode.Uri.parse(
      `refactoolsfs:/diff.refactored${ext || ''}`
    )

    let refactoredFile = refactored

    if (typeof original !== 'string') {
      const originalFileContent = (
        await vscode.workspace.fs.readFile(original.editorUri)
      ).toString()

      refactoredFile =
        originalFileContent.slice(0, original.range.start) +
        refactored +
        originalFileContent.slice(original.range.end)
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
      }
    )

    const userResponse = defer<string | false>()

    const dispose = vscode.commands.registerCommand(
      'refactools.acceptRefactoring',
      () => {
        userResponse.resolve(
          typeof original === 'string'
            ? refactored
            : memFs.readFile(virtualRefactoredFileUri).toString()
        )
      }
    )

    const previewIsClosedDispose = vscode.workspace.onDidCloseTextDocument(
      (doc) => {
        if (doc.uri.toString() === virtualRefactoredFileUri.toString()) {
          userResponse.resolve(false)
        }
      }
    )

    refactoringEvents.on('cancel', () => {
      userResponse.resolve(false)
    })

    const result = await userResponse.promise

    dispose.dispose()
    previewIsClosedDispose.dispose()

    // find and close the diff editor
    const diffEditor = vscode.window.visibleTextEditors.find(
      (editor) =>
        editor.document.uri.toString() === virtualRefactoredFileUri.toString()
    )

    if (diffEditor) {
      await vscode.window.showTextDocument(diffEditor.document)
      vscode.commands.executeCommand('workbench.action.closeActiveEditor')
    }

    // remove the virtual files
    if (typeof original === 'string') {
      memFs.delete(leftUri)
    }
    memFs.delete(virtualRefactoredFileUri)

    return result
  }

  async function promptText(message: string) {
    throwIfCancelled()

    await new Promise((resolve) => setTimeout(resolve, 50))

    const input = await vscode.window.showInputBox({
      prompt: message,
    })

    return input || false
  }

  function getEditorMethods(editor: vsc.TextEditor): EditorMethods {
    const getSelected: RefacToolsCtx['activeEditor']['getSelected'] = () => {
      if (isCancelled) return null

      focusEditor(editor)

      if (!editor) {
        return null
      }

      if (editor.selection.isEmpty) {
        return null
      }

      const text = editor.document.getText(editor.selection)

      return {
        text: text,
        range: {
          start: editor.document.offsetAt(editor.selection.start),
          end: editor.document.offsetAt(editor.selection.end),
        },
        editorUri: editor.document.uri,
        replaceWith: (code: string) => {
          editor.edit((editBuilder) => {
            editBuilder.replace(editor.selection, code)
          })
        },
      }
    }
    return {
      getSelected,
      setContent(content) {
        if (isCancelled) return

        focusEditor(editor)

        editor?.edit((editBuilder) => {
          const fullRange = editor.document.validateRange(
            new vscode.Range(
              new vscode.Position(0, 0),
              new vscode.Position(Number.MAX_VALUE, Number.MAX_VALUE)
            )
          )

          editBuilder.replace(fullRange, content)
        })
      },
      format: () => {
        if (isCancelled) return

        focusEditor(editor)

        vscode.commands.executeCommand('editor.action.formatDocument')
      },
      insertContent(content, position) {
        if (isCancelled) return

        focusEditor(editor)

        editor?.edit((editBuilder) => {
          editBuilder.insert(editor.document.positionAt(position), content)
        })
      },
      replaceContent(content, range) {
        if (isCancelled) return

        focusEditor(editor)

        editor?.edit((editBuilder) => {
          editBuilder.replace(
            new vscode.Range(
              editor.document.positionAt(range.start),
              editor.document.positionAt(range.end)
            ),
            content
          )
        })
      },
      filename: editor.document.fileName,
      filepath: editor.document.uri.fsPath,
      getContent: () => editor.document.getText(),
      focus: () => {
        if (isCancelled) return

        focusEditor(editor)
      },
    }
  }

  let disposeCommandPaletteOptions: (() => void) | null = null

  refactoringEvents.on('cancel', () => {
    disposeCommandPaletteOptions?.()
  })

  refactorCtx = {
    onCancel(fn) {
      refactoringEvents.on('cancel', fn)
    },
    prompt: {
      text: promptText,
      async quickPick({ options, title, defaultValue }) {
        throwIfCancelled()

        const selected = await vscode.window.showQuickPick(
          options.map(({ label, value }) => ({
            label,
            value: value,
            picked: value === defaultValue,
          })),
          { title }
        )

        return selected?.value || false
      },
      async multiQuickPick({ options, title, defaultValue }) {
        throwIfCancelled()

        const selected = await vscode.window.showQuickPick(
          options.map(({ label, value }) => ({
            label,
            value: value,
            picked: defaultValue?.includes(value) ?? false,
          })),
          { title, canPickMany: true }
        )

        return selected?.map((s) => s.value) || false
      },
      async waitTextSelection(message, buttonLabel) {
        throwIfCancelled()

        const selected = await vscode.window.showInformationMessage(
          message,
          buttonLabel
        )

        if (!selected) {
          return false
        }

        const selectedText = getEditorMethods(
          vscode.window.activeTextEditor!
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
          ...(options?.buttons ?? [])
        )

        if (!selected) {
          return false
        }

        return selected
      },
    },
    runResult: {},
    variant,
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
              resolveCancel?.()
            })
          }
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
      newUnsavedFile: async ({ content, language }) => {
        const editor = await vscode.workspace.openTextDocument({
          language,
          content,
        })

        await vscode.window.showTextDocument(editor)
      },
      getEditor: (filePath) => {
        if (isCancelled) return null

        const editor = vscode.window.visibleTextEditors.find(
          (editor) => editor.document.uri.fsPath === filePath
        )

        return editor ? getEditorMethods(editor) : null
      },
      async openFile(filePath) {
        if (isCancelled) {
          return null
        }

        const editor = await vscode.workspace.openTextDocument(filePath)

        await vscode.window.showTextDocument(editor)

        return getEditorMethods(vscode.window.activeTextEditor!)
      },
      setCommandPaletteOptions(options, onSelected) {
        if (isCancelled) return

        disposeCommandPaletteOptions?.()

        vscode.commands.executeCommand(
          'setContext',
          'refactools.refactoringOptionsAvailable',
          true
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
              { title: 'Select option' }
            )

            if (selected) {
              onSelected(selected.value)
            }
          }
        )

        disposeCommandPaletteOptions = () => {
          disposable.dispose()
          vscode.commands.executeCommand(
            'setContext',
            'refactools.refactoringOptionsAvailable',
            false
          )
        }
      },
    },
    fs: {
      memFs,
      createMemFsPath(path) {
        throwIfCancelled()

        return `refactoolsfs:/${path}`
      },
      getWorkspacePath() {
        throwIfCancelled()

        return activeWorkspaceFolder.uri.path
      },
      getPathRelativeToWorkspace(relativePath) {
        throwIfCancelled()

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
          () => false
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
          () => false
        )
      },
      moveFile(filePath, newFilePath) {
        throwIfCancelled()

        return vscode.workspace.fs.rename(
          vscode.Uri.file(filePath),
          vscode.Uri.file(newFilePath)
        )
      },
      renameFile(filePath, newFilePath) {
        throwIfCancelled()

        return vscode.workspace.fs.rename(
          vscode.Uri.file(filePath),
          vscode.Uri.file(newFilePath)
        )
      },
      moveFolder(dirPath, newDirPath) {
        throwIfCancelled()

        return vscode.workspace.fs.rename(
          vscode.Uri.file(dirPath),
          vscode.Uri.file(newDirPath)
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
          vscode.Uri.file(newDirPath)
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
              !filesFilter
                ? true
                : filesFilter.some((pattern) => minimatch(name, pattern))
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
              !includeFolders
                ? false
                : includeFolders === true ||
                  includeFolders.some((pattern) => minimatch(name, pattern))
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
                options
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

/** @internal */
export function getCtx() {
  return refactorCtx
}

export const refacTools = {
  config,
  runRefactor,
}

async function runRefactor(fn: RefactorFn): Promise<RunResult> {
  if (!refactorCtx) {
    throw new Error('Refactor context not set')
  }

  await fn(refactorCtx)

  return refactorCtx.runResult
}
