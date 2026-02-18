import type {
  DatabaseSync,
  SQLInputValue,
  StatementResultingChanges,
} from 'node:sqlite';

export interface TypedStatement<T> {
  all(...params: SQLInputValue[]): T[];
  get(...params: SQLInputValue[]): T | undefined;
  run(...params: SQLInputValue[]): StatementResultingChanges;
}

export class TypedDb {
  constructor(private readonly db: DatabaseSync) {}

  prepare<T>(sql: string): TypedStatement<T> {
    const stmt = this.db.prepare(sql);
    return {
      all: (...params: SQLInputValue[]) => stmt.all(...params) as T[],
      get: (...params: SQLInputValue[]) => stmt.get(...params) as T | undefined,
      run: (...params: SQLInputValue[]) => stmt.run(...params),
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
