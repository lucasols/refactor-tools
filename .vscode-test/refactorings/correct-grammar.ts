import { gptTransform } from './utils/openaiGpt'

refacTools.config({
  name: 'Correct grammar',
})

refacTools.runRefactor(async (ctx) => {
  const selectedCode = await ctx.activeEditor.getSelected()

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
    prompt: 'Correct the grammar of the text',
    returnExplanation: true,
    onCancel: ctx.onCancel,
  })

  for await (const partialResponse of translatedText) {
    await editor.setContent(partialResponse)
  }

  await editor.openMarkdownPreview()
})
