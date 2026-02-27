import type {
  DatabaseSync,
  SQLInputValue,
  StatementResultingChanges,
} from 'node:sqlite';

type SqlParams = readonly SQLInputValue[];

export interface TypedStatement<T> {
  all(...params: SqlParams): T[];
  get(...params: SqlParams): T | undefined;
  run(...params: SqlParams): StatementResultingChanges;
}

export class TypedDb {
  private readonly cache = new Map<string, TypedStatement<unknown>>();

  constructor(private readonly db: DatabaseSync) {}

  private makeStatement<T>(sql: string): TypedStatement<T> {
    const stmt = this.db.prepare(sql);
    return {
      all: (...params: SqlParams) =>
        stmt.all(...(params as SQLInputValue[])) as T[],
      get: (...params: SqlParams) =>
        stmt.get(...(params as SQLInputValue[])) as T | undefined,
      run: (...params: SqlParams) => stmt.run(...(params as SQLInputValue[])),
    };
  }

  prepare<T>(sql: string): TypedStatement<T> {
    return this.makeStatement<T>(sql);
  }

  prepareOnce<T>(sql: string): TypedStatement<T> {
    const cached = this.cache.get(sql);
    if (cached !== undefined) {
      return cached as TypedStatement<T>;
    }
    const stmt = this.makeStatement<T>(sql);
    this.cache.set(sql, stmt);
    return stmt;
  }

  transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  close(): void {
    this.cache.clear();
    this.db.close();
  }
}

export function createTypedDb(db: DatabaseSync): TypedDb {
  return new TypedDb(db);
}
