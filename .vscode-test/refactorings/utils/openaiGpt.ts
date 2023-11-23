import OpenAI from 'openai'
import { dedent } from './dedent'
import { OPENAI_API_KEY } from './env'
import { joinStrings } from './stringUtils'

const extractCodeRegex = /```(.*)\n([\s\S]+?)\n```/

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
})

export async function gptTransform({
  prompt,
  examples,
  input,
  returnExplanation,
  mockResponse,
  useGpt3,
  maxTokens = 4096,
}: {
  prompt: string
  examples?: {
    old: string
    new: string
  }[]
  maxTokens?: number
  input: string
  returnExplanation?: boolean
  mockResponse?: string
  useGpt3?: boolean
}) {
  if (mockResponse) {
    return mockResponse
  }

  const model = useGpt3 ? 'gpt-3.5-turbo-1106' : 'gpt-4-1106-preview'

  const startTimestamp = Date.now()

  const response = await openai.chat.completions.create({
    model: model,
    max_tokens: maxTokens,
    messages: [
      {
        role: 'system',
        content: joinStrings(
          `You will be provided with only inputs. Your task is to convert them according to the instruction: "${escapeDoubleQuotes(
            prompt,
          )}"`,
          returnExplanation ?
            `, and return the output along with an explanation of your reasoning in markdown.`
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

  const elapsed = Date.now() - startTimestamp

  logUsage(elapsed, model, response)

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
  useGpt3,
  maxTokens = 4096,
}: {
  instructions: string
  language: string
  examples?: {
    old: string
    refactored: string
  }[]
  oldCode: string
  useGpt3?: boolean
  maxTokens?: number
}): Promise<string> {
  const model = useGpt3 ? 'gpt-3.5-turbo-1106' : 'gpt-4-1106-preview'

  const startTimestamp = Date.now()

  const response = await openai.chat.completions.create({
    model: model,
    max_tokens: maxTokens,
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

  const elapsed = Date.now() - startTimestamp

  logUsage(elapsed, model, response)

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

export async function gptAskAboutCode({
  question,
  contextCode,
  useGpt3,
  selectedCode,
  language,
  maxTokens = 4096,
}: {
  question: string
  language: string
  selectedCode?: string
  contextCode: string
  useGpt3?: boolean
  maxTokens?: number
}): Promise<string> {
  const model = useGpt3 ? 'gpt-3.5-turbo-1106' : 'gpt-4-1106-preview'

  const startTimestamp = Date.now()

  const response = await openai.chat.completions.create({
    model: model,
    max_tokens: maxTokens,
    messages: [
      {
        role: 'system',
        content: joinStrings(
          `You is a programmer expert for the language ${language}. Your task is to answer the questions about the following code as context:`,
          `\n\n${tripleBacktick}\n${contextCode}\n${tripleBacktick}`,
          selectedCode &&
            `\n\nThe user has selected the following code from above:\n\n${tripleBacktick}\n${selectedCode}\n${tripleBacktick}`,
          `\n\nAnswer with markdown syntax.`,
        ),
      },
      {
        role: 'user',
        content: dedent(question),
      },
    ],
  })

  const elapsed = Date.now() - startTimestamp

  logUsage(elapsed, model, response)

  const firstChoice = response.choices[0]

  if (firstChoice?.finish_reason !== 'stop') {
    throw new Error(`OpenAI did not finish: ${firstChoice?.finish_reason}`)
  }

  if (!firstChoice?.message.content) {
    throw new Error('No response from OpenAI')
  }

  return firstChoice.message.content
}

export async function gptGenericPrompt({
  prompt,
  useGpt3,
  maxTokens = 4096,
}: {
  prompt: string
  useGpt3?: boolean
  maxTokens?: number
}): Promise<string> {
  const model = useGpt3 ? 'gpt-3.5-turbo-1106' : 'gpt-4-1106-preview'

  const startTimestamp = Date.now()

  const response = await openai.chat.completions.create({
    model: model,
    max_tokens: maxTokens,
    messages: [
      {
        role: 'system',
        content: `You are ChatGPT, a large language model trained by OpenAI. Follow the user's instructions carefully. Respond using markdown.`,
      },
      {
        role: 'user',
        content: dedent(prompt),
      },
    ],
  })

  const elapsed = Date.now() - startTimestamp

  logUsage(elapsed, model, response)

  const firstChoice = response.choices[0]

  if (firstChoice?.finish_reason !== 'stop') {
    throw new Error(`OpenAI did not finish: ${firstChoice?.finish_reason}`)
  }

  if (!firstChoice?.message.content) {
    throw new Error('No response from OpenAI')
  }

  return firstChoice.message.content
}

function logUsage(
  elapsed: number,
  model: string,
  response: OpenAI.Chat.Completions.ChatCompletion,
) {
  refacTools.log(
    `OpenAI took ${formatNum(
      elapsed / 1000,
    )}s using model "${model}".\nTokens used:\n  Prompt: ${response.usage
      ?.prompt_tokens}\n  Completion: ${response.usage
      ?.completion_tokens}\n Total: ${response.usage?.total_tokens}`,
  )
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

function formatNum(num: number) {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
