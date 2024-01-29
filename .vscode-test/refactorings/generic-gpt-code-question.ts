import { gptAskAboutCode } from './utils/openaiGpt'

type Variants = 'useGpt4' | 'useGpt3'

refacTools.config<Variants>({
  name: 'Ask about code',
  enabledWhen: {
    hasSelection: true,
  },
})

refacTools.runRefactor<Variants>(async (ctx) => {
  const activeEditor = ctx.getActiveEditor()

  const lastInstruction = ctx.history.getLast()?.get<string>('lastInstruction')

  const selectedCode = await activeEditor.getSelected()

  const instructions = await ctx.prompt.text('Code question', lastInstruction)

  ctx.history.add('lastInstruction', instructions)

  if (!instructions) {
    throw new Error('No instructions provided')
  }

  if (!selectedCode) {
    throw new Error('No code selected')
  }

  const selectedText = selectedCode.text

  const editor = await ctx.ide.newUnsavedFile({
    language: 'markdown',
    content: '',
    editorGroup: 'right',
  })

  const mdResponse = gptAskAboutCode({
    question: instructions,
    contextCode: selectedText,
    language: activeEditor.language,
    onCancel: ctx.onCancel,
  })

  for await (const partialResponse of mdResponse) {
    await editor.setContent(partialResponse)
  }

  await editor.openMarkdownPreview()
})
