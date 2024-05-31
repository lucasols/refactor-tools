import { dedent } from './dedent'

export function md(strings: TemplateStringsArray, ...values: string[]) {
  return dedent(strings, ...values)
}
