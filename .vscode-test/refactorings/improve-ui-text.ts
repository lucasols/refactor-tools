import { gptTransform } from './utils/ai'

refacTools.config({
  name: 'Improve UI text',
})

refacTools.runRefactor(async (ctx) => {
  const selectedCode = await ctx.getActiveEditor().getSelected()

  const textToCheck =
    selectedCode ? selectedCode.text : await ctx.prompt.text('Text to check')

  if (!textToCheck) return

  const editor = await ctx.ide.newUnsavedFile({
    language: 'markdown',
    content: '',
    editorGroup: 'right',
  })

  const translatedText = gptTransform({
    input: textToCheck,
    prompt: 'This text is a UI text. Improve it to be more concise and clear.',
    returnExplanation: true,
    onCancel: ctx.onCancel,
    model: { service: 'openai', model: 'gpt-4' },
  })

  for await (const partialResponse of translatedText) {
    await editor.setContent(partialResponse)
  }

  await editor.openMarkdownPreview()
})
