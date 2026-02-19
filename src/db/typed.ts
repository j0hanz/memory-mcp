import type {
  DatabaseSync,
  SQLInputValue,
  StatementResultingChanges,
} from 'node:sqlite';

type SqlParams = SQLInputValue[];

export interface TypedStatement<T> {
  all(...params: SqlParams): T[];
  get(...params: SqlParams): T | undefined;
  run(...params: SqlParams): StatementResultingChanges;
}

export class TypedDb {
  constructor(private readonly db: DatabaseSync) {}

  prepare<T>(sql: string): TypedStatement<T> {
    const stmt = this.db.prepare(sql);
    return {
      all: (...params: SqlParams) => stmt.all(...params) as T[],
      get: (...params: SqlParams) => stmt.get(...params) as T | undefined,
      run: (...params: SqlParams) => stmt.run(...params),
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
