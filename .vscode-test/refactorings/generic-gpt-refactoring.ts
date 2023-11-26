import { gptCodeRefactor, gptCodeRefactorStream } from './utils/openaiGpt'

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
  const modelToUse = await ctx.prompt.quickPick({
    options: [
      { label: 'Use GPT-3', value: 'useGpt3' },
      { label: 'Use GPT-4', value: 'useGpt4' },
    ],
    title: 'Select GPT model',
  })

  if (!modelToUse) {
    return
  }

  const selectedCode = await ctx.activeEditor.getSelected()

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
    ext: ctx.activeEditor.extension,
    generatingDiffMessage: '🛠️ Refactoring...',
  })

  if (acceptedRefactoredCode) {
    await ctx.activeEditor.setContent(acceptedRefactoredCode)

    await ctx.activeEditor.format()
  }
})
