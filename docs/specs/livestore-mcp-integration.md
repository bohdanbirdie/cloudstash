# LiveStore MCP Integration Spec

## Overview

Build an MCP (Model Context Protocol) server that exposes LiveStore data and operations to LLMs and AI agents, enabling natural language interaction with the link bucket.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Server Architecture                       │
│                                                                  │
│  ┌──────────────┐     MCP Protocol      ┌──────────────────┐   │
│  │  AI Agent    │ ◄───────────────────► │   MCP Server     │   │
│  │  (Claude,    │    JSON-RPC over      │   (CF Worker)    │   │
│  │   etc.)      │    stdio/HTTP         │                  │   │
│  └──────────────┘                       └────────┬─────────┘   │
│                                                  │              │
│                                    ┌─────────────┴──────────┐  │
│                                    │                        │  │
│                             ┌──────▼──────┐         ┌───────▼──┐│
│                             │  LiveStore  │         │ Workers  ││
│                             │     DO      │         │   AI     ││
│                             └─────────────┘         └──────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## MCP Server Implementation

### Server Setup

```typescript
// src/cf-worker/mcp/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

export function createMCPServer(env: Env, storeId: string) {
  const server = new Server(
    {
      name: 'linkbucket-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    },
  )

  // Register handlers
  registerTools(server, env, storeId)
  registerResources(server, env, storeId)
  registerPrompts(server, env, storeId)

  return server
}
```

## Tools

### List Tools

```typescript
// src/cf-worker/mcp/tools.ts
export function registerTools(server: Server, env: Env, storeId: string) {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'save_link',
        description: 'Save a URL to the link bucket',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The URL to save' },
            category: { type: 'string', description: 'Optional category name' },
          },
          required: ['url'],
        },
      },
      {
        name: 'search_links',
        description: 'Search saved links by title, URL, or summary',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            category: { type: 'string', description: 'Filter by category' },
            limit: { type: 'number', description: 'Max results (default 10)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'list_links',
        description: 'List recent links, optionally filtered by category',
        inputSchema: {
          type: 'object',
          properties: {
            category: { type: 'string', description: 'Filter by category' },
            limit: { type: 'number', description: 'Max results (default 20)' },
          },
        },
      },
      {
        name: 'get_link',
        description: 'Get detailed information about a specific link',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Link ID' },
          },
          required: ['id'],
        },
      },
      {
        name: 'delete_link',
        description: 'Delete a saved link',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Link ID to delete' },
          },
          required: ['id'],
        },
      },
      {
        name: 'set_category',
        description: 'Set or change the category of a link',
        inputSchema: {
          type: 'object',
          properties: {
            linkId: { type: 'string', description: 'Link ID' },
            category: { type: 'string', description: 'Category name (or null to remove)' },
          },
          required: ['linkId'],
        },
      },
      {
        name: 'list_categories',
        description: 'List all available categories',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'summarize_link',
        description: 'Generate or regenerate AI summary for a link',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Link ID' },
          },
          required: ['id'],
        },
      },
    ],
  }))
}
```

### Tool Handlers

