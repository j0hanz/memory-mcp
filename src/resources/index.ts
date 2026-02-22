import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Variables } from '@modelcontextprotocol/sdk/shared/uriTemplate.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { createHashCompletionCallback } from '../completions/index.js';
import type { TypedDb } from '../db/typed.js';
import { loadInstructions } from '../lib/instructions.js';
import { SELECT_MEMORY_BY_HASH_SQL } from '../lib/sql.js';
import { parseMemoryRow } from '../lib/types.js';
import type { MemoryRow } from '../lib/types.js';
import { buildServerConfig } from './server-config.js';
import { buildToolCatalog } from './tool-catalog.js';
import { getToolInfo, getToolNames } from './tool-info.js';
import { buildWorkflowGuide } from './workflows.js';

const HASH_REGEX = /^[a-f0-9]{64}$/;

const INSTRUCTIONS_URI = 'internal://instructions';
const TOOL_CATALOG_URI = 'internal://tool-catalog';
const TOOL_INFO_URI_TEMPLATE = 'internal://tool-info/{toolName}';
const WORKFLOWS_URI = 'internal://workflows';
const SERVER_CONFIG_URI = 'internal://server-config';
const MEMORY_RESOURCE_URI_TEMPLATE = 'memory://memories/{hash}';

interface MarkdownResourceContent {
  uri: string;
  mimeType: 'text/markdown';
  text: string;
}

interface JsonResourceContent {
  uri: string;
  mimeType: 'application/json';
  text: string;
}

function createMarkdownContent(
  uri: string,
  text: string
): MarkdownResourceContent {
  return { uri, mimeType: 'text/markdown', text };
}

function createJsonContent(uri: string, payload: unknown): JsonResourceContent {
  return {
    uri,
    mimeType: 'application/json',
    text: JSON.stringify(payload),
  };
}

function createErrorResourceContents(
  uri: string,
  error: string,
  hash?: string
): { contents: JsonResourceContent[] } {
  return {
    contents: [createJsonContent(uri, { error, ...(hash ? { hash } : {}) })],
  };
}

function getSingleVariable(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readMemoryByHash(db: TypedDb, hash: string): MemoryRow | undefined {
  return db.prepareOnce<MemoryRow>(SELECT_MEMORY_BY_HASH_SQL).get(hash);
}

// --- Pre-computed static content ---

const INSTRUCTIONS_CONTENT = loadInstructions();
const TOOL_CATALOG_CONTENT = buildToolCatalog();
const WORKFLOW_GUIDE_CONTENT = buildWorkflowGuide();
const SERVER_CONFIG_CONTENT = buildServerConfig();

// --- Registration ---

export function registerAllResources(server: McpServer, db: TypedDb): void {
  // internal://instructions
  server.registerResource(
    'instructions',
    INSTRUCTIONS_URI,
    {
      title: 'Memory Instructions',
      description:
        'Complete usage guide: tool inventory, routing decisions, error codes, data model, and workflow patterns. Read this first.',
      mimeType: 'text/markdown',
      annotations: { audience: ['assistant'], priority: 0.9 },
    },
    () => ({
      contents: [createMarkdownContent(INSTRUCTIONS_URI, INSTRUCTIONS_CONTENT)],
    })
  );

  // internal://tool-catalog
  server.registerResource(
    'tool-catalog',
    TOOL_CATALOG_URI,
    {
      title: 'Tool Catalog',
      description:
        'Tool reference table, optional parameter matrix, and cross-tool data flow.',
      mimeType: 'text/markdown',
      annotations: { audience: ['assistant'], priority: 0.7 },
    },
    () => ({
      contents: [createMarkdownContent(TOOL_CATALOG_URI, TOOL_CATALOG_CONTENT)],
    })
  );

  // internal://tool-info/{toolName}
  server.registerResource(
    'tool-info',
    new ResourceTemplate(TOOL_INFO_URI_TEMPLATE, {
      list: undefined,
      complete: {
        toolName: (value: string) =>
          getToolNames().filter((n) => n.startsWith(value)),
      },
    }),
    {
      title: 'Tool Info',
      description:
        'Per-tool detail: parameters, behavior, and output shape. Supports toolName auto-completion.',
      mimeType: 'text/markdown',
      annotations: { audience: ['assistant'], priority: 0.6 },
    },
    (uri: URL, variables: Variables) => {
      const toolName = getSingleVariable(variables['toolName']);

      if (!toolName) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing toolName parameter'
        );
      }

      const info = getToolInfo(toolName);
      if (!info) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Unknown tool: ${toolName}`
        );
      }

      return {
        contents: [createMarkdownContent(uri.href, info)],
      };
    }
  );

  // internal://workflows
  server.registerResource(
    'workflows',
    WORKFLOWS_URI,
    {
      title: 'Workflow Guide',
      description:
        'Recommended multi-step workflow sequences with guardrails and tool reference.',
      mimeType: 'text/markdown',
      annotations: { audience: ['assistant'], priority: 0.7 },
    },
    () => ({
      contents: [createMarkdownContent(WORKFLOWS_URI, WORKFLOW_GUIDE_CONTENT)],
    })
  );

  // internal://server-config
  server.registerResource(
    'server-config',
    SERVER_CONFIG_URI,
    {
      title: 'Server Configuration',
      description:
        'Runtime configuration, environment variables, capabilities, and data limits.',
      mimeType: 'text/markdown',
      annotations: { audience: ['user', 'assistant'], priority: 0.5 },
    },
    () => ({
      contents: [
        createMarkdownContent(SERVER_CONFIG_URI, SERVER_CONFIG_CONTENT),
      ],
    })
  );

  // memory://memories/{hash}
  const hashCompletion = createHashCompletionCallback(db);

  server.registerResource(
    'memory',
    new ResourceTemplate(MEMORY_RESOURCE_URI_TEMPLATE, {
      list: undefined,
      complete: { hash: hashCompletion },
    }),
    {
      title: 'Memory',
      description:
        'Fetch a single memory object by exact SHA-256 hash. Supports hash auto-completion. Returns { error } if the hash does not exist.',
      mimeType: 'application/json',
      annotations: { audience: ['assistant'], priority: 0.7 },
    },
    (uri: URL, variables: Variables) => {
      const rawHash = variables['hash'];
      const hash = getSingleVariable(rawHash);

      if (!hash || !HASH_REGEX.test(hash)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Invalid hash: must be a 64-character hex string'
        );
      }

      const row = readMemoryByHash(db, hash);

      if (!row) {
        return createErrorResourceContents(uri.href, 'Not found', hash);
      }

      return {
        contents: [createJsonContent(uri.href, parseMemoryRow(row))],
      };
    }
  );
}
