export interface Memory {
  hash: string;
  content: string;
  tags: string[];
  memory_type: string;
  importance: number;
  created_at: string;
  updated_at: string;
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

export function parseMemoryRow(row: MemoryRow): Memory {
  return {
    ...row,
    tags: JSON.parse(row.tags) as string[],
  };
}
