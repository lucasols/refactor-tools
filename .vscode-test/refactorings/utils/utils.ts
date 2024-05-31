export function forEachRegexMatch(
  regex: RegExp,
  string: string,
  callback: (matches: { fullMatch: string; groups: string[] }) => void,
) {
  let result
  while ((result = regex.exec(string)) !== null) {
    const [fullMatch, ...groups] = result

    callback({
      fullMatch,
      groups,
    })
  }
}
