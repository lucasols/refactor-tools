import { gptTransform } from '.vscode/refactorings/utils/openaiGpt';

refacTools.config({
  name: 'Translate text',
  description: 'Reverse text',
  variants: {
    default: 'EN -> PT',
    ptToEn: 'PT -> EN',
  },
});

refacTools.runRefactor<'default' | 'ptToEn'>(async (ctx) => {
  const selectedCode = await ctx.activeEditor.getSelected();

  const textToTranslate = selectedCode
    ? selectedCode.text
    : await ctx.prompt.text('Text to translate');

  if (!textToTranslate) return;

  const translatedText = await gptTransform({
    input: textToTranslate,
    prompt:
      ctx.variant === 'ptToEn'
        ? 'Translate from Portuguese to English'
        : 'Translate from English to Portuguese',
  });

  await ctx.fs.createTempFile('txt', translatedText).openEditor('right');
});
