import { build } from 'esbuild'
import { posix } from 'path'
import { evtmitter } from 'evtmitter'
import * as vm from 'vm'
import * as vscode from 'vscode'
import {
  RefactorConfig,
  RefactoringEvents,
  RunResult,
  initializeCtx,
  refacTools,
} from './refactool'
import { dedent, notNullish } from './utils'
import { MemFS } from './memFs'

const scriptsFolder = `/.vscode/refactorings`
const extractConfigRegex = /refacTools\.config\((\{[\s\S]*?\})\)/

function getActiveWorkspaceFolder() {
  if (!vscode.workspace.workspaceFolders?.length) {
    throw new Error('No workspace folder found')
  }

  const activeEditor = vscode.window.activeTextEditor

  const activeWorkspaceFolder = activeEditor
    ? vscode.workspace.getWorkspaceFolder(activeEditor.document.uri) ??
      vscode.workspace.workspaceFolders[0]
    : vscode.workspace.workspaceFolders[0]

  if (!activeWorkspaceFolder) {
    throw new Error('No workspace folder found')
  }

  return activeWorkspaceFolder
}

function createOrUpdateApiDefinition() {
  const extensionFolder = vscode.extensions.getExtension(
    'lucasols.refactools'
  )?.extensionPath

  const activeWorkspaceFolder = getActiveWorkspaceFolder()

  const scriptsFolderUri = activeWorkspaceFolder.uri.with({
    path: posix.join(activeWorkspaceFolder.uri.path, scriptsFolder),
  })

  if (!scriptsFolderUri) {
    throw new Error(
      `No scripts folder found. Please create a folder at ${scriptsFolder}`
    )
  }

  const apiDefinitionPath = posix.join(
    scriptsFolderUri.path,
    'refactools-api.d.ts'
  )

  const importPath = posix.join(extensionFolder!, 'dist/refactool')
  const apiDefinitionContent = dedent`
    declare const refacTools: typeof import('${importPath}').refacTools

    declare type RefacToolsCtx =
      import('import('${importPath}')').RefacToolsCtx
  `

  vscode.workspace.fs.writeFile(
    scriptsFolderUri.with({ path: apiDefinitionPath }),
    Buffer.from(apiDefinitionContent)
  )
}

async function getRefactoringsList() {
  const activeWorkspaceFolder = getActiveWorkspaceFolder()

  const scriptsFolderUri = activeWorkspaceFolder.uri.with({
    path: posix.join(activeWorkspaceFolder.uri.path, scriptsFolder),
  })

  if (!scriptsFolderUri) {
    throw new Error(
      `No scripts folder found. Please create a folder at ${scriptsFolder}`
    )
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
    variant: string | null
  }

  const availableRefactoringsConfig: AvailableRefactoringsConfig[] = []

  let hasTypesFile = false

  for (const [filename, type] of await vscode.workspace.fs.readDirectory(
    scriptsFolderUri
  )) {
    if (type === vscode.FileType.File) {
      const filePath = posix.join(scriptsFolderUri.path, filename)

      const fileExtension = posix.extname(filePath)

      if (filePath.endsWith('refactools-api.d.ts')) {
        hasTypesFile = true
        continue
      }

      if (fileExtension !== '.ts') {
        continue
      }

      const fileContent = await vscode.workspace.fs.readFile(
        scriptsFolderUri.with({ path: filePath })
      )

      const fileContentString = fileContent.toString()

      const configCode = extractConfigRegex.exec(fileContentString)?.[1]

      if (!configCode) {
        vscode.window.showErrorMessage(
          `Error parsing config for file ${filename}. Please check the console for more details`
        )

        continue
      }

      availableRefactorings.push({
        configCode,
        filename,
        rootDir: scriptsFolderUri.path,
      })
    }
  }

  if (!hasTypesFile) {
    createOrUpdateApiDefinition()
  }

  try {
    const config = vm.runInNewContext(
      `[${availableRefactorings.map(({ configCode }) => configCode).join(',')}]`
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
              (langId) =>
                vscode.window.activeTextEditor?.document.languageId === langId
            )
          ) {
            continue
          }
        }
      }

      availableRefactoringsConfig.push({
        config: cfg,
        filename: notNullish(availableRefactorings[index]).filename,
        rootDir: notNullish(availableRefactorings[index]).rootDir,
        variant: null,
        label: cfg.name,
      })

      if (cfg.variants) {
        for (const [variant, name] of Object.entries(cfg.variants)) {
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
      `Error parsing config. You config should not have referenced variables or typescript code, Please check the console for more details`
    )
  }

  return availableRefactoringsConfig.map(
    (item): vscode.QuickPickItem & AvailableRefactoringsConfig => ({
      description: item.config.description,
      ...item,
    })
  )
}

export function activate(context: vscode.ExtensionContext) {
  const memFs = new MemFS()

  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider('refactoolsfs', memFs, {
      isCaseSensitive: true,
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('refactools.listRefactorings', async () => {
      const selectedRefactoring = await vscode.window.showQuickPick(
        getRefactoringsList(),
        {
          title: 'Available refactorings',
          matchOnDescription: true,
          placeHolder: 'Select a refactoring',
        }
      )

      if (!selectedRefactoring) return

      try {
        const bundledScript = await build({
          entryPoints: [selectedRefactoring.filename],
          bundle: true,
          format: 'cjs',
          absWorkingDir: selectedRefactoring.rootDir,
          write: false,
        })

        const bundledScriptContent = bundledScript.outputFiles[0]?.text

        if (!bundledScriptContent) {
          throw new Error('No bundled script content found')
        }

        if (!bundledScriptContent.includes('refacTools.config')) {
          throw new Error(
            `Error bundling script. Please check the console for more details`
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

              console.log('User canceled the long running operation')

              cleanup()
            })

            initializeCtx(
              vscode,
              memFs,
              refactoringEvents,
              selectedRefactoring.variant,
              getActiveWorkspaceFolder(),
              progress
            )

            console.log(`Refactoring "${selectedRefactoring.filename}" started`)

            const action = async () => {
              const results: RunResult = await vm.runInNewContext(
                bundledScriptContent,
                {
                  refacTools: refacTools,
                }
              )

              console.log(`Refactoring "${selectedRefactoring.filename}" ended`)
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
          }
        )
      } catch (e) {
        console.error(e)
        vscode.window.showErrorMessage(
          `Error running refactoring. Please check the console for more details`
        )
      }
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'refactools.updateWorkspaceApiTypes',
      async () => {
        createOrUpdateApiDefinition()
      }
    )
  )
}
