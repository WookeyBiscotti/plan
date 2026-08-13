import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

async function proxyTfs(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const target = req.headers['x-tfs-target']
  if (typeof target !== 'string' || !isHttpUrl(target)) {
    res.statusCode = 400
    res.end('Missing or invalid X-Tfs-Target')
    return
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (typeof req.headers.authorization === 'string') {
    headers.Authorization = req.headers.authorization
  }

  const body = req.method && req.method !== 'GET' && req.method !== 'HEAD' ? await readBody(req) : undefined
  const response = await fetch(target, {
    method: req.method,
    headers,
    body: body && body.length > 0 ? body : undefined,
  })

  res.statusCode = response.status
  const contentType = response.headers.get('content-type')
  if (contentType) res.setHeader('Content-Type', contentType)
  res.end(Buffer.from(await response.arrayBuffer()))
}

function tfsDevProxy(): Plugin {
  return {
    name: 'tfs-dev-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/__tfs-proxy') {
          next()
          return
        }
        proxyTfs(req, res).catch((error: unknown) => {
          res.statusCode = 502
          res.end(error instanceof Error ? error.message : String(error))
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tfsDevProxy()],
  base: process.env.VITE_BASE_PATH ?? '/',
  server: { port: 5173, strictPort: true },
})
