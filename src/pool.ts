import * as pg from 'pg'
import { Executor } from './executor'

export interface Config extends pg.PoolConfig {
    statementTimeoutInMs?: number
}

export class Pool {
    public pool: pg.Pool
    public statementTimeoutInMs: number | null

    public async connect(): Promise<Executor> {
        const client = await this.pool.connect()
        const executor = new Executor(client)
        if (this.statementTimeoutInMs !== null) await executor.setStatementTimeout(this.statementTimeoutInMs)
        return executor
    }

    /**
     * Runs a query on a database and cleans up all used resources.
     * If you're planning on making multiple queries use `new Pool(cfg)`
     *
     * Notes:
     * If you're planning on making multiple queries use `new Pool(cfg)`
     * This will force cfg.max to 1
     */
    public static run<T>(cfg: Config, fn: (database: Executor) => Promise<T>) {
        const pool = new Pool({ ...cfg, max: 1 }) // Force the max to 1 as there is no point making more in this context
        return pool.run(fn).finally(() => pool.close())
    }

    /**
     * Runs a query on a database with a transaction and cleans up all used resources.
     * If fn throws an error no changes will be saved to the database
     *
     * Notes:
     * If you're planning on making multiple queries use `new Pool(cfg)`
     * This will force cfg.max to 1
     */
    public static runInTransaction<T>(cfg: Config, fn: (database: Executor) => Promise<T>) {
        const pool = new Pool({ ...cfg, max: 1 }) // Force the max to 1 as there is no point making more in this context
        return pool.runInTransaction(fn).finally(() => pool.close())
    }

    constructor(cfg: Config) {
        this.statementTimeoutInMs = cfg.statementTimeoutInMs ?? null
        this.pool = new pg.Pool({ ...cfg })
        // There is nothing we can really do but log this
        this.pool.on('error', (e) => console.error('[PGPLUS] Connection pool error', e))
    }

    /**
     * Runs a query on a database. This is for cases when you don't want to worry about releasing the executor used
     * to run the query.
     */
    public async run<T>(fn: (database: Executor) => Promise<T>) {
        const database = await this.connect()
        return fn(database).finally(() => database.release())
    }

    /**
     * Runs a query in a transaction on a database. This is for cases when you don't want to worry about releasing
     * the executor used to run the query. It will also rollback the transaction if fn throws an error.
     */
    public async runInTransaction<T>(fn: (database: Executor) => Promise<T>) {
        const database = await this.connect()
        return database.transaction(fn).finally(() => database.release())
    }

    public close() {
        return this.pool.end()
    }
}
