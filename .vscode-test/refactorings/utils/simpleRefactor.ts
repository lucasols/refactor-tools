import { gptCodeRefactor, gptCodeRefactorStream } from './openaiGpt'

export async function simpleRefactor(
  instructions: string,
  ctx: RefacToolsCtx<'quickReplace'>,
  useGpt3?: boolean,
) {
  const activeEditor = ctx.getActiveEditor()

  const modelToUse =
    useGpt3 ? 'useGpt3' : (
      await ctx.prompt.quickPick({
        options: [
          { label: 'Use GPT-3', value: 'useGpt3' },
          { label: 'Use GPT-4', value: 'useGpt4' },
        ],
        title: 'Select GPT model',
      })
    )

  if (!modelToUse) {
    return
  }

  const selectedCode = await activeEditor.getSelected()

  if (!selectedCode) {
    throw new Error('No code selected')
  }

  if (ctx.variant === 'quickReplace') {
    const refactoredCode = await gptCodeRefactor({
      instructions,
      oldCode: selectedCode.text,
      language: selectedCode.language,
      useGpt3: modelToUse === 'useGpt3',
    })

    await selectedCode.replaceWith(refactoredCode)

    return
  }

  const refactoredCode = gptCodeRefactorStream({
    instructions,
    oldCode: selectedCode.text,
    language: selectedCode.language,
    useGpt3: modelToUse === 'useGpt3',
    onCancel: ctx.onCancel,
  })

  const acceptedRefactoredCode = await ctx.showDiff({
    original: selectedCode,
    refactored: refactoredCode,
    ext: activeEditor.extension,
    generatingDiffMessage: '🛠️ Refactoring...',
  })

  if (acceptedRefactoredCode) {
    await activeEditor.setContent(acceptedRefactoredCode)

    await activeEditor.format()
  }
}
