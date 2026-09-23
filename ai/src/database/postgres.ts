import pg from "pg";
import type { PoolClient, QueryResult, QueryResultRow } from "pg";

/**
 * The smallest common database surface used by persistence adapters. It keeps
 * adapters testable without making them depend on a concrete `pg.Pool`.
 */
export interface PostgresQueryExecutor {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<Row>>;
}

export interface PostgresDatabaseOptions {
  readonly connectionString: string;
  readonly max?: number;
  readonly idleTimeoutMillis?: number;
  readonly connectionTimeoutMillis?: number;
}

/**
 * Shared application-level PostgreSQL pool. Create this once during service
 * composition and pass it to individual stores; close it during shutdown.
 */
export class PostgresDatabase implements PostgresQueryExecutor {
  private readonly pool: pg.Pool;

  public constructor(options: PostgresDatabaseOptions) {
    if (options.connectionString.trim().length === 0) {
      throw new Error("PostgreSQL connection string must not be empty.");
    }

    this.pool = new pg.Pool({
      connectionString: options.connectionString,
      ...(options.max === undefined ? {} : { max: options.max }),
      ...(options.idleTimeoutMillis === undefined
        ? {}
        : { idleTimeoutMillis: options.idleTimeoutMillis }),
      ...(options.connectionTimeoutMillis === undefined
        ? {}
        : { connectionTimeoutMillis: options.connectionTimeoutMillis })
    });
  }

  public async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<Row>> {
    if (values === undefined) {
      return this.pool.query<Row>(text);
    }

    return this.pool.query<Row, unknown[]>(text, [...values]);
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  /** Runs a function on one client with an all-or-nothing database transaction. */
  public async transaction<T>(
    operation: (database: PostgresQueryExecutor) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    const transaction: PostgresQueryExecutor = queryExecutorFor(client);
    try {
      await client.query("BEGIN");
      const result = await operation(transaction);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

function queryExecutorFor(client: PoolClient): PostgresQueryExecutor {
  return {
    async query<Row extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: readonly unknown[]
    ): Promise<QueryResult<Row>> {
      if (values === undefined) {
        return client.query<Row>(text);
      }
      return client.query<Row, unknown[]>(text, [...values]);
    }
  };
}
