import { gptTransform } from './utils/ai'

refacTools.config({
  name: 'Translate text',
  description: 'Reverse text',
  variants: {
    default: 'EN -> PT',
    ptToEn: 'PT -> EN',
  },
})

refacTools.runRefactor<'default' | 'ptToEn'>(async (ctx) => {
  const selectedCode = await ctx.getActiveEditor().getSelected()

  const textToTranslate =
    selectedCode ? selectedCode.text : await ctx.prompt.text('Text to translate')

  if (!textToTranslate) return

  const editor = await ctx.ide.newUnsavedFile({
    language: 'markdown',
    content: '',
    editorGroup: 'right',
  })

  const translatedText = gptTransform({
    input: textToTranslate,
    model: { service: 'openai', model: 'gpt-4' },
    prompt:
      ctx.variant === 'ptToEn' ?
        'Translate from Portuguese to English'
      : 'Translate from English to Portuguese',
    onCancel: ctx.onCancel,
  })

  for await (const partialResponse of translatedText) {
    await editor.setContent(partialResponse)
  }

  await editor.openMarkdownPreview()
})
