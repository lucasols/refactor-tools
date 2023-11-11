import refactorTools from 'refactor-tools'

export const config = {
  name: 'Convert loop to for of',
  description: 'Convert selected loop to for of',
  enabledWhen: {
    hasSelectedCode: true,
    activeFileIs: ['*.ts', '*.tsx'],
  },
}

const refactorSession = refactorTools.startRefactorSession()

const selectedCode = refactorSession.vscodeCtx.getSelectedCode()

if (!selectedCode) {
  throw new Error('No code selected')
}

const closeLoadingMessage = refactorSession.showLoadingMessage(
  'Converting loop to for of...'
)

const refactoredCode = await gpt4.codeRefactor({
  prompt: `Convert loop to for of`,
  code: selectedCode,
})

closeLoadingMessage()

refactorSession.replaceSelectedCode(selectedCode, refactoredCode)

refactorSession.formatEditor(selectedCode.editor)
