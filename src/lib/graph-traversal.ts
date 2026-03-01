import process from 'node:process';

import type { TypedDb, TypedStatement } from '../db/typed.js';
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

interface TraversalState {
  visited: Set<string>;
  frontier: string[];
  edges: RelationshipEdge[];
  seenEdges: Set<string>;
  depthReached: number;
  aborted: boolean;
}

interface RemainingBudget {
  edges: number;
  nodes: number;
}

function initializeTraversalState(seeds: readonly MemoryRow[]): TraversalState {
  const visited = new Set<string>();
  const frontier: string[] = [];
  for (const seed of seeds) {
    visited.add(seed.hash);
    frontier.push(seed.hash);
  }

  return {
    visited,
    frontier,
    edges: [],
    seenEdges: new Set<string>(),
    depthReached: 0,
    aborted: false,
  };
}

function capFrontier(state: TraversalState): void {
  if (state.frontier.length <= MAX_FRONTIER_SIZE) {
    return;
  }

  state.frontier.length = MAX_FRONTIER_SIZE;
  state.aborted = true;
}

function getRemainingBudget(state: TraversalState): RemainingBudget {
  return {
    edges: MAX_EDGE_ROWS - state.edges.length,
    nodes: MAX_VISITED_NODES - state.visited.size,
  };
}

function hasExhaustedBudget(budget: RemainingBudget): boolean {
  return budget.edges <= 0 || budget.nodes <= 0;
}

function loadEdgeRows(
  edgeStmt: TypedStatement<EdgeRow>,
  frontier: readonly string[],
  edgeLimit: number
): EdgeRow[] {
  const frontierJson = JSON.stringify(frontier);
  return edgeStmt.all(frontierJson, frontierJson, edgeLimit + 1);
}

function toRowsToProcessCount(
  edgeRowsLength: number,
  remainingEdgeBudget: number
): number {
  return edgeRowsLength > remainingEdgeBudget
    ? remainingEdgeBudget
    : edgeRowsLength;
}

function toEdgeKey(edge: EdgeRow): string {
  return `${edge.from_hash}|${edge.to_hash}|${edge.relation_type}`;
}

function appendEdgeIfNew(state: TraversalState, edge: EdgeRow): void {
  const edgeKey = toEdgeKey(edge);
  if (state.seenEdges.has(edgeKey)) {
    return;
  }

  state.seenEdges.add(edgeKey);
  state.edges.push({
    from_hash: edge.from_hash,
    to_hash: edge.to_hash,
    relation_type: edge.relation_type,
  });
}

function createVisitedQueue(
  state: TraversalState,
  nextHashes: string[]
): (hash: string) => void {
  return (hash: string): void => {
    if (state.visited.has(hash)) {
      return;
    }
    if (state.visited.size >= MAX_VISITED_NODES) {
      state.aborted = true;
      return;
    }
    state.visited.add(hash);
    if (nextHashes.length < MAX_FRONTIER_SIZE) {
      nextHashes.push(hash);
      return;
    }
    state.aborted = true;
  };
}

function shouldStopEdgeProcessing(state: TraversalState): boolean {
  return (
    state.aborted &&
    (state.edges.length >= MAX_EDGE_ROWS ||
      state.visited.size >= MAX_VISITED_NODES)
  );
}

function processEdgeRows(
  state: TraversalState,
  edgeRows: readonly EdgeRow[],
  rowsToProcess: number
): void {
  const nextHashes: string[] = [];
  const queueVisitedHash = createVisitedQueue(state, nextHashes);

  for (let i = 0; i < rowsToProcess; i += 1) {
    const edge = edgeRows[i];
    if (!edge) {
      break;
    }

    appendEdgeIfNew(state, edge);
    queueVisitedHash(edge.from_hash);
    queueVisitedHash(edge.to_hash);

    if (shouldStopEdgeProcessing(state)) {
      break;
    }
  }

  state.frontier.length = 0;
  state.frontier.push(...nextHashes);
}

export async function traverseGraph(
  db: TypedDb,
  seeds: MemoryRow[],
  depth: number,
  signal?: AbortSignal,
  onHop?: ProgressNotifier
): Promise<TraverseGraphResult> {
  const state = initializeTraversalState(seeds);
  const edgeStmt = db.prepareOnce<EdgeRow>(EDGE_QUERY_SQL);

  for (let hop = 0; hop < depth && state.frontier.length > 0; hop += 1) {
    await yieldToEventLoop();
    throwIfAborted(signal);

    state.depthReached = hop + 1;
    onHop?.(hop, depth);

    capFrontier(state);

    const budget = getRemainingBudget(state);
    if (hasExhaustedBudget(budget)) {
      state.aborted = true;
      break;
    }

    const edgeRows = loadEdgeRows(edgeStmt, state.frontier, budget.edges);
    const rowsToProcess = toRowsToProcessCount(edgeRows.length, budget.edges);
    if (edgeRows.length > budget.edges) {
      state.aborted = true;
    }

    processEdgeRows(state, edgeRows, rowsToProcess);
  }

  return {
    edges: state.edges,
    visited: state.visited,
    depthReached: state.depthReached,
    aborted: state.aborted,
  };
}
