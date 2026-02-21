import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PromptMessage } from '@modelcontextprotocol/sdk/types.js';

import { loadInstructions } from '../lib/instructions.js';

const INSTRUCTIONS_CONTENT = loadInstructions();

function createHelpMessages(instructions: string): PromptMessage[] {
  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: 'How do I use the memory tools?',
      },
    },
    {
      role: 'assistant',
      content: {
        type: 'text',
        text: instructions,
      },
    },
  ];
}

const HELP_MESSAGES = createHelpMessages(INSTRUCTIONS_CONTENT);

const GET_HELP_PROMPT_CONFIG = {
  title: 'Get Help',
  description:
    'Return full usage instructions: tool inventory, routing decisions, error codes, data model limits, and workflow patterns.',
} as const;
const GET_HELP_PROMPT_NAME = 'get-help';

export function registerAllPrompts(server: McpServer): void {
  server.registerPrompt(GET_HELP_PROMPT_NAME, GET_HELP_PROMPT_CONFIG, () => ({
    messages: HELP_MESSAGES,
  }));
}
