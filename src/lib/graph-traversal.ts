import process from 'node:process';

import type { TypedDb } from '../db/typed.js';
import { throwIfAborted } from './errors.js';
import type { EdgeRow, MemoryRow, RelationshipEdge } from './types.js';

export type ProgressNotifier = (hop: number, total: number) => void;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function parseEnvInt(
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  const raw = process.env[name];
  if (raw == null) return fallback;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

const MAX_FRONTIER_SIZE = parseEnvInt(
  'RECALL_MAX_FRONTIER_SIZE',
  1000,
  100,
  50000
);
export const MAX_EDGE_ROWS = parseEnvInt(
  'RECALL_MAX_EDGE_ROWS',
  5000,
  100,
  50000
);
export const MAX_VISITED_NODES = parseEnvInt(
  'RECALL_MAX_VISITED_NODES',
  5000,
  100,
  50000
);

const EDGE_QUERY_SQL = `SELECT from_hash, to_hash, relation_type FROM relationships
         WHERE from_hash IN (SELECT value FROM json_each(?))
            OR to_hash   IN (SELECT value FROM json_each(?))
         LIMIT ?`;

export interface TraverseGraphResult {
  edges: RelationshipEdge[];
  visited: Set<string>;
  depthReached: number;
  aborted: boolean;
}

export async function traverseGraph(
  db: TypedDb,
  seeds: MemoryRow[],
  depth: number,
  signal?: AbortSignal,
  onHop?: ProgressNotifier
): Promise<TraverseGraphResult> {
  const visited = new Set<string>();
  const frontier: string[] = [];
  for (const seed of seeds) {
    visited.add(seed.hash);
    frontier.push(seed.hash);
  }

  const edges: RelationshipEdge[] = [];
  const seenEdges = new Set<string>();
  let depthReached = 0;
  let aborted = false;
  const edgeStmt = db.prepareOnce<EdgeRow>(EDGE_QUERY_SQL);

  for (let hop = 0; hop < depth && frontier.length > 0; hop += 1) {
    await yieldToEventLoop();
    throwIfAborted(signal);

    depthReached = hop + 1;
    onHop?.(hop, depth);

    if (frontier.length > MAX_FRONTIER_SIZE) {
      frontier.length = MAX_FRONTIER_SIZE;
      aborted = true;
    }

    const remainingEdgeBudget = MAX_EDGE_ROWS - edges.length;
    const remainingNodeBudget = MAX_VISITED_NODES - visited.size;
    if (remainingEdgeBudget <= 0 || remainingNodeBudget <= 0) {
      aborted = true;
      break;
    }

    const frontierJson = JSON.stringify(frontier);
    const edgeRows = edgeStmt.all(
      frontierJson,
      frontierJson,
      remainingEdgeBudget + 1
    );
    const rowsToProcess =
      edgeRows.length > remainingEdgeBudget
        ? remainingEdgeBudget
        : edgeRows.length;
    if (edgeRows.length > remainingEdgeBudget) {
      aborted = true;
    }

    const nextHashes: string[] = [];
    const queueVisitedHash = (hash: string): void => {
      if (visited.has(hash)) {
        return;
      }
      if (visited.size >= MAX_VISITED_NODES) {
        aborted = true;
        return;
      }
      visited.add(hash);
      if (nextHashes.length < MAX_FRONTIER_SIZE) {
        nextHashes.push(hash);
        return;
      }
      aborted = true;
    };

    for (let i = 0; i < rowsToProcess; i += 1) {
      const edge = edgeRows[i];
      if (edge === undefined) {
        break;
      }
      const edgeKey = `${edge.from_hash}|${edge.to_hash}|${edge.relation_type}`;
      if (!seenEdges.has(edgeKey)) {
        seenEdges.add(edgeKey);
        edges.push({
          from_hash: edge.from_hash,
          to_hash: edge.to_hash,
          relation_type: edge.relation_type,
        });
      }

      queueVisitedHash(edge.from_hash);
      queueVisitedHash(edge.to_hash);

      if (
        aborted &&
        (edges.length >= MAX_EDGE_ROWS || visited.size >= MAX_VISITED_NODES)
      ) {
        break;
      }
    }
    frontier.length = 0;
    frontier.push(...nextHashes);
  }

  return { edges, visited, depthReached, aborted };
}
