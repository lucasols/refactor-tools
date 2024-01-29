import { gptCodeRefactor, gptCodeRefactorStream } from './openaiGpt'

export async function simpleRefactor(
  instructions: string,
  ctx: RefacToolsCtx<'quickReplace'>,
  useGpt3?: boolean,
) {
  const activeEditor = ctx.getActiveEditor()

  const selectedCode = await activeEditor.getSelected()

  if (!selectedCode) {
    throw new Error('No code selected')
  }

  if (ctx.variant === 'quickReplace') {
    const refactoredCode = await gptCodeRefactor({
      instructions,
      oldCode: selectedCode.text,
      language: selectedCode.language,
    })

    await selectedCode.replaceWith(refactoredCode)

    return
  }

  const refactoredCode = gptCodeRefactorStream({
    instructions,
    oldCode: selectedCode.text,
    language: selectedCode.language,
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
