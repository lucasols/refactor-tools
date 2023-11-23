type Arg = string | false | undefined | null

export function joinStrings(...args: (Arg | Arg[])[]) {
  const strings: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (!arg) continue

    if (Array.isArray(arg)) {
      strings.push(joinStrings(...arg))
      continue
    }

    strings.push(arg)
  }

  return strings.join('')
}

export function capitalizeFirstLetter(str: string) {
  const firstLetter = str[0]

  return firstLetter ? firstLetter.toUpperCase() + str.slice(1) : str
}
