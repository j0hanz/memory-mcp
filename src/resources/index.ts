import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Variables } from '@modelcontextprotocol/sdk/shared/uriTemplate.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { createHashCompletionCallback } from '../completions/index.js';
import type { TypedDb } from '../db/typed.js';
import { loadInstructions } from '../lib/instructions.js';
import { SELECT_MEMORY_BY_HASH_SQL } from '../lib/sql.js';
import { parseMemoryRow } from '../lib/types.js';
import type { HashRow, MemoryRow } from '../lib/types.js';
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
const MEMORY_RESOURCE_LIST_LIMIT = 100;
const RECENT_MEMORY_HASHES_SQL = `SELECT hash FROM memories ORDER BY updated_at DESC LIMIT ${MEMORY_RESOURCE_LIST_LIMIT}`;
const RESOURCE_LAST_MODIFIED = new Date().toISOString();
const TOOL_NAMES = getToolNames();

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

type ResourceAudience = 'assistant' | 'user';

interface StaticMarkdownResourceConfig {
  name: string;
  uri: string;
  title: string;
  description: string;
  audience: readonly ResourceAudience[];
  priority: number;
  content: string;
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

function createResourceAnnotations(
  audience: readonly ResourceAudience[],
  priority: number
): {
  audience: ResourceAudience[];
  priority: number;
  lastModified: string;
} {
  return {
    audience: [...audience],
    priority,
    lastModified: RESOURCE_LAST_MODIFIED,
  };
}

function getSingleVariable(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function requireSingleVariable(
  variables: Variables,
  key: string,
  errorMessage: string
): string {
  const value = getSingleVariable(variables[key]);
  if (!value) {
    throw new McpError(ErrorCode.InvalidParams, errorMessage);
  }
  return value;
}

function registerStaticMarkdownResource(
  server: McpServer,
  config: StaticMarkdownResourceConfig
): void {
  server.registerResource(
    config.name,
    config.uri,
    {
      title: config.title,
      description: config.description,
      mimeType: 'text/markdown',
      annotations: createResourceAnnotations(config.audience, config.priority),
    },
    () => ({
      contents: [createMarkdownContent(config.uri, config.content)],
    })
  );
}

function readMemoryByHash(db: TypedDb, hash: string): MemoryRow | undefined {
  return db.prepareOnce<MemoryRow>(SELECT_MEMORY_BY_HASH_SQL).get(hash);
}

function listToolInfoResources(): {
  resources: {
    uri: string;
    name: string;
    title: string;
    mimeType: 'text/markdown';
  }[];
} {
  return {
    resources: TOOL_NAMES.map((toolName) => ({
      uri: `internal://tool-info/${toolName}`,
      name: 'tool-info',
      title: `Tool Info: ${toolName}`,
      mimeType: 'text/markdown',
    })),
  };
}

function listMemoryResources(db: TypedDb): {
  resources: {
    uri: string;
    name: string;
    title: string;
    mimeType: 'application/json';
  }[];
} {
  const hashes = db.prepareOnce<HashRow>(RECENT_MEMORY_HASHES_SQL).all();
  return {
    resources: hashes.map((row) => ({
      uri: `memory://memories/${row.hash}`,
      name: 'memory',
      title: `Memory: ${row.hash.slice(0, 12)}...`,
      mimeType: 'application/json',
    })),
  };
}

// --- Pre-computed static content ---

const INSTRUCTIONS_CONTENT = loadInstructions();
const TOOL_CATALOG_CONTENT = buildToolCatalog();
const WORKFLOW_GUIDE_CONTENT = buildWorkflowGuide();
const SERVER_CONFIG_CONTENT = buildServerConfig();

// --- Registration ---

export function registerAllResources(server: McpServer, db: TypedDb): void {
  // internal://instructions
  registerStaticMarkdownResource(server, {
    name: 'instructions',
    uri: INSTRUCTIONS_URI,
    title: 'Memory Instructions',
    description:
      'Complete usage guide: tool inventory, routing decisions, error codes, data model, and workflow patterns. Read this first.',
    audience: ['assistant'],
    priority: 0.9,
    content: INSTRUCTIONS_CONTENT,
  });

  // internal://tool-catalog
  registerStaticMarkdownResource(server, {
    name: 'tool-catalog',
    uri: TOOL_CATALOG_URI,
    title: 'Tool Catalog',
    description:
      'Tool reference table, optional parameter matrix, and cross-tool data flow.',
    audience: ['assistant'],
    priority: 0.7,
    content: TOOL_CATALOG_CONTENT,
  });

  // internal://tool-info/{toolName}
  server.registerResource(
    'tool-info',
    new ResourceTemplate(TOOL_INFO_URI_TEMPLATE, {
      list: () => listToolInfoResources(),
      complete: {
        toolName: (value: string) =>
          TOOL_NAMES.filter((n) => n.startsWith(value)),
      },
    }),
    {
      title: 'Tool Info',
      description:
        'Per-tool detail: parameters, behavior, and output shape. Supports toolName auto-completion.',
      mimeType: 'text/markdown',
      annotations: createResourceAnnotations(['assistant'], 0.6),
    },
    (uri: URL, variables: Variables) => {
      const toolName = requireSingleVariable(
        variables,
        'toolName',
        'Missing toolName parameter'
      );

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
  registerStaticMarkdownResource(server, {
    name: 'workflows',
    uri: WORKFLOWS_URI,
    title: 'Workflow Guide',
    description:
      'Recommended multi-step workflow sequences with guardrails and tool reference.',
    audience: ['assistant'],
    priority: 0.7,
    content: WORKFLOW_GUIDE_CONTENT,
  });

  // internal://server-config
  registerStaticMarkdownResource(server, {
    name: 'server-config',
    uri: SERVER_CONFIG_URI,
    title: 'Server Configuration',
    description:
      'Runtime configuration, environment variables, capabilities, and data limits.',
    audience: ['user', 'assistant'],
    priority: 0.5,
    content: SERVER_CONFIG_CONTENT,
  });

  // memory://memories/{hash}
  const hashCompletion = createHashCompletionCallback(db);

  server.registerResource(
    'memory',
    new ResourceTemplate(MEMORY_RESOURCE_URI_TEMPLATE, {
      list: () => listMemoryResources(db),
      complete: { hash: hashCompletion },
    }),
    {
      title: 'Memory',
      description:
        'Fetch a single memory object by exact SHA-256 hash. Supports hash auto-completion. Returns { error } if the hash does not exist.',
      mimeType: 'application/json',
      annotations: createResourceAnnotations(['assistant'], 0.7),
    },
    (uri: URL, variables: Variables) => {
      const hash = getSingleVariable(variables['hash']);

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
