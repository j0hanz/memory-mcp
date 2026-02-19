export interface Memory {
  hash: string;
  content: string;
  tags: string[];
  memory_type: string;
  importance: number;
  created_at: string;
  updated_at: string;
  relevance?: number;
}

export interface Relationship {
  from_hash: string;
  to_hash: string;
  relation_type: string;
  created_at: string;
}

export interface RelationshipWithMemory extends Relationship {
  linked_hash: string;
  linked_content: string;
  linked_tags: string[];
}

export type RelationshipEdge = Pick<
  Relationship,
  'from_hash' | 'to_hash' | 'relation_type'
>;

export interface BatchItemResult {
  hash: string;
  ok: boolean;
  created?: boolean;
  deleted?: boolean;
  error?: string;
}

export interface MemoryRow {
  hash: string;
  content: string;
  tags: string;
  memory_type: string;
  importance: number;
  created_at: string;
  updated_at: string;
  rank?: number;
}

export interface RelationshipRow {
  from_hash: string;
  to_hash: string;
  relation_type: string;
  created_at: string;
  linked_hash?: string;
  linked_content?: string;
  linked_tags?: string;
}

export interface CountRow {
  count: number;
}

export interface TotalRow {
  total: number;
}

export interface EdgeRow {
  from_hash: string;
  to_hash: string;
  relation_type: string;
}

export interface OldestRow {
  oldest: string | null;
}

export interface NewestRow {
  newest: string | null;
}

export interface TypeRow {
  memory_type: string;
  count: number;
}

export interface HashRow {
  hash: string;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === 'string')
  );
}

export function parseTags(tagsJson: string): string[] {
  try {
    const parsed: unknown = JSON.parse(tagsJson);
    return isStringArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseMemoryRow(row: MemoryRow): Memory {
  const relevance = row.rank != null ? -row.rank : undefined;
  return {
    hash: row.hash,
    content: row.content,
    tags: parseTags(row.tags),
    memory_type: row.memory_type,
    importance: row.importance,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...(relevance != null ? { relevance } : {}),
  };
}
