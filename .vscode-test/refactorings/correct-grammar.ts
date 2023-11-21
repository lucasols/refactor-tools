import { gptTransform } from '.vscode/refactorings/utils/openaiGpt';

refacTools.config({
  name: 'Correct grammar',
});

refacTools.runRefactor(async (ctx) => {
  const selectedCode = await ctx.activeEditor.getSelected();

  const textToCheck = selectedCode
    ? selectedCode.text
    : await ctx.prompt.text('Text to check');

  if (!textToCheck) return;

  const translatedText = await gptTransform({
    input: textToCheck,
    prompt: 'Correct the grammar of the text',
    returnExplanation: true,
  });

  await ctx.fs.createTempFile('txt', translatedText).openEditor('right');
});
