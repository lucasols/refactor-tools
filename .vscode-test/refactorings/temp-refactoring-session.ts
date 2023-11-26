import { dedent } from './utils/dedent'
import { gptCodeRefactorStream } from './utils/openaiGpt'
import { joinStrings } from './utils/stringUtils'

refacTools.config({
  name: 'Temp refactoring session',
})

refacTools.runRefactor(async (ctx) => {
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

  const examples: { old: string; refactored: string }[] = []

  let extraInstructions: string | null = null

  async function addExample() {
    const exampleOriginal = await ctx.prompt.waitTextSelection(
      `Let's add a example. Select the original code`,
      'Use selection as original',
    )

    if (!exampleOriginal) {
      return false
    }

    const exampleRefactored = await ctx.prompt.waitTextSelection(
      `Now select the refactored code`,
      'Use selection as refactored',
    )

    if (!exampleRefactored) {
      return false
    }

    examples.push({ old: exampleOriginal.text, refactored: exampleRefactored.text })

    return true
  }

  const exampleAdded = await addExample()

  if (!exampleAdded) {
    return
  }

  async function awaiNextAction() {
    const nextAction = await ctx.prompt.dialog(
      'Examples gathered, you can now start refactoring',
      [
        'Start refactoring',
        'Add more examples',
        'Remove last example',
        'Add extra instructions',
      ],
    )

    if (nextAction === 'Add more examples') {
      await addExample()

      return awaiNextAction()
    }

    if (nextAction === 'Add extra instructions') {
      const newExtraInstructions = await ctx.prompt.text(
        'Add extra instructions',
        extraInstructions || undefined,
      )

      if (newExtraInstructions) {
        extraInstructions = newExtraInstructions
      }

      return awaiNextAction()
    }

    if (nextAction === 'Remove last example') {
      examples.pop()

      return awaiNextAction()
    }

    if (nextAction === 'Start refactoring') {
      const originalCode = await ctx.prompt.waitTextSelection(
        'Select the code you want to refactor',
        'Use selection as code to refactor',
      )

      if (!originalCode) {
        return awaiNextAction()
      }

      const refactoredCode = gptCodeRefactorStream({
        instructions: joinStrings(
          'Follow the examples provided',
          extraInstructions &&
            ` and consider also this instruction: ${extraInstructions}`,
        ),
        oldCode: originalCode.text,
        language: originalCode.language,
        useGpt3: modelToUse === 'useGpt3',
        examples,
        onCancel: ctx.onCancel,
      })

      const acceptedRefactoredCode = await ctx.showDiff({
        original: originalCode,
        refactored: refactoredCode,
        ext: ctx.activeEditor.extension,
        generatingDiffMessage: '🛠️ Refactoring...',
      })

      if (acceptedRefactoredCode) {
        const originalEditor = await originalCode.getEditor()

        await originalEditor.setContent(acceptedRefactoredCode)

        await originalEditor.format()
      }

      return awaiNextAction()
    }

    return false
  }

  await awaiNextAction()
})
