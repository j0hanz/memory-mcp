import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PromptMessage } from '@modelcontextprotocol/sdk/types.js';

import { loadInstructions } from '../lib/instructions.js';

const INSTRUCTIONS_CONTENT = loadInstructions();

const GET_HELP_PROMPT = {
  name: 'get-help',
  title: 'Get Help',
  description: 'Return full usage instructions.',
} as const;

function createHelpMessages(instructions: string): PromptMessage[] {
  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: 'Provide the Memory MCP usage guide, including tool routing, constraints, error codes, data model, and workflows.',
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

function createGetHelpPromptResult(): { messages: PromptMessage[] } {
  return { messages: HELP_MESSAGES };
}

export function registerAllPrompts(server: McpServer): void {
  server.registerPrompt(
    GET_HELP_PROMPT.name,
    {
      title: GET_HELP_PROMPT.title,
      description: GET_HELP_PROMPT.description,
    },
    createGetHelpPromptResult
  );
}
