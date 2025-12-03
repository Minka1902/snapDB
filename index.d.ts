export interface SnapDBOptions {
  cacheTTL?: number;
  enableCache?: boolean;
  enableLogging?: boolean;
}

export type RecordObject = { [key: string]: any };

export class QueryBuilder<T extends RecordObject = RecordObject> {
  constructor(db: SnapDB, collectionName: string);
  where(field: keyof T & string, operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | '!contains' | 'in' | '!in' | 'like' | '!like', value: any): this;
  orWhere(field: keyof T & string, operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | '!contains' | 'in' | '!in' | 'like' | '!like', value: any): this;
  whereNull(field: keyof T & string): this;
  whereNotNull(field: keyof T & string): this;
  whereDate(field: keyof T & string, operator: '>' | '<' | '>=' | '<=' | '=', date: Date | string): this;
  whereDateBetween(field: keyof T & string, startDate: Date | string, endDate: Date | string): this;
  orderBy(field: keyof T & string, order?: 'asc' | 'desc'): this;
  limit(count: number): this;
  offset(count: number): this;
  paginate(page: number, perPage: number): this;
  execute(): Promise<T[]>;
  count(): Promise<number>;
  sum(field: keyof T & string): Promise<number>;
  avg(field: keyof T & string): Promise<number>;
  min(field: keyof T & string): Promise<number | null>;
  max(field: keyof T & string): Promise<number | null>;
}

export default class SnapDB {
  constructor(dbName?: string, options?: SnapDBOptions);

  // Utilities
  generateId(): string;
  clearAllCaches(): void;

  // Logging
  getLogs(type?: 'requests' | 'responses', limit?: number): Promise<Array<any>>;
  clearLogs(): Promise<void>;

  // Paths
  getCollectionPath(collectionName: string): string;
  collectionExists(collectionName: string): boolean;

  // Collections
  createCollection(collectionName: string, properties?: string[]): Promise<boolean>;
  getCollectionNames(): Promise<string[]>;
  deleteCollectionByName(collectionName: string): Promise<boolean>;

  // Records
  insert(collectionName: string, data: RecordObject): Promise<{ message: string; newRecordId: string }>;
  insertMany(collectionName: string, dataArray: RecordObject[]): Promise<{ message: string; newRecordIds: string[]; count: number }>;
  getCollection<T extends RecordObject = RecordObject>(collectionName: string): Promise<T[]>;
  findById<T extends RecordObject = RecordObject>(id: string, collectionName?: string): Promise<T & Partial<{ _collection: string }>>;
  deleteById(id: string, collectionName?: string): Promise<{ message: string; itemId: string; collection?: string }>;
  deleteMany(ids: string[], collectionName?: string): Promise<{ message: string; deletedIds: string[]; notFoundIds: string[]; count: number }>;
  updateById(id: string, updates: RecordObject, collectionName?: string): Promise<{ message: string; newRecordId: string }>;
  updateMany(updateArray: Array<{ id: string; updates: RecordObject; collectionName?: string }>): Promise<{ message: string; updatedIds: string[]; failedIds: Array<{ id: string; reason: string }>; count: number }>;
  // Metrics
  calcDBSize(): Promise<number>;

  // Backup/Restore
  exportData(collectionName?: string): Promise<{ timestamp: string; dbName: string; collections: Record<string, { headers: string[]; records: any[] }> }>;
  importData(backupData: any, options?: { overwrite?: boolean }): Promise<{ message: string; imported: string[]; skipped: string[]; errors: Array<{ collection: string; error: string }> }>;
  backup(backupPath: string, collectionName?: string): Promise<{ message: string; backupPath: string; timestamp: string; collections: string[] }>;
  restore(backupPath: string, options?: { overwrite?: boolean }): Promise<{ message: string; imported: string[]; skipped: string[]; errors: Array<{ collection: string; error: string }> }>;

  // Querying
  query<T extends RecordObject = RecordObject>(collectionName: string): QueryBuilder<T>;
  getLogById(logId: string, type?: 'requests' | 'responses' | 'both'): Promise<{ request: any | null; response: any | null }>;

  // Events/Hooks
  on(event: string, listener: (...args: any[]) => void | Promise<void>): void;
  once(event: string, listener: (...args: any[]) => void | Promise<void>): void;
  off(event: string, listener: (...args: any[]) => void | Promise<void>): void;
  removeAllListeners(event?: string): void;
}

// Ambient module declarations for deep imports
declare module 'snap4db/lib/QueryBuilder' {
  import { QueryBuilder as QB } from 'snap4db';
  export = QB;
}

declare module 'snap4db/lib/errors' {
  class DatabaseError extends Error {
    code: string;
    timestamp: string;
    toJSON(): {
      name: string;
      message: string;
      code: string;
      timestamp: string;
      stack?: string;
    };
  }

  class CollectionNotFoundError extends DatabaseError { constructor(collectionName: string); }
  class RecordNotFoundError extends DatabaseError { constructor(recordId: string, collectionName?: string | null); }
  class CollectionAlreadyExistsError extends DatabaseError { constructor(collectionName: string); }
  class ReservedPropertyError extends DatabaseError { constructor(propertyName: string); }
  class EmptyCollectionError extends DatabaseError { constructor(); }
  class FileOperationError extends DatabaseError { constructor(operation: string, filePath: string, originalError: Error); }
  class ValidationError extends DatabaseError { constructor(field: string, message: string, value?: any); }
  class QueryError extends DatabaseError { constructor(message: string, query?: any); }
  class DatabaseConnectionError extends DatabaseError { constructor(dbPath: string, originalError?: Error | null); }
  class CorruptedDataError extends DatabaseError { constructor(collectionName: string, details?: string | null); }

  export {
    DatabaseError,
    CollectionNotFoundError,
    RecordNotFoundError,
    CollectionAlreadyExistsError,
    ReservedPropertyError,
    EmptyCollectionError,
    FileOperationError,
    ValidationError,
    QueryError,
    DatabaseConnectionError,
    CorruptedDataError,
  };
}
