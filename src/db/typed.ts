import type { DatabaseSync } from 'node:sqlite';

type SQLInputValue = string | number | bigint | null | Uint8Array;

export interface TypedStatement<T> {
  all(...params: unknown[]): T[];
  get(...params: unknown[]): T | undefined;
  run(...params: unknown[]): {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  };
}

export class TypedDb {
  constructor(private db: DatabaseSync) {}

  prepare<T>(sql: string): TypedStatement<T> {
    const stmt = this.db.prepare(sql);
    return {
      all: (...params: unknown[]) =>
        stmt.all(...(params as SQLInputValue[])) as T[],
      get: (...params: unknown[]) =>
        stmt.get(...(params as SQLInputValue[])) as T | undefined,
      run: (...params: unknown[]) => {
        const result = stmt.run(...(params as SQLInputValue[]));
        return {
          changes: result.changes,
          lastInsertRowid: result.lastInsertRowid,
        };
      },
    };
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  close(): void {
    this.db.close();
  }
}

export function createTypedDb(db: DatabaseSync): TypedDb {
  return new TypedDb(db);
}
