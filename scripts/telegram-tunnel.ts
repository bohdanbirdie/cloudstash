import { spawn } from 'bun'
import { readFileSync } from 'fs'

// Read .dev.vars
const devVars = readFileSync('.dev.vars', 'utf-8')
const vars: Record<string, string> = {}
for (const line of devVars.split('\n')) {
  if (line && !line.startsWith('#')) {
    const [key, ...rest] = line.split('=')
    vars[key.trim()] = rest.join('=').trim()
  }
}

const token = vars.TELEGRAM_BOT_TOKEN
const secret = vars.TELEGRAM_WEBHOOK_SECRET

if (!token || !secret) {
  console.error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_WEBHOOK_SECRET in .dev.vars')
  process.exit(1)
}

const proc = spawn(['bunx', 'cloudflared', 'tunnel', '--url', 'http://localhost:3000'], {
  stdout: 'pipe',
  stderr: 'pipe',
})

let registered = false

async function registerWebhook(tunnelUrl: string) {
  if (registered) return
  registered = true

  console.log(`\n==> Tunnel: ${tunnelUrl}`)
  console.log('==> Waiting 5s for DNS propagation...')
  await Bun.sleep(5000)

  console.log('==> Registering webhook...')
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: `${tunnelUrl}/api/telegram`, secret_token: secret }),
  })

  const result = await response.json()
  console.log('==> Result:', JSON.stringify(result))
  console.log('')
}

async function processStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const text = decoder.decode(value)
    process.stdout.write(text)

    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/)
    if (match) {
      registerWebhook(match[0])
    }
  }
}

processStream(proc.stderr as ReadableStream<Uint8Array>)
processStream(proc.stdout as ReadableStream<Uint8Array>)

await proc.exited
