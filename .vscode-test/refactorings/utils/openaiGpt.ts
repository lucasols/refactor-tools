import OpenAI from 'openai'
import { dedent } from '../../../utils-lib/dedent'
import { joinStrings } from '@utils/stringUtils'

const API_KEY = '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'

const extractCodeRegex = /```([a-z]*)\n([\s\S]+?)\n```/

const openai = new OpenAI({
  apiKey: API_KEY,
})

export async function gptTransform({
  prompt,
  examples,
  input,
  returnExplanation,
  mockResponse,
}: {
  prompt: string
  examples?: {
    old: string
    new: string
  }[]
  input: string
  returnExplanation?: boolean
  mockResponse?: string
}) {
  if (mockResponse) {
    return mockResponse
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4-1106-preview',
    max_tokens: 4096,
    messages: [
      {
        role: 'system',
        content: joinStrings(
          `You will be provided with only inputs. Your task is to convert them according to the instruction: "${escapeDoubleQuotes(
            prompt,
          )}"`,
          returnExplanation ?
            `, and return the output along with an explanation of your reasoning.`
          : `, and return ONLY the output.`,
          examples && examples.length > 0 ?
            `\nConsider the following references for your task:\n${examples
              .map(
                (e) => `"${escapeDoubleQuotes(e.old)}" -> "${escapeDoubleQuotes(e.new)}"`,
              )
              .join('\n')}`
          : ``,
        ),
      },
      {
        role: 'user',
        content: `"${escapeDoubleQuotes(input)}"`,
      },
    ],
  })

  const firstChoice = response.choices[0]

  if (firstChoice?.finish_reason !== 'stop') {
    throw new Error(`OpenAI did not finish: ${firstChoice?.finish_reason}`)
  }

  if (!firstChoice?.message.content) {
    throw new Error('No response from OpenAI')
  }

  return firstChoice.message.content
}

function escapeDoubleQuotes(str: string) {
  return str.replaceAll('"', '\\"')
}

const tripleBacktick = '```'

export async function gptCodeRefactor({
  instructions,
  oldCode,
  language,
  examples,
}: {
  instructions: string
  language: string
  examples?: {
    old: string
    refactored: string
  }[]
  oldCode: string
}): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4-1106-preview',
    max_tokens: 4096,
    messages: [
      {
        role: 'system',
        content: generateCodePrompt(language, instructions, examples),
      },
      {
        role: 'user',
        content: `${tripleBacktick}\n${oldCode}\n${tripleBacktick}`,
      },
    ],
  })

  const firstChoice = response.choices[0]

  if (firstChoice?.finish_reason !== 'stop') {
    throw new Error(`OpenAI did not finish: ${firstChoice?.finish_reason}`)
  }

  if (!firstChoice?.message.content) {
    throw new Error('No response from OpenAI')
  }

  const responseCode = firstChoice.message.content

  if (responseCode.startsWith(tripleBacktick)) {
    const match = responseCode.match(extractCodeRegex)

    if (!match?.[2]) {
      throw new Error(
        'Could not extract code from response, full response:\n' + responseCode,
      )
    }

    return match[2]
  }

  return responseCode
}

function generateCodePrompt(
  language: string,
  instructions: string,
  examples: { old: string; refactored: string }[] | undefined,
): string | null {
  return joinStrings(
    `You will be provided with only ${language} code inputs inside markdown, like ${tripleBacktick}input code${tripleBacktick}. Your task is to refactor them according to the instruction: "${escapeDoubleQuotes(
      instructions,
    )}", and return ONLY the resulting code.`,
    examples &&
      examples.length > 0 &&
      `\n\nConsider the following references for your task:\n\n${examples
        .map(
          (e) =>
            `Old:\n${tripleBacktick}\n${dedent(
              e.old,
            )}\n${tripleBacktick}\n\nRefactored:\n${tripleBacktick}\n${dedent(
              e.refactored,
            )}\n${tripleBacktick}`,
        )
        .join('\n\n-----\n\n')}`,
  )
}
