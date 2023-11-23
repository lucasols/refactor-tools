import { gptCodeRefactor } from './utils/openaiGpt'

type Variants = 'quickReplace' | 'withLastInstruction'

refacTools.config<Variants>({
  name: 'Generic GPT Refactoring',
  variants: {
    quickReplace: 'Quick Replace',
    withLastInstruction: 'With Last Instruction',
  },
  enabledWhen: {
    hasSelection: true,
  },
})

refacTools.runRefactor<Variants>(async (ctx) => {
  const modelToUse = await ctx.prompt.quickPick({
    options: [
      { label: 'Use GPT-4', value: 'useGpt4' },
      { label: 'Use GPT-3', value: 'useGpt3' },
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

  const lastInstruction =
    ctx.variant === 'withLastInstruction' &&
    ctx.history.getLast()?.get<string>('lastInstruction')

  const instructions =
    lastInstruction ? lastInstruction : await ctx.prompt.text('Refactoring instructions')

  ctx.history.add('lastInstruction', instructions)

  if (!instructions) {
    throw new Error('No instructions provided')
  }

  const refactoredCode = await gptCodeRefactor({
    instructions: instructions,
    oldCode: selectedCode.text,
    language: selectedCode.language,
    useGpt3: modelToUse === 'useGpt3',
  })

  if (ctx.variant === 'quickReplace' || ctx.variant === 'withLastInstruction') {
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
  }
})
