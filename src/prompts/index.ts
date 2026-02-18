import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PromptMessage } from '@modelcontextprotocol/sdk/types.js';

const INSTRUCTIONS_CONTENT = `# Memory Instructions

> Available as resource \`internal://instructions\`. Load when unsure about tool usage.

## CORE CAPABILITY

- Domain: SQLite-backed memory store with FTS5 search and knowledge graph for AI assistants.
- Tools: \`search_memories\` \`get_memory\` \`recall\` \`get_relationships\` \`memory_stats\` (READ); \`store_memory\` \`store_memories\` \`update_memory\` \`delete_memory\` \`delete_memories\` \`create_relationship\` \`delete_relationship\` (WRITE).

## WORKFLOWS

1. **Recall**: \`search_memories\` → \`recall\` → \`get_memory\`
2. **Store**: \`store_memory\` or \`store_memories\` (batch ≤50)
3. **Graph**: \`create_relationship\` → \`get_relationships\`

## RESOURCES

- \`internal://instructions\`: This document.
- \`memory://memories/{hash}\`: Single memory by SHA-256 hash.
`;

const HELP_MESSAGES: PromptMessage[] = [
  {
    role: 'user',
    content: {
      type: 'text',
      text: 'Show me the memory usage instructions.',
    },
  },
  {
    role: 'assistant',
    content: {
      type: 'text',
      text: INSTRUCTIONS_CONTENT,
    },
  },
];

const GET_HELP_PROMPT_CONFIG = {
  title: 'Get Help',
  description:
    'Return the full usage instructions for all memory tools and workflows.',
} as const;

export function registerAllPrompts(server: McpServer): void {
  server.registerPrompt('get-help', GET_HELP_PROMPT_CONFIG, () => ({
    messages: HELP_MESSAGES,
  }));
}
