import { simpleRefactor } from './utils/simpleRefactor'

type Variants = 'quickReplace'

refacTools.config<Variants>({
  name: 'Use switch case exhaustive match',
  variants: {
    quickReplace: 'Quick Replace',
  },
  enabledWhen: {
    hasSelection: true,
  },
})

refacTools.runRefactor<Variants>(async (ctx) => {
  await simpleRefactor(
    'Use switch case for the conditionals instead. Do not break the conditional type narrowing. The matches should be exhaustive and include a `exhaustiveCheck(type)` function in default case. Do not declare the `exhaustiveCheck` function, it will be imported outside the refactored code. When the case condition is not explicit, use a `case "?":`',
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
            switch (item.type) {
              case 'app':
                return item.label;

              case 'table':
                return item.name || 'Untitled';

              case 'record':
                return item.recordLabel || 'Untitled';

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
            ((): string => {
              switch (item.type) {
                case 'app':
                  return item.label;

                case 'table':
                  return item.name || 'Untitled';

                case 'record':
                  return item.recordLabel || 'Untitled';

                case 'custom-page':
                  return item.label;

                case '?':
                  return 'Untitled';

                default:
                  // this should always be present
                  return exhaustiveCheck(item.type);
              }
            })(),
          );`,
        },
      ],
    },
  )
})
