import { gptCodeRefactor } from '.vscode/refactorings/utils/openaiGpt';
import { simpleRefactor } from '.vscode/refactorings/utils/simpleRefactor';

refacTools.config({
  name: 'Fix syntax errors',
  variants: {
    quickReplace: 'Quick Replace',
  },
  enabledWhen: {
    hasSelection: true,
  },
});

refacTools.runRefactor<'quickReplace'>(async (ctx) => {
  await simpleRefactor('Fix syntax errors', ctx);
});
