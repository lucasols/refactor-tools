import { rc_parse, rc_string } from 'runcheck'
import { mockGpt4 } from './utils/foo'

refacTools.config({
  name: 'Reverse text',
  description: 'Reverse text',
})

refacTools.runRefactor(async (ctx) => {
  const selectedCode = ctx.activeEditor.getSelected()

  const textToTranslate = selectedCode
    ? selectedCode.text
    : await ctx.prompt.text('Text to translate')

  if (!textToTranslate) return

  const translatedText = textToTranslate.split('').reverse().join('')

  ctx.ide.newUnsavedFile({
    content: translatedText,
  })
})
