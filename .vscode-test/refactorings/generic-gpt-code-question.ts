import { gptAskAboutCode, gptCodeRefactor } from './utils/openaiGpt'

type RefactorProps = {
  options: 'useGpt4' | 'useGpt3'
}

refacTools.config<RefactorProps>({
  name: 'Generic GPT question about selected code',
  options: {
    useGpt4: {
      default: true,
      label: 'Use GPT-4',
    },
    useGpt3: {
      label: 'Use GPT-3',
    },
  },
  enabledWhen: {
    hasSelection: true,
  },
})

refacTools.runRefactor<RefactorProps>(async (ctx) => {
  const selectedCode = await ctx.activeEditor.getSelected()

  const instructions = await ctx.prompt.text('Code question')

  if (!instructions) {
    throw new Error('No instructions provided')
  }

  if (!selectedCode) {
    throw new Error('No code selected')
  }

  const selectedText = selectedCode.text

  const mdResponse = await gptAskAboutCode({
    question: instructions,
    contextCode: selectedText,
    language: ctx.activeEditor.language,
    useGpt3: ctx.selectedOption === 'useGpt3',
  })

  await ctx.ide.newUnsavedFile({
    language: 'markdown',
    content: mdResponse,
    editorGroup: 'right',
  })
})
