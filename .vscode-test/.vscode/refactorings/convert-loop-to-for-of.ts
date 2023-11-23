import { rc_parse, rc_string } from 'runcheck'

refacTools.config({
  name: 'Convert loop to for of',
  description: 'Convert selected loop to for of',
  enabledWhen: {
    hasSelection: true,
    activeLanguageIs: ['typescriptreact', 'typescript'],
  },
  variants: {
    withDiff: 'With diff',
  },
})

refacTools.runRefactor(async (ctx) => {
  const selectedCode = await ctx.activeEditor.getSelected()

  if (!selectedCode) {
    throw new Error('No code selected')
  }

  const refactoredCode = 'new code'

  if (rc_parse('ok', rc_string)) {
    ctx.ide.showInfoMessage('Imported libs works! :)')
  }

  if (ctx.variant === 'withDiff') {
    const acceptedRefactoring = await ctx.showDiff({
      original: selectedCode,
      refactored: refactoredCode,
      ext: '.tsx',
    })

    if (!acceptedRefactoring) return

    await ctx.activeEditor.setContent(acceptedRefactoring)
    await ctx.activeEditor.format()

    return
  }

  selectedCode.replaceWith(refactoredCode)

  await ctx.activeEditor.format()
})
