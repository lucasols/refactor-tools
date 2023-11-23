import { gptAskAboutCode, gptCodeRefactor } from './utils/openaiGpt'

type Variants = 'useGpt4' | 'useGpt3'

refacTools.config<Variants>({
  name: 'Generic GPT question about selected code',
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
    useGpt3: modelToUse === 'useGpt3',
  })

  await ctx.ide.newUnsavedFile({
    language: 'markdown',
    content: mdResponse,
    editorGroup: 'right',
  })
})
