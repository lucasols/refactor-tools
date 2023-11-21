import { build } from 'esbuild'
import { posix } from 'path'
import { evtmitter } from 'evtmitter'
import * as vm from 'vm'
import * as vscode from 'vscode'
import {
  HistoryEntry,
  RefactorConfig,
  RefactoringEvents,
  initializeCtx,
  refacTools,
} from './refactool'
import { dedent, notNullish } from './utils'
import { MemFS } from './memFs'

const scriptsFolder = `/.vscode/refactorings`
const extractConfigRegex = /refacTools\.config\((\{[\s\S]*?\})\)/

function getActiveWorkspaceFolder() {
  if (!vscode.workspace.workspaceFolders?.length) {
    return null
  }

  const activeEditor = vscode.window.activeTextEditor

  const activeWorkspaceFolder =
    activeEditor ?
      vscode.workspace.getWorkspaceFolder(activeEditor.document.uri) ??
      vscode.workspace.workspaceFolders[0]
    : vscode.workspace.workspaceFolders[0]

  if (!activeWorkspaceFolder) {
    return null
  }

  return activeWorkspaceFolder
}

function createOrUpdateApiDefinition() {
  const extensionFolder =
    vscode.extensions.getExtension('lucasols.refactools')?.extensionPath

  const activeWorkspaceFolder = getActiveWorkspaceFolder()

  if (!activeWorkspaceFolder) {
    return null
  }

  const scriptsFolderUri = activeWorkspaceFolder.uri.with({
    path: posix.join(activeWorkspaceFolder.uri.path, scriptsFolder),
  })

  const importPath = posix.join(extensionFolder!, 'dist/refactool')
  const apiDefinitionContent = dedent`
    declare const refacTools: typeof import('${importPath}').refacTools

    declare type RefacToolsCtx<V extends string> =
      import('${importPath}').RefacToolsCtx<V>
  `
  if (scriptsFolderUri) {
    const apiDefinitionPath = posix.join(scriptsFolderUri.path, 'refactools-api.d.ts')

    vscode.workspace.fs.writeFile(
      scriptsFolderUri.with({ path: apiDefinitionPath }),
      Buffer.from(apiDefinitionContent),
    )
  }

  const userProjectFolder = getUserRefactoringsProjectUri()

  if (userProjectFolder) {
    const apiDefinitionPath = posix.join(
      userProjectFolder.path,
      'refactorings/refactools-api.d.ts',
    )

    vscode.workspace.fs.writeFile(
      userProjectFolder.with({ path: apiDefinitionPath }),
      Buffer.from(apiDefinitionContent),
    )
  }
}

function getUserRefactoringsProjectUri() {
  const userRefactoringProject = vscode.workspace
    .getConfiguration('refactools')
    .get<string | null>('userRefactoringsProject')

  if (!userRefactoringProject) {
    return null
  }

  return vscode.Uri.file(posix.join(userRefactoringProject, '/refactorings'))
}

