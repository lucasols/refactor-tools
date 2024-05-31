import Grog from 'groq-sdk'
import OpenAI from 'openai'
import { dedent } from './dedent'
import { GROG_API_KEY, OPENAI_API_KEY } from './env'
import { joinStrings } from './stringUtils'
import { forEachRegexMatch } from './utils'

const extractCodeRegex = /```(.*)\n([\s\S]+?)\n```/

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
})

const grog = new Grog({
  apiKey: GROG_API_KEY,
})

type GrogModels = 'llama-3-70b' | 'llama-3-8b' | 'mixtral-8x7b'

type AiModels =
  | { service: 'openai'; model: 'gpt-4' | 'gpt-3.5' }
  | { service: 'grog'; model: GrogModels }

const defaultModel: AiModels = {
  service: 'openai',
  model: 'gpt-4',
}

const grogModels: Record<GrogModels, string> = {
  'llama-3-70b': 'llama3-70b-8192',
  'llama-3-8b': 'llama3-8b-8192',
  'mixtral-8x7b': 'mixtral-8x7b-32768',
}

async function* getAiResponseStream({
  model,
  messages,
  onCancel,
  stop,
  maxTokens,
}: {
  model: AiModels
  messages: { role: 'system' | 'user'; content: string }[]
  onCancel?: (fn: () => void) => void
  maxTokens?: number
  stop?: string
}): AsyncGenerator<string> {
  if (model.service === 'openai') {
    const modelToUse = model.model === 'gpt-3.5' ? 'gpt-3.5-turbo-1106' : 'gpt-4o'

    const responseStream = await openai.chat.completions.create({
      model: modelToUse,
      max_tokens: maxTokens,
      stop,
      stream: true,
      messages: messages,
    })

    let response = ''

    onCancel?.(() => {
      responseStream.controller.abort()
    })

    const { shouldYield } = throttledYield(1000)

    for await (const chunk of responseStream) {
      const firstChoice = chunk.choices[0]

      if (!firstChoice) {
        throw new Error('No response from OpenAI')
      }

      if (firstChoice.finish_reason === 'stop') {
        yield response
        break
      }

      if (firstChoice.finish_reason) {
        throw new Error(`OpenAI error: ${firstChoice.finish_reason}`)
      }

      response += firstChoice.delta.content || ''

      if (shouldYield()) {
        yield response
      }
    }

    return response
  }

  if (model.service === 'grog') {
    const modelToUse = grogModels[model.model]

    const responseStream = await grog.chat.completions.create({
      model: modelToUse,
      max_tokens: maxTokens,
      stream: true,
      stop,
      messages: messages,
    })

    let response = ''

    onCancel?.(() => {
      responseStream.controller.abort()
    })

    const { shouldYield } = throttledYield(1000)

    for await (const chunk of responseStream) {
      const firstChoice = chunk.choices[0]

      if (!firstChoice) {
        throw new Error('No response from Grog')
      }

      if (firstChoice.finish_reason === 'stop') {
        yield response
        break
      }

      if (firstChoice.finish_reason) {
        throw new Error(`Grog error: ${firstChoice.finish_reason}`)
      }

      response += firstChoice.delta.content || ''

      if (shouldYield()) {
        yield response
      }
    }

    return response
  }
}

export async function getAiResponse({
  model,
  messages,
  maxTokens,
  stop,
}: {
  model: AiModels
  stop?: string
  messages: { role: 'system' | 'user'; content: string }[]
  maxTokens?: number
}): Promise<string> {
  if (model.service === 'openai') {
    const modelToUse = model.model === 'gpt-3.5' ? 'gpt-3.5-turbo-1106' : 'gpt-4-turbo'

    const startTimestamp = Date.now()

    const response = await openai.chat.completions.create({
      model: modelToUse,
      max_tokens: maxTokens,
      messages,
      stop,
    })

    const elapsed = Date.now() - startTimestamp

    logUsage(elapsed, modelToUse, response.usage)

    const firstChoice = response.choices[0]

    if (firstChoice?.finish_reason !== 'stop') {
      throw new Error(`OpenAI did not finish: ${firstChoice?.finish_reason}`)
    }

    if (!firstChoice.message.content) {
      throw new Error('No response from OpenAI')
    }

    return firstChoice.message.content
  }

  if (model.service === 'grog') {
    const modelToUse = grogModels[model.model]

    const startTimestamp = Date.now()

    const response = await grog.chat.completions.create({
      model: modelToUse,
      max_tokens: maxTokens,
      messages,
      stop,
    })

    const elapsed = Date.now() - startTimestamp

    logUsage(elapsed, modelToUse, response.usage)

    const firstChoice = response.choices[0]

    if (firstChoice?.finish_reason !== 'stop') {
      throw new Error(`Grog did not finish: ${firstChoice?.finish_reason}`)
    }

    if (!firstChoice.message.content) {
      throw new Error('No response from Grog')
    }

    return firstChoice.message.content
  }

  throw new Error('No AI model selected')
}

