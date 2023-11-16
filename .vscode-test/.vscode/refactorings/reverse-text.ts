import { mockGpt4 } from './utils/foo'

refacTools.config({
  name: 'Reverse text',
  description: 'Reverse text',
})

refacTools.runRefactor(async (ctx) => {
  const selectedCode = await ctx.activeEditor.getSelected()

  const textToTranslate =
    selectedCode ? selectedCode.text : await ctx.prompt.text('Text to translate')

  if (!textToTranslate) return

  const translatedText = await mockGpt4({
    input: textToTranslate,
    prompt:
      ctx.variant === 'ptEn' ?
        'Translate from Portuguese to English'
      : 'Translate from English to Portuguese',
  })

  await ctx.fs.createTempFile('txt', translatedText).openEditor()
})
