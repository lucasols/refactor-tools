refacTools.config({
  name: 'Reverse text',
  description: 'Reverse text',
})

refacTools.runRefactor(async (ctx) => {
  const selectedCode = await ctx.activeEditor.getSelected()

  const textToTranslate =
    selectedCode ? selectedCode.text : await ctx.prompt.text('Text to translate')

  if (!textToTranslate) return

  const translatedText = textToTranslate.split('').reverse().join('')

  ctx.ide.newUnsavedFile({
    content: translatedText,
  })
})
