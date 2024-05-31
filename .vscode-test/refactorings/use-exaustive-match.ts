import { simpleRefactor } from './utils/simpleRefactor'

type Variants = 'quickReplace'

refacTools.config<Variants>({
  name: 'Use exhaustive match',
  variants: {
    quickReplace: 'Quick Replace',
  },
  enabledWhen: {
    hasSelection: true,
  },
})

refacTools.runRefactor<Variants>(async (ctx) => {
  await simpleRefactor(
    'Exhaustive match is a function that ensures that all possible cases are covered. When the case condition is not explicit, use a `case "?":`',
    ctx,
    {
      examples: [
        {
          old: `
          function getItemLabel(item: Item): string {
            if (item.type === 'app') {
              return item.label;
            }

            if (item.type === 'table') {
              return item.name || 'Untitled';
            }

            if (item.type === 'record') {
              return item.recordLabel || 'Untitled';
            }

            return 'Untitled';
          }
        `,
          refactored: `
          function getItemLabel(item: Item): string {
            return exhaustiveMatch(item.type).with({
              app: () => item.label,
              table: () => item.name || 'Untitled',
              record: () => item.recordLabel || 'Untitled',
              customPage: () => item.label,
              '?': () => 'Untitled',
            })
          }
        `,
        },
        {
          old: `
          return addName(
            item.type === 'app' ? item.label
            : item.type === 'table' ? item.name || 'Untitled'
            : item.type === 'record' ? item.recordLabel || 'Untitled'
            : item.type === 'custom-page' ? item.label
            : 'Untitled',
          );
        `,
          refactored: `
          return addName(
            exhaustiveMatch(item.type).with({
              app: () => item.label,
              table: () => item.name || 'Untitled',
              record: () => item.recordLabel || 'Untitled',
              customPage: () => item.label,
              '?': () => 'Untitled',
            })
          );`,
        },

        {
          old: `
           function getItemLabel(item: Item): string {
            switch (item.type) {
              case 'app':
              case 'table':
                return item.name || 'Untitled';

              case 'record':
              case 'custom-page':
                return item.label;

              case '?':
                return 'Untitled';

              default:
                // this should always be present
                return exhaustiveCheck(item.type);
            }
          }
        `,
          refactored: `
            function getItemLabel(item: Item): string {
              return exhaustiveMatch(item.type).with({
                app: '_nxt', // _nxt indicates that the following match result will be used instead
                table: '_nxt',
                record: () => item.recordLabel || 'Untitled',
                'custom-page': () => item.label,
                '?': () => 'Untitled',
              })
            }
          `,
        },
      ],
    },
  )
})
