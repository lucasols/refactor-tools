import { gptCodeRefactor } from './utils/openaiGpt'
import { simpleRefactor } from './utils/simpleRefactor'

type Variants = 'quickReplace'

refacTools.config<Variants>({
  name: 'Fix syntax errors',
  variants: {
    quickReplace: 'Quick Replace',
  },
  enabledWhen: {
    hasSelection: true,
  },
})

refacTools.runRefactor<Variants>(async (ctx) => {
  await simpleRefactor('Fix syntax errors', ctx)
})
