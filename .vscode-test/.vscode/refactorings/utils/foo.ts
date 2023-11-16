import 'openai/shims/node'
import OpenAI from 'openai'

export async function mockGpt4({ prompt, code }: { prompt: string; code: string }) {
  const openai = new OpenAI({
    apiKey: 'dslflkdslflddjfljsdlkf',
  })

  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content:
          'You will be provided with statements, and your task is to convert them to standard English.',
      },
      {
        role: 'user',
        content: 'She no went to the market.',
      },
    ],
    temperature: 0,
    max_tokens: 256,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
  })

  return response.choices[0].message ?? ''
}
