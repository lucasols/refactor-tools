import { gptCodeRefactor } from '.vscode/refactorings/utils/openaiGpt';

export async function simpleRefactor(
  instructions: string,
  ctx: RefacToolsCtx<'quickReplace'>,
) {
  const selectedCode = await ctx.activeEditor.getSelected();

  if (!selectedCode) {
    throw new Error('No code selected');
  }

  const refactoredCode = '<div />'
  // await gptCodeRefactor({
  //   instructions: instructions,
  //   oldCode: selectedCode.text,
  //   language: selectedCode.language,
  // });

  if (ctx.variant === 'quickReplace') {
    await selectedCode.replaceWith(refactoredCode);

    return;
  }

  const acceptedRefactoredCode = await ctx.showDiff({
    original: selectedCode,
    refactored: refactoredCode,
    ext: ctx.activeEditor.getExtension(),
  });

  if (acceptedRefactoredCode) {
    await ctx.activeEditor.setContent(acceptedRefactoredCode);

    await ctx.activeEditor.format();
  }
}
