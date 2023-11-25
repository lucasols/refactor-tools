import { simpleRefactor } from './utils/simpleRefactor'

type Variants = 'quickReplace'

refacTools.config<Variants>({
  name: 'Fix potential bugs',
  variants: {
    quickReplace: 'Quick Replace',
  },
  enabledWhen: {
    hasSelection: true,
  },
})

refacTools.runRefactor<Variants>(async (ctx) => {
  await simpleRefactor('Fix potential bugs', ctx)
})
