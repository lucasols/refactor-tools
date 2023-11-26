import { simpleCodeQuestion } from './utils/simpleCodeQuestion'
import { simpleRefactor } from './utils/simpleRefactor'

refacTools.config({
  name: 'Review code',
  enabledWhen: {
    hasSelection: true,
  },
})

refacTools.runRefactor(async (ctx) => {
  await simpleCodeQuestion(
    `Review the code with a focus on identifying potential problems. Split your response into 'very obvious problems', 'possible problems' and 'suggestions' Remember that you might be reviewing only a part of the code, so be optimistic about the code for which you don't have context.`,
    ctx,
  )
})
