export function* getRegexMatchAll(str: string, regexp: RegExp) {
  const flags = regexp.global ? regexp.flags : `${regexp.flags}g`
  const re = new RegExp(regexp, flags)

  let match: RegExpExecArray | null
  let lastIndex = 0

  while ((match = re.exec(str))) {
    const [fullMatch, ...groups]: (string | undefined)[] = match
    const prevLastIndex = lastIndex
    lastIndex = re.lastIndex

    yield {
      groups,
      fullMatch,
      namedGroups: match.groups,
      start: match.index,
      end: lastIndex,
      prevEnd: prevLastIndex,
    }
  }
}

export function getRegexMatches(string: string, regex: RegExp) {
  const [fullMatch, ...groups] = regex.exec(string) || [undefined]

  return {
    groups,
    fullMatch,
  }
}