export async function* smartAssistant({
  prompt,
  selectedText,
  mockResponse,
  maxTokens = 4096,
  onCancel,
  model = defaultModel,
}: {
  prompt: string
  maxTokens?: number
  selectedText?: string
  mockResponse?: string
  model?: AiModels
  onCancel: RefacToolsCtx['onCancel']
}) {
  if (mockResponse) {
    return mockResponse
  }

  for await (const response of getAiResponseStream({
    model,
    messages: [
      {
        role: 'system',
        content: joinStrings(
          `You are a smart assistant. Your task is to answer the user's questions or follow instructions.`,
          selectedText ?
            `\n\nThe user is using a text editor and has selected the following text: "${escapeDoubleQuotes(
              selectedText,
            )}"`
          : '',
          '\n\nRespond using markdown.',
        ),
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    onCancel,
    maxTokens,
  })) {
    yield response
  }
}

export async function* gptTransform({
  prompt,
  examples,
  input,
  returnExplanation,
  mockResponse,
  model = defaultModel,
  maxTokens = 4096,
  onCancel,
}: {
  prompt: string
  examples?: {
    old: string
    new: string
  }[]
  maxTokens?: number
  model?: AiModels
  input: string
  returnExplanation?: boolean
  mockResponse?: string
  onCancel: RefacToolsCtx['onCancel']
}) {
  if (mockResponse) {
    return mockResponse
  }

  for await (const response of getAiResponseStream({
    model,
    messages: [
      {
        role: 'system',
        content: joinStrings(
          `You is a text smart transformer. You will be provided with only inputs. Your task is to convert them according to the instruction: "${escapeDoubleQuotes(
            prompt,
          )}".`,
          returnExplanation ?
            `, and return the output along with an explanation of your changes in markdown.`
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
    onCancel,
    maxTokens,
  })) {
    yield response
  }
}

function escapeDoubleQuotes(str: string) {
  return str.replaceAll('"', '\\"')
}

const tripleBacktick = '```'

type CodeRefactorProps = {
  instructions: string
  language: string
  /** use `// old` and `// new` comments to mark examples */
  examples?:
    | {
        old: string
        refactored: string
      }[]
    | string
  /** use `// old` and `// wrong` comments to mark invalid examples */
  invalidExamples?: string
  oldCode: string
  model?: AiModels
  maxTokens?: number
}

export async function gptCodeRefactor({
  instructions,
  oldCode,
  language,
  examples,
  invalidExamples,
  model = defaultModel,
  maxTokens = 4096,
}: CodeRefactorProps): Promise<string> {
  const responseCode = await getAiResponse({
    model,
    stop: 'NOT_APPLICABLE',
    messages: [
      {
        role: 'system',
        content: generateCodePrompt(language, instructions, examples, invalidExamples),
      },
      {
        role: 'user',
        content: `${tripleBacktick}\n${oldCode}\n${tripleBacktick}`,
      },
    ],
    maxTokens,
  })

  if (responseCode.includes('NOT_APPLICABLE')) {
    throw new Error('The instruction is not applicable to the code')
  }

  if (responseCode.startsWith(tripleBacktick)) {
    const match = responseCode.match(extractCodeRegex)

    if (!match?.[2]) {
      throw new Error(
        `Could not extract code from response, full response:\n${responseCode}`,
      )
    }

    return match[2]
  }

  return responseCode
}

const removeMarkdownMultilineCodeRegex = /^```.*$/gm

export async function* gptCodeRefactorStream({
  instructions,
  oldCode,
  language,
  examples,
  maxTokens = 4096,
  invalidExamples,
  onCancel,
  model = defaultModel,
}: CodeRefactorProps & { onCancel: RefacToolsCtx['onCancel'] }): AsyncGenerator<string> {
  for await (const response of getAiResponseStream({
    model,
    stop: 'NOT_APPLICABLE',
    messages: [
      {
        role: 'system',
        content: generateCodePrompt(language, instructions, examples, invalidExamples),
      },
      {
        role: 'user',
        content: `${tripleBacktick}\n${oldCode}\n${tripleBacktick}`,
      },
    ],
    maxTokens,
    onCancel,
  })) {
    if (response.includes('NOT_APPLICABLE')) {
      throw new Error('The instruction is not applicable to the code')
    }

    yield response.replace(removeMarkdownMultilineCodeRegex, '')
  }
}

export async function* gptAskAboutCode({
  question,
  contextCode,
  selectedCode,
  language,
  maxTokens = 4096,
  onCancel,
  model = defaultModel,
}: {
  question: string
  language: string
  selectedCode?: string
  contextCode: string
  maxTokens?: number
  onCancel: RefacToolsCtx['onCancel']
  model?: AiModels
}): AsyncGenerator<string> {
  for await (const response of getAiResponseStream({
    model,
    messages: [
      {
        role: 'system',
        content: joinStrings(
          `You is a programmer expert for the language ${language}. Your task is to answer the questions or follow instructions about the following code as context:`,
          `\n\n${tripleBacktick}\n${contextCode}\n${tripleBacktick}`,
          selectedCode &&
            `\n\nThe user has selected the following code from above:\n\n${tripleBacktick}\n${selectedCode}\n${tripleBacktick}`,
          `\n\nRespond using markdown. Do your best!`,
        ),
      },
      {
        role: 'user',
        content: dedent(question),
      },
    ],
    onCancel,
    maxTokens,
  })) {
    yield response
  }
}

export async function gptGenericPrompt({
  prompt,
  model = defaultModel,
  maxTokens = 4096,
}: {
  prompt: string
  maxTokens?: number
  model?: AiModels
}): Promise<string> {
  return getAiResponse({
    model,
    messages: [
      {
        role: 'system',
        content: `You are a smart assistant. Follow the user's instructions carefully. Respond using markdown.`,
      },
      {
        role: 'user',
        content: dedent(prompt),
      },
    ],
    maxTokens,
  })
}

