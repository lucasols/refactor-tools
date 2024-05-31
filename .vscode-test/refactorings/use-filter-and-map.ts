import { md } from './utils/md'
import { simpleRefactor } from './utils/simpleRefactor'

type Variants = 'quickReplace'

refacTools.config<Variants>({
  name: 'Use filterAndMap',
  variants: {
    quickReplace: 'Quick Replace',
  },
  enabledWhen: {
    hasSelection: true,
  },
})

refacTools.runRefactor<Variants>(async (ctx) => {
  await simpleRefactor(
    'filterAndMap is a function that performs a filter and a map operation in a single step. To reject items `false` is returned otherwise the return value is mapped to the new array',
    ctx,
    {
      examples: md`
        ~~~ts
        // old:
        const groupsWithPreloadedItems = subGroups
          .filter((subGroup) => subGroup.isPreloaded)
          .map((subGroup) => ({
            ...subGroup,
            cmds: searchCommands(subGroup.cmds, subQuery),
          }))

        // new:
        const groupsWithPreloadedItems = filterAndMap(subGroups, (subGroup) =>
          !subGroup.isPreloaded ? false : (
            {
              ...subGroup,
              cmds: searchCommands(subGroup.cmds, subQuery),
            }
          ),
        )
        ~~~
      `,
    },
  )
})
