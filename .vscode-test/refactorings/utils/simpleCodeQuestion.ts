import { gptAskAboutCode } from './openaiGpt'

export async function simpleCodeQuestion(
  instructions: string,
  ctx: RefacToolsCtx<string>,
  useGpt3?: boolean,
) {
  const modelToUse =
    useGpt3 ? 'useGpt3' : (
      await ctx.prompt.quickPick({
        options: [
          { label: 'Use GPT-3', value: 'useGpt3' },
          { label: 'Use GPT-4', value: 'useGpt4' },
        ],
        title: 'Select GPT model',
      })
    )

  if (!modelToUse) {
    return
  }

  const selectedCode = await ctx.activeEditor.getSelected()

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
    language: ctx.activeEditor.language,
    useGpt3: modelToUse === 'useGpt3',
    onCancel: ctx.onCancel,
  })

  for await (const partialResponse of mdResponse) {
    await editor.setContent(partialResponse)
  }

  await editor.openMarkdownPreview()
}