function throttledYield(ms: number): {
  shouldYield: () => boolean
} {
  let lastYield = Date.now()

  function shouldYield() {
    const now = Date.now()

    if (now - lastYield > ms) {
      lastYield = now

      return true
    }

    return false
  }

  return {
    shouldYield,
  }
}

function logUsage(
  elapsed: number,
  model: string,
  responseUsage:
    | {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
      }
    | undefined,
) {
  refacTools.log(
    `Ai response took ${formatNum(
      elapsed / 1000,
    )}s using model "${model}".\nTokens used:\n  Prompt: ${responseUsage?.prompt_tokens}\n  Completion: ${responseUsage?.completion_tokens}\n Total: ${responseUsage?.total_tokens}`,
  )
}

function generateCodePrompt(
  language: string,
  instructions: string,
  examples: { old: string; refactored: string }[] | undefined | string,
  invalidExamples: string | undefined,
): string {
  const codePrompt = joinStrings(
    `You is a programming refactor expert. You will be provided with only ${language} code inputs inside markdown, like ${tripleBacktick}input code${tripleBacktick}. Your task is to refactor them according to the instruction: "${escapeDoubleQuotes(
      instructions,
    )}", and return ONLY the resulting code. If the instruction cannot be followed, return just NOT_APPLICABLE.`,
    examples &&
      examples.length > 0 &&
      `\n\nConsider the following references for your task:\n\n${
        typeof examples === 'string' ?
          normalizeExamples(examples, 'Refactored', 'new')
        : examples
            .map(
              (e) =>
                `Before:\n${tripleBacktick}\n${dedent(
                  e.old,
                )}\n${tripleBacktick}\n\nRefactored:\n${tripleBacktick}\n${dedent(
                  e.refactored,
                )}\n${tripleBacktick}`,
            )
            .join('\n\n-----\n\n')
      }`,
    invalidExamples &&
      `\n\nConsider the following invalid examples, as reference for WRONG answers:\n\n${normalizeExamples(
        invalidExamples,
        'Wrong refactor',
        'wrong',
      )}`,
  )

  refacTools.log(`Code prompt:\n${codePrompt}`)

  return codePrompt
}

function formatNum(num: number) {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function normalizeExamples(
  examplesMd: string,
  referenceLabel: string,
  referenceCommentRegex: string,
): string {
  const examplesToUse: { old: string; reference: string }[] = []

  const extractExamplesRegex = new RegExp(
    `~~~[\\s\\S]+?// old.+?\\s([\\s\\S]+?)// ${referenceCommentRegex}.+?\\s([\\s\\S]+?)~~~`,
    'g',
  )

  if (!examplesMd.includes(`// ${referenceCommentRegex}`)) {
    throw new Error(
      `${referenceCommentRegex} not found in examples, received:\n` + examplesMd,
    )
  }

  if (!examplesMd.includes('// old')) {
    throw new Error('Old code not found in examples, received:\n' + examplesMd)
  }

  forEachRegexMatch(
    extractExamplesRegex,
    examplesMd,
    ({ groups: [old = '', newCode = ''] }) => {
      if (!old.trim() || !newCode.trim()) {
        throw new Error('Invalid example')
      }

      examplesToUse.push({
        old: old.trim(),
        reference: newCode.trim(),
      })
    },
  )

  if (examplesToUse.length === 0) {
    throw new Error('Examples is invalid')
  }

  return examplesToUse
    .map(
      ({ old, reference }) =>
        dedent`
Before:
${tripleBacktick}
${old}
${tripleBacktick}

${referenceLabel}:
${tripleBacktick}
${reference}
${tripleBacktick}`,
    )
    .join('\n\n-----\n\n')
}
