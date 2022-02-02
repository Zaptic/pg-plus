import { Pool } from './pool'
import { sql } from './typedQuery'
import * as chai from 'chai'
import chaiAsPromised = require('chai-as-promised')

chai.use(chaiAsPromised)

const testCredentials = { database: 'pgplus', host: 'localhost', user: 'postgres', password: 'postgres', max: 1 }

describe('PG Plus', function () {
    before(async function () {
        await Pool.run(
            { database: 'postgres', host: 'localhost', user: 'postgres', password: 'postgres', max: 1 },
            (db) => db.execute(sql`CREATE DATABASE pgplus`)
        ).catch(() => null) // Ignore as it's OK for the DB to already exist

        await Pool.run(testCredentials, async (database) => {
            await database.execute(sql`DROP SCHEMA public CASCADE`)
            await database.execute(sql`CREATE SCHEMA public`)
        })
    })

    it('times out when set timeout is set on the executor', async function () {
        this.timeout(3000)

        await Pool.run(testCredentials, async (executor) => {
            // Check that we can sleep without a timeout
            await executor.executeString(`SELECT pg_sleep(1)`)

            // Check that we can sleep with a timeout that's greater than the sleep
            await executor.setStatementTimeout(2000)
            await executor.executeString(`SELECT pg_sleep(1)`)

            // Check that we get an error with a timeout lower than the sleep
            await executor.setStatementTimeout(500)
            await chai.assert.isRejected(
                executor.executeString(`SELECT pg_sleep(1)`),
                'canceling statement due to statement timeout'
            )
        })
    })

    it('times out when set timeout is set on the pool', async function () {
        this.timeout(3000)

        // Check that we can sleep without a timeout
        await Pool.run(testCredentials, (executor) => executor.executeString(`SELECT pg_sleep(1)`))

        // Check that we can sleep with a timeout that's greater than the sleep
        await Pool.run({ ...testCredentials, statementTimeoutInMs: 2000 }, (executor) =>
            executor.executeString(`SELECT pg_sleep(1)`)
        )

        // Check that we get an error with a timeout lower than the sleep
        await chai.assert.isRejected(
            Pool.run({ ...testCredentials, statementTimeoutInMs: 500 }, (executor) =>
                executor.executeString(`SELECT pg_sleep(1)`)
            ),
            'canceling statement due to statement timeout'
        )
    })
})
