import { simpleCodeQuestion } from './utils/simpleCodeQuestion'
import { simpleRefactor } from './utils/simpleRefactor'

refacTools.config({
  name: 'Review code',
  enabledWhen: {
    hasSelection: true,
  },
})

refacTools.runRefactor(async (ctx) => {
  await simpleCodeQuestion(`Review the code focusing on finding potential problems, split your response in very obvious problems, possible problems and suggestions. Remember that you may be reviewing only a part of the code, so be optimitic about the code you don't have contex`, ctx)
})
