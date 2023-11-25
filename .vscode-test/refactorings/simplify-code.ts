import { simpleRefactor } from './utils/simpleRefactor'

type Variants = 'quickReplace'

refacTools.config<Variants>({
  name: 'Simplify code',
  variants: {
    quickReplace: 'Quick Replace',
  },
  enabledWhen: {
    hasSelection: true,
  },
})

refacTools.runRefactor<Variants>(async (ctx) => {
  await simpleRefactor('Symplify the code', ctx)
})
