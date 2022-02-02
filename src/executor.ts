import * as fs from 'fs'
import type { PoolClient } from 'pg'
import QueryStream from 'pg-query-stream'
import { TypedQuery } from './typedQuery'
import { DBError, DBResultPromise } from './errors'
import { hashStringToInt } from './helpers'

export class Executor {
    public client: PoolClient
    public closed = false
    private closedError = 'This Executor has been released'

    constructor(client: PoolClient) {
        this.client = client
    }

    public setStatementTimeout(milliseconds: number) {
        if (!Number.isInteger(milliseconds)) throw new Error('Invalid parameter, timeout must be an integer')
        return this.executeString(`SET statement_timeout TO ${milliseconds}`)
    }

    public rollback() {
        return this.executeString('ROLLBACK')
    }

    public commit() {
        return this.executeString('COMMIT')
    }

    public begin() {
        return this.executeString('BEGIN')
    }

    public getTransactionLock(lockName: string) {
        return this.executeString<[number], { lock: boolean }>(`SELECT pg_advisory_xact_lock($1) "lock"`, [
            hashStringToInt(lockName),
        ])
    }

    /**
     * Opens a transaction, catch errors safely and rollback afterwards
     */
    public async transaction<T>(fn: (database: Executor) => Promise<T>) {
        // Run code safely in a try catch
        try {
            await this.begin()
            const result = await fn(this)
            await this.commit()

            return result
        } catch (err) {
            await this.rollback()

            throw err
        }
    }

    /**
     * Executes a query and streams the results - useful when there is a lot of data being returned
     */
    public stream<Input extends {}, Output extends {}>(query: TypedQuery<Input, Output>, data?: Input) {
        const params = data ? query.getParameterArray(data) : undefined
        return this.client.query(new QueryStream(query.parametrisedQuery, params))
    }

    public async executeFile<T>(path: string) {
        return this.executeString<never, T>(await fs.promises.readFile(path, 'utf8'))
    }

    public disableTrigger(tableName: string, triggerName: string) {
        return this.executeString(`ALTER TABLE ${tableName} DISABLE TRIGGER ${triggerName}`)
    }

    public enableTrigger(tableName: string, triggerName: string) {
        return this.executeString(`ALTER TABLE ${tableName} ENABLE TRIGGER ${triggerName}`)
    }

    /**
     * Executes a query defined by a NamedQuery
     */
    public execute<Input extends {}, Output extends {}>(
        query: TypedQuery<Input, Output>,
        data?: Input
    ): DBResultPromise<Output> {
        if (!data) return this.executeString(query.parametrisedQuery)
        return this.executeString(query.parametrisedQuery, query.getParameterArray(data))
    }

    public executeString<T extends Array<any> = never, R = never>(query: string, data?: T): DBResultPromise<R> {
        if (this.closed) throw new Error(this.closedError)

        if (process.env.PGPLUS_LOG_QUERIES === 'true') {
            fs.appendFileSync('./query.log', `\n${JSON.stringify({ query, data })},`)
        }

        const promise = this.client.query<R, T>(query, data).catch((error: DBError) => {
            error.query = query
            error.queryData = data
            return Promise.reject(error)
        })

        return DBResultPromise.from(promise)
    }

    /**
     * Release puts the client back into the database pool for it to be used again.
     * We make sure that we cannot use it again after releasing it through the "closed" check.
     */
    public release(err?: Error) {
        if (this.closed) return
        this.closed = true
        return this.client.release(err)
    }
}
