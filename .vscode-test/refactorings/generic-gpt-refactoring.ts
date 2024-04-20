import { gptCodeRefactor, gptCodeRefactorStream } from './utils/ai'

type Variants = 'quickReplace'

refacTools.config<Variants>({
  name: 'Generic GPT Refactoring',
  variants: {
    quickReplace: 'Quick Replace',
  },
  enabledWhen: {
    hasSelection: true,
  },
})

refacTools.runRefactor<Variants>(async (ctx) => {
  const activeEditor = ctx.getActiveEditor()

  const selectedCode = await activeEditor.getSelected()

  if (!selectedCode) {
    throw new Error('No code selected')
  }

  const lastInstruction = ctx.history.getLast()?.get<string>('lastInstruction')

  const instructions = await ctx.prompt.text('Refactoring instructions', lastInstruction)

  ctx.history.add('lastInstruction', instructions)

  if (!instructions) {
    throw new Error('No instructions provided')
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
})
