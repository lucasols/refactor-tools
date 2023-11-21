import { gptCodeRefactor } from '.vscode/refactorings/utils/openaiGpt';

refacTools.config({
  name: 'Generic Refactoring',
  description: 'Generic GPT4 Refactoring',
  variants: {
    quickReplace: 'Quick Replace',
    withLastInstruction: 'With Last Instruction',
  },
  enabledWhen: {
    hasSelection: true,
  },
});

refacTools.runRefactor<'quickReplace' | 'withLastInstruction'>(async (ctx) => {
  const selectedCode = await ctx.activeEditor.getSelected();

  if (!selectedCode) {
    throw new Error('No code selected');
  }

  const lastInstruction =
    ctx.variant === 'withLastInstruction' &&
    ctx.history.getLast()?.get<string>('lastInstruction');

  const instructions = lastInstruction
    ? lastInstruction
    : await ctx.prompt.text('Refactoring instructions');

  ctx.history.add('lastInstruction', instructions);

  if (!instructions) {
    throw new Error('No instructions provided');
  }

  const refactoredCode = await gptCodeRefactor({
    instructions: instructions,
    oldCode: selectedCode.text,
    language: selectedCode.language,
  });

  if (ctx.variant === 'quickReplace' || ctx.variant === 'withLastInstruction') {
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
  }
});
