import { gptAskAboutCode } from './openaiGpt'

export async function simpleCodeQuestion(
  instructions: string,
  ctx: RefacToolsCtx<string>,
  useGpt3?: boolean,
) {
  const activeEditor = ctx.getActiveEditor()

  const selectedCode = await activeEditor.getSelected()

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
}