async function getRefactoringsList(outputChannel: vscode.OutputChannel) {
  const folderToCheck: vscode.Uri[] = []

  const userProjectFolder = getUserRefactoringsProjectUri()

  if (userProjectFolder) {
    folderToCheck.push(userProjectFolder)
  }

  const activeWorkspaceFolder = getActiveWorkspaceFolder()

  const scriptsFolderUri = activeWorkspaceFolder?.uri.with({
    path: posix.join(activeWorkspaceFolder.uri.path, scriptsFolder),
  })

  if (scriptsFolderUri) {
    folderToCheck.push(scriptsFolderUri)
  }

  const availableRefactorings: {
    configCode: string
    filename: string
    rootDir: string
  }[] = []

  type AvailableRefactoringsConfig = {
    config: RefactorConfig
    filename: string
    label: string
    rootDir: string
    variant: string
  }

  const availableRefactoringsConfig: AvailableRefactoringsConfig[] = []

  const addedRefactorings = new Set<string>()

  for (const projectFolder of folderToCheck) {
    for (const [filename, type] of await vscode.workspace.fs.readDirectory(
      projectFolder,
    )) {
      if (type === vscode.FileType.File) {
        const filePath = posix.join(projectFolder.path, filename)

        const fileExtension = posix.extname(filePath)

        if (fileExtension !== '.ts') {
          continue
        }

        const fileContent = await vscode.workspace.fs.readFile(
          projectFolder.with({ path: filePath }),
        )

        const fileContentString = fileContent.toString()

        const configCode = extractConfigRegex.exec(fileContentString)?.[1]

        if (!configCode) {
          vscode.window.showErrorMessage(
            `Error parsing config for file ${filename}. Please check the console for more details`,
          )

          continue
        }

        if (addedRefactorings.has(filename)) {
          outputChannel.appendLine(
            `Refactoring "${filename}" was ignored because it was already added`,
          )
          continue
        }

        addedRefactorings.add(filename)

        availableRefactorings.push({
          configCode,
          filename,
          rootDir: projectFolder.path,
        })
      }
    }
  }

  try {
    const config = vm.runInNewContext(
      `[${availableRefactorings.map(({ configCode }) => configCode).join(',')}]`,
    ) as RefactorConfig[]

    for (const [index, cfg] of config.entries()) {
      const enableCondition = cfg.enabledWhen

      if (enableCondition) {
        if (enableCondition.hasSelection) {
          if (vscode.window.activeTextEditor?.selection.isEmpty) {
            continue
          }
        }

        if (enableCondition.activeFileContains) {
          if (
            vscode.window.activeTextEditor?.document
              .getText()
              .includes(enableCondition.activeFileContains)
          ) {
            continue
          }
        }

        if (enableCondition.activeLanguageIs) {
          if (
            !enableCondition.activeLanguageIs.some(
              (langId) => vscode.window.activeTextEditor?.document.languageId === langId,
            )
          ) {
            continue
          }
        }
      }

      const defaultVariant = {
        config: cfg,
        filename: notNullish(availableRefactorings[index]).filename,
        rootDir: notNullish(availableRefactorings[index]).rootDir,
        label: cfg.name,
        variant: 'default',
      }

      availableRefactoringsConfig.push(defaultVariant)

      if (cfg.variants) {
        for (const [variant, name] of Object.entries(cfg.variants)) {
          if (variant === 'default') {
            defaultVariant.label = `${cfg.name} - ${name}`

            continue
          }

          availableRefactoringsConfig.push({
            config: cfg,
            filename: notNullish(availableRefactorings[index]).filename,
            rootDir: notNullish(availableRefactorings[index]).rootDir,
            variant,
            label: `${cfg.name} - ${name}`,
          })
        }
      }
    }
  } catch (e) {
    console.error(e)
    vscode.window.showErrorMessage(
      `Error parsing config. You config should not have referenced variables or typescript code, Please check the console for more details`,
    )
  }

  return availableRefactoringsConfig.map(
    (item): vscode.QuickPickItem & AvailableRefactoringsConfig => ({
      description: item.config.description,
      ...item,
    }),
  )
}

