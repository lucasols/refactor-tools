import { gptCodeRefactor, gptCodeRefactorStream } from './utils/ai'
import { dedent } from './utils/dedent'
import { getRegexMatchAll, getRegexMatches } from './utils/getRegexMatches'

refacTools.config({
  name: 'Temp refactoring session',
})

refacTools.runRefactor(async (ctx) => {
  const examples: { old: string; refactored: string }[] = []

  let instructions = 'Refactor the code following the examples provided'

  const promptFile = await ctx.ide.newUnsavedFile({
    language: 'markdown',
    content: dedent`
      # Instructions

      Add examples of code refactoring you want to perform. And possibly extra instructions.

      ## Examples

      \`\`\`ts
      // ...

      // after

      // ...

      \`\`\`

      ## Instructions

      Refactor the code following the examples provided
    `,
  })

  async function updateInstructionsAndExamples() {
    const content = await promptFile.getContent()

    const examplesCodeRegex = /```([\s\S]+?)\n\/\/ after([\s\S]+?)```/

    for (const {
      groups: [old, refactored],
    } of getRegexMatchAll(content, examplesCodeRegex)) {
      if (!old || !refactored) {
        throw new Error('Invalid examples')
      }

      if (old.trim() === refactored.trim()) {
        throw new Error('Examples should be different')
      }

      examples.push({ old: old.trim(), refactored: refactored.trim() })
    }

    const instructionsRegex = /## Instructions([\s\S]+)/

    const {
      groups: [instructionsFromFile],
    } = getRegexMatches(content, instructionsRegex)

    if (!instructionsFromFile?.trim()) {
      throw new Error('Invalid instructions')
    }

    instructions = instructionsFromFile.trim()

    if (examples.length === 0) {
      throw new Error('No examples provided')
    }
  }

  async function awaiNextAction() {
    const nextAction = await ctx.prompt.dialog(
      'Fill the examples and start the refactoring',
      ['Quick refactoring', 'Refactor with diff'],
    )

    if (!nextAction) {
      return false
    }

    try {
      await updateInstructionsAndExamples()
    } catch (e) {
      if (e instanceof Error) ctx.ide.showErrorMessage(e.message)

      return awaiNextAction()
    }

    const activeEditor = ctx.getActiveEditor()

    const selectedCode = await activeEditor.getSelected()

    if (!selectedCode) {
      ctx.ide.showErrorMessage('No code selected')

      return awaiNextAction()
    }

    if (nextAction === 'Quick refactoring') {
      await ctx.ide.showProgress('🛠️ Refactoring...', async () => {
        const refactoredCode = await gptCodeRefactor({
          instructions,
          oldCode: selectedCode.text,
          language: selectedCode.language,
          examples,
        })

        await selectedCode.replaceWith(refactoredCode)

        await activeEditor.format()
      })

      return awaiNextAction()
    }

    if (nextAction === 'Refactor with diff') {
      const refactoredCode = gptCodeRefactorStream({
        instructions,
        oldCode: selectedCode.text,
        language: selectedCode.language,
        examples,
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

      return awaiNextAction()
    }
  }

  await awaiNextAction()
})