```typescript
// src/cf-worker/mcp/tool-handlers.ts
export function registerToolHandlers(server: Server, env: Env, storeId: string) {
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    switch (name) {
      case 'save_link':
        return await handleSaveLink(args, env, storeId)
      case 'search_links':
        return await handleSearchLinks(args, env, storeId)
      case 'list_links':
        return await handleListLinks(args, env, storeId)
      case 'get_link':
        return await handleGetLink(args, env, storeId)
      case 'delete_link':
        return await handleDeleteLink(args, env, storeId)
      case 'set_category':
        return await handleSetCategory(args, env, storeId)
      case 'list_categories':
        return await handleListCategories(env, storeId)
      case 'summarize_link':
        return await handleSummarizeLink(args, env, storeId)
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  })
}

async function handleSaveLink(args: { url: string; category?: string }, env: Env, storeId: string) {
  const doId = env.LINK_PROCESSOR_DO.idFromName(storeId)
  const stub = env.LINK_PROCESSOR_DO.get(doId)

  const url = new URL('https://do/')
  url.searchParams.set('storeId', storeId)
  url.searchParams.set('ingest', args.url)

  const response = await stub.fetch(url.toString())
  const result = await response.json()

  if (!response.ok) {
    return {
      content: [{ type: 'text', text: `Failed to save link: ${result.error}` }],
      isError: true,
    }
  }

  return {
    content: [
      {
        type: 'text',
        text: `Link saved successfully! ID: ${result.linkId}. The link will be processed shortly.`,
      },
    ],
  }
}

async function handleSearchLinks(
  args: { query: string; category?: string; limit?: number },
  env: Env,
  storeId: string,
) {
  const store = await getStore(env, storeId)
  const limit = args.limit || 10

  // Full-text search on title, url, summary
  const links = await store.query(querySQL`
    SELECT * FROM links
    WHERE deletedAt IS NULL
    AND (
      title LIKE ${'%' + args.query + '%'}
      OR url LIKE ${'%' + args.query + '%'}
      OR summary LIKE ${'%' + args.query + '%'}
    )
    ${args.category ? querySQL`AND categoryId = (SELECT id FROM categories WHERE name = ${args.category})` : querySQL``}
    ORDER BY createdAt DESC
    LIMIT ${limit}
  `)

  if (links.length === 0) {
    return {
      content: [{ type: 'text', text: 'No links found matching your search.' }],
    }
  }

  const formatted = links
    .map(
      (l) =>
        `- **${l.title || l.url}**\n  URL: ${l.url}\n  ${l.summary ? `Summary: ${l.summary}` : ''}`,
    )
    .join('\n\n')

  return {
    content: [{ type: 'text', text: `Found ${links.length} links:\n\n${formatted}` }],
  }
}

async function handleListLinks(
  args: { category?: string; limit?: number },
  env: Env,
  storeId: string,
) {
  const store = await getStore(env, storeId)
  const limit = args.limit || 20

  const links = await store.query(querySQL`
    SELECT l.*, c.name as categoryName
    FROM links l
    LEFT JOIN categories c ON l.categoryId = c.id
    WHERE l.deletedAt IS NULL
    ${args.category ? querySQL`AND c.name = ${args.category}` : querySQL``}
    ORDER BY l.createdAt DESC
    LIMIT ${limit}
  `)

  if (links.length === 0) {
    return {
      content: [{ type: 'text', text: 'No links saved yet.' }],
    }
  }

  const formatted = links
    .map(
      (l) => `- **${l.title || l.url}**${l.categoryName ? ` [${l.categoryName}]` : ''}\n  ${l.url}`,
    )
    .join('\n')

  return {
    content: [{ type: 'text', text: `Recent links:\n\n${formatted}` }],
  }
}
```

## Resources

```typescript
// src/cf-worker/mcp/resources.ts
export function registerResources(server: Server, env: Env, storeId: string) {
  // List available resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: 'linkbucket://links',
        name: 'All Links',
        description: 'All saved links in the bucket',
        mimeType: 'application/json',
      },
      {
        uri: 'linkbucket://categories',
        name: 'Categories',
        description: 'All link categories',
        mimeType: 'application/json',
      },
      {
        uri: 'linkbucket://stats',
        name: 'Statistics',
        description: 'Link bucket statistics',
        mimeType: 'application/json',
      },
    ],
  }))

  // Read resource content
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params
    const store = await getStore(env, storeId)

    switch (uri) {
      case 'linkbucket://links': {
        const links = await store.query(
          querySQL`SELECT * FROM links WHERE deletedAt IS NULL ORDER BY createdAt DESC`,
        )
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(links, null, 2),
            },
          ],
        }
      }

      case 'linkbucket://categories': {
        const categories = await store.query(
          querySQL`SELECT * FROM categories WHERE deletedAt IS NULL ORDER BY sortOrder`,
        )
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(categories, null, 2),
            },
          ],
        }
      }

      case 'linkbucket://stats': {
        const stats = await store.query(querySQL`
          SELECT
            (SELECT COUNT(*) FROM links WHERE deletedAt IS NULL) as totalLinks,
            (SELECT COUNT(*) FROM links WHERE deletedAt IS NULL AND processedAt IS NOT NULL) as processedLinks,
            (SELECT COUNT(*) FROM categories WHERE deletedAt IS NULL) as totalCategories,
            (SELECT COUNT(DISTINCT domain) FROM links WHERE deletedAt IS NULL) as uniqueDomains
        `)
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(stats[0], null, 2),
            },
          ],
        }
      }

      default:
        throw new Error(`Unknown resource: ${uri}`)
    }
  })
}
```

## Prompts

```typescript
// src/cf-worker/mcp/prompts.ts
export function registerPrompts(server: Server, env: Env, storeId: string) {
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: 'organize_links',
        description: 'Suggest categories for uncategorized links',
        arguments: [],
      },
      {
        name: 'weekly_digest',
        description: 'Generate a weekly digest of saved links',
        arguments: [
          {
            name: 'days',
            description: 'Number of days to include (default 7)',
            required: false,
          },
        ],
      },
      {
        name: 'find_related',
        description: 'Find links related to a topic',
        arguments: [
          {
            name: 'topic',
            description: 'Topic to find related links for',
            required: true,
          },
        ],
      },
    ],
  }))

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const store = await getStore(env, storeId)

    switch (name) {
      case 'organize_links': {
        const uncategorized = await store.query(
          querySQL`SELECT id, url, title, summary FROM links WHERE categoryId IS NULL AND deletedAt IS NULL`,
        )
        const categories = await store.query(
          querySQL`SELECT name, color FROM categories WHERE deletedAt IS NULL`,
        )

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `I have ${uncategorized.length} uncategorized links. Please suggest which category each should belong to.