export function activate(context: vscode.ExtensionContext) {
  const memFs = new MemFS()

  const outputChannel = vscode.window.createOutputChannel('RefacTools')

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider('refactoolsfs', memFs, {
      isCaseSensitive: true,
    }),
  )

  const commandsHistory = new Map<string, HistoryEntry>()

  context.subscriptions.push({
    dispose: () => {
      commandsHistory.clear()
    },
  })

  context.subscriptions.push(
    vscode.commands.registerCommand('refactools.listRefactorings', async () => {
      const selectedRefactoring = await vscode.window.showQuickPick(
        getRefactoringsList(outputChannel),
        {
          title: 'Available refactorings',
          matchOnDescription: true,
          placeHolder: 'Select a refactoring',
        },
      )

      if (!selectedRefactoring) return

      try {
        const bundledScript = await build({
          entryPoints: [selectedRefactoring.filename],
          bundle: true,
          format: 'cjs',
          absWorkingDir: selectedRefactoring.rootDir,
          write: false,
          platform: 'node',
        })

        const bundledScriptContent = bundledScript.outputFiles[0]?.text

        if (!bundledScriptContent) {
          throw new Error('No bundled script content found')
        }

        if (!bundledScriptContent.includes('refacTools.config')) {
          throw new Error(
            `Error bundling script. Please check the console for more details`,
          )
        }

        vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Running refactoring ${selectedRefactoring.config.name}`,
            cancellable: true,
          },
          async (progress, token) => {
            const refactoringEvents = evtmitter<RefactoringEvents>()

            let cleanupWasCalled = false
            function cleanup() {
              if (cleanupWasCalled) return
              cleanupWasCalled = true

              refactoringEvents.off('*')
              memFs.deleteAll()
            }

            token.onCancellationRequested(() => {
              refactoringEvents.emit('cancel')

              outputChannel.appendLine('User canceled the long running operation')

              cleanup()
            })

            const runsValues = {} as Record<string, unknown>

            const setHistoryValue: (key: string, value: any) => void = (key, value) => {
              runsValues[key] = value
            }

            if (!commandsHistory.has(selectedRefactoring.filename)) {
              commandsHistory.set(selectedRefactoring.filename, { runs: [] })
            }

            const getHistory = () => {
              return commandsHistory.get(selectedRefactoring.filename)!
            }

            const log = (value: unknown) => {
              if (typeof value === 'string') {
                outputChannel.appendLine(value)
              } else {
                outputChannel.appendLine(JSON.stringify(value, null, 2))
              }
            }

            initializeCtx(
              vscode,
              memFs,
              refactoringEvents,
              selectedRefactoring.variant,
              getActiveWorkspaceFolder(),
              progress,
              setHistoryValue,
              getHistory,
              log,
            )

            outputChannel.appendLine(
              `Refactoring "${selectedRefactoring.filename}" started`,
            )

            const action = async () => {
              try {
                await vm.runInNewContext(bundledScriptContent, {
                  refacTools: refacTools,
                  require,
                  global,
                  process,
                  URL,
                  setTimeout,
                  clearTimeout,
                  setInterval,
                  fetch,
                  clearInterval,
                  Buffer,
                })

                commandsHistory.get(selectedRefactoring.filename)!.runs.push({
                  variant: selectedRefactoring.variant,
                  values: runsValues,
                })
              } catch (e) {
                const errorMsg = getErrorMessage(e)
                outputChannel.appendLine(`Error running the refactoring:`)
                outputChannel.appendLine(errorMsg)

                if (e && typeof e === 'object' && 'stack' in e) {
                  outputChannel.appendLine(String(e.stack))
                }

                vscode.window.showErrorMessage(
                  `Error running refactoring. Please check the output for more details`,
                )
              }

              outputChannel.appendLine(
                `Refactoring "${selectedRefactoring.filename}" ended`,
              )
            }

            let resolveCancel: () => void

            return Promise.race([
              action(),
              new Promise<never>((res, reject) => {
                refactoringEvents.on('cancelParent', () => {
                  refactoringEvents.emit('cancel')
                  reject(true)
                })

                resolveCancel = () => {
                  reject(true)
                }
              }),
            ]).finally(() => {
              resolveCancel?.()
              cleanup()
            })
          },
        )
      } catch (e) {
        const errorMsg = getErrorMessage(e)
        outputChannel.appendLine(`Error: ${errorMsg}`)
        outputChannel.append(e as any)
        vscode.window.showErrorMessage(
          `Error running refactoring. Please check the output for more details`,
        )
      }
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('refactools.updateWorkspaceApiTypes', async () => {
      createOrUpdateApiDefinition()
    }),
  )
}

function getErrorMessage(e: unknown): string {
  return (
    typeof e === 'string' ? e
    : typeof e === 'object' && e && 'message' in e ? String(e?.message)
    : ''
  )
}
