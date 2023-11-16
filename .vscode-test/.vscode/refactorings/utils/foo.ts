import OpenAI from 'openai'

export async function mockGpt4({ prompt, code }: { prompt: string; code: string }) {
  return 'for (const item of items) {\n  console.log(item)\n}'
}

const openai = new OpenAI({
  apiKey: 'My API Key',
})
