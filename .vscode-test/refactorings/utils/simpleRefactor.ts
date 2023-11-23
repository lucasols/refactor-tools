import { gptCodeRefactor } from './openaiGpt'

export async function simpleRefactor(
  instructions: string,
  ctx: RefacToolsCtx<'quickReplace'>,
  useGpt3?: boolean,
) {
  const selectedCode = await ctx.activeEditor.getSelected()

  if (!selectedCode) {
    throw new Error('No code selected')
  }

  const refactoredCode = await gptCodeRefactor({
    instructions: instructions,
    oldCode: selectedCode.text,
    language: selectedCode.language,
    useGpt3,
  })

  if (ctx.variant === 'quickReplace') {
    await selectedCode.replaceWith(refactoredCode)

    return
  }

  const acceptedRefactoredCode = await ctx.showDiff({
    original: selectedCode,
    refactored: refactoredCode,
    ext: ctx.activeEditor.extension,
  })

  if (acceptedRefactoredCode) {
    await ctx.activeEditor.setContent(acceptedRefactoredCode)

    await ctx.activeEditor.format()
  }
}
