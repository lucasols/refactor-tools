import { gptCodeRefactor } from './utils/openaiGpt'
import { simpleRefactor } from './utils/simpleRefactor'

type Props = {
  variants: 'quickReplace'
}

refacTools.config<Props>({
  name: 'Fix syntax errors',
  variants: {
    quickReplace: 'Quick Replace',
  },
  enabledWhen: {
    hasSelection: true,
  },
})

refacTools.runRefactor<Props>(async (ctx) => {
  await simpleRefactor('Fix syntax errors', ctx)
})
