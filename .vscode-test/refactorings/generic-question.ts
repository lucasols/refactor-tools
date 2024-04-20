import { smartAssistant } from './utils/ai'

type Variants = 'useGpt4' | 'useGpt3'

refacTools.config<Variants>({
  name: 'Ask about anything',
})

refacTools.runRefactor<Variants>(async (ctx) => {
  const activeEditor = ctx.getActiveEditor()

  const lastInstruction = ctx.history.getLast()?.get<string>('lastInstruction')

  const selectedCode = await activeEditor.getSelected()

  const instructions = await ctx.prompt.text(
    `Your question${selectedCode ? ' about the selected text' : ''}`,
    lastInstruction,
  )

  ctx.history.add('lastInstruction', instructions)

  if (!instructions) {
    throw new Error('No instructions provided')
  }

  const selectedText = selectedCode?.text

  const editor = await ctx.ide.newUnsavedFile({
    language: 'markdown',
    content: '',
    editorGroup: 'right',
  })

  const mdResponse = smartAssistant({
    prompt: instructions,
    selectedText: selectedText,
    onCancel: ctx.onCancel,
  })

  for await (const partialResponse of mdResponse) {
    await editor.setContent(partialResponse)
  }

  await editor.openMarkdownPreview()
})
