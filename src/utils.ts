export function notNullish<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) {
    throw new Error(`Value is ${typeof value}`)
  }

  return value
}

// fork of https://github.com/dmnd/dedent
export function dedent(strings: TemplateStringsArray, ...values: string[]) {
  // $FlowFixMe: Flow doesn't undestand .raw
  const raw = typeof strings === 'string' ? [strings] : strings.raw

  // first, perform interpolation
  let result = ''
  for (let i = 0; i < raw.length; i++) {
    result += raw[i]! // join lines when there is a suppressed newline
      .replace(/\\\n[ \t]*/g, '')
      // handle escaped backticks
      .replace(/\\`/g, '`')

    if (i < values.length) {
      result += values[i]
    }
  }

  // now strip indentation
  const lines = result.split('\n')
  let mindent: number | null = null
  lines.forEach((l) => {
    const m = l.match(/^(\s+)\S+/)
    if (m) {
      const indent = m[1]!.length
      if (!mindent) {
        // this is the first indented line
        mindent = indent
      } else {
        mindent = Math.min(mindent, indent)
      }
    }
  })

  if (mindent !== null) {
    const m = mindent // appease Flow
    result = lines.map((l) => (l.startsWith(' ') ? l.slice(m) : l)).join('\n')
  }

  return (
    result
      // dedent eats leading and trailing whitespace too
      .trim()
      // handle escaped newlines at the end to ensure they don't get stripped too
      .replace(/\\n/g, '\n')
  )
}

type Deferred<T> = {
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason: unknown) => void
  promise: Promise<T>
}

export function defer<T = void>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })
  return { resolve, reject, promise }
}