Available categories: ${categories.map((c) => c.name).join(', ')}

Uncategorized links:
${uncategorized.map((l) => `- ${l.title || l.url}: ${l.summary || 'No summary'}`).join('\n')}

For each link, suggest the best category and explain why.`,
              },
            },
          ],
        }
      }

      case 'weekly_digest': {
        const days = args?.days ? parseInt(args.days) : 7
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

        const links = await store.query(querySQL`
          SELECT l.*, c.name as categoryName
          FROM links l
          LEFT JOIN categories c ON l.categoryId = c.id
          WHERE l.deletedAt IS NULL AND l.createdAt > ${since}
          ORDER BY l.createdAt DESC
        `)

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Generate a weekly digest of my saved links from the past ${days} days.

Links saved:
${links.map((l) => `- **${l.title || l.url}**${l.categoryName ? ` [${l.categoryName}]` : ''}\n  ${l.summary || ''}`).join('\n\n')}

Please organize them by theme, highlight the most interesting ones, and provide a brief summary of my reading/saving habits this week.`,
              },
            },
          ],
        }
      }

      case 'find_related': {
        const topic = args?.topic || ''
        const links = await store.query(
          querySQL`SELECT title, url, summary FROM links WHERE deletedAt IS NULL`,
        )

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Find links in my collection related to: "${topic}"

My saved links:
${links.map((l) => `- ${l.title || l.url}: ${l.summary || 'No summary'}`).join('\n')}

Please identify which links are most relevant to the topic and explain the connections.`,
              },
            },
          ],
        }
      }

      default:
        throw new Error(`Unknown prompt: ${name}`)
    }
  })
}
```

## HTTP Transport for Workers

```typescript
// src/cf-worker/mcp/http-transport.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js'

export async function handleMCPRequest(request: Request, server: Server): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const body = await request.json()

    // Handle JSON-RPC request
    const response = await server.handleRequest(body)

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32603, message: String(error) },
        id: null,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
```

## Worker Route

```typescript
// src/cf-worker/index.ts
import { createMCPServer } from './mcp/server'
import { handleMCPRequest } from './mcp/http-transport'

// Add route handler
if (url.pathname === '/api/mcp') {
  // Authenticate request (use API key or session)
  const apiKey = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!apiKey) {
    return new Response('Unauthorized', { status: 401 })
  }

  const key = await verifyApiKey(auth, apiKey)
  const storeId = key.metadata?.orgId

  const server = createMCPServer(env, storeId)
  return handleMCPRequest(request, server)
}
```

## Use Cases

### 1. Claude Desktop Integration

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "linkbucket": {
      "command": "curl",
      "args": [
        "-X",
        "POST",
        "-H",
        "Authorization: Bearer YOUR_API_KEY",
        "https://link-bucket.workers.dev/api/mcp"
      ],
      "env": {}
    }
  }
}
```

### 2. AI Agent Workflows

```typescript
// Example: Auto-categorize new links
const agent = new AIAgent({
  tools: ['linkbucket'],
})

await agent.run(`
  Check my link bucket for any uncategorized links.
  For each uncategorized link, analyze its content and assign an appropriate category.
  If no existing category fits, suggest a new category name.
`)
```

### 3. Weekly Summary Bot

```typescript
// Scheduled worker
export default {
  async scheduled(event: ScheduledEvent, env: Env) {
    // For each user with weekly digest enabled
    const users = await getDigestEnabledUsers(env)

    for (const user of users) {
      const server = createMCPServer(env, user.orgId)
      const prompt = await server.getPrompt('weekly_digest', { days: '7' })

      // Send to AI for summary
      const summary = await generateSummary(prompt, env)

      // Email or notify user
      await sendDigestEmail(user.email, summary)
    }
  },
}
```

## Implementation Checklist

- [ ] Set up MCP SDK dependencies
- [ ] Create MCP server factory
- [ ] Implement all tools (save, search, list, get, delete, categorize)
- [ ] Implement resources (links, categories, stats)
- [ ] Implement prompts (organize, digest, find_related)
- [ ] Create HTTP transport for Cloudflare Workers
- [ ] Add authentication to MCP endpoint
- [ ] Create API key management for MCP access
- [ ] Test with Claude Desktop
- [ ] Document MCP endpoint usage
- [ ] Add rate limiting for MCP requests
