import { simpleCodeQuestion } from './utils/simpleCodeQuestion'

refacTools.config({
  name: 'Review code',
  enabledWhen: {
    hasSelection: true,
  },
})

refacTools.runRefactor(async (ctx) => {
  await simpleCodeQuestion(
    `Analyze the code and provide feedback based on these criteria:
    - Split your response into 'very obvious problems', 'possible problems' and 'suggestions'.

    - Consider that the code it's already strongly typed, so runtime errors are NEVER a concern and impossible to happen.

    - When reviewing the code focus only on critical errors, particularly logical issues that could cause unexpected behavior. Consider unclear or counterintuitive code as a potential problem even if it's not obvious that it can cause bugs.

    - Ignore best practices, style issues, or non-critical optimizations. Consider code that you don't have proper context as correct.

    - If there are non descriptive names for variables and functions, suggest better names. Lengthy variable or function names are only a problem if there are smaller alternatives that are at least as descriptive.

    - If there is duplicated logic or code, consider that it's a sign of a problem and suggest a better way to refactor it.

    - Ignore readability issues that can't cause bugs.

    - Use of short-circuit evaluation and false, null or undefined values in arrays should only be considered a problem if it's 100% certain that it will cause bugs, otherwise just ignore it.

    - Functions in which the return value is not known should be considered as ALWAYS returning the correct values.
    `,
    ctx,
  )
})
