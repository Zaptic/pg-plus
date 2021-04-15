import { types } from 'pg'
import { PGRange, Bounds } from './dataTypes/range'
import { PGInterval } from './dataTypes/interval'

type TypeParser = (value: string) => any

const POINT_REGEX = /\((\-?\d+\.?\d*),(\-?\d+\.?\d*)\)/
const oids = {
    INTEGER: 23,
    BIGINT: 20,
    POINT: 600,
    NUMERIC: 1700,
    TIMESTAMP: 1114,
    TIMESTAMPTZ: 1184,
    DATE: 1082,

    INT4RANGE: 3904,
    INT8RANGE: 3926,
    NUMRANGE: 3906,
    TSRANGE: 3908,
    TSTZRANGE: 3910,
    DATERANGE: 3912,

    INTERVAL: 1186,
}

function parsePoint(value: string) {
    // This wouldn't have a match if the database was returning null.
    const matches = value.match(POINT_REGEX)
    if (!matches) {
        return null
    }

    return {
        lat: parseFloat(matches[1]),
        lon: parseFloat(matches[2]),
    }
}

const RANGE_MATCHER = /(\[|\()("((?:\\"|[^"])*)"|[^"]*),("((?:\\"|[^"])*)"|[^"]*)(\]|\))/

// Function to hook up to postgres
function installRange(rangeOid: number, subtypeOid: number) {
    const subtypeParser = types.getTypeParser(subtypeOid, 'text')
    types.setTypeParser(rangeOid, (rangeLiteral: string) => parseRange(subtypeParser, rangeLiteral))
}

function parseRangeSegment(whole: string, quoted: string) {
    if (quoted) {
        return quoted.replace(/\\(.)/g, '$1')
    }
    if (whole === '') {
        return null
    }
    return whole
}

function parseRange(parseBound: TypeParser, rangeLiteral: string) {
    const matches = rangeLiteral.match(RANGE_MATCHER)

    if (!matches) {
        // empty
        return new PGRange()
    }

    const bounds: Bounds = (matches[1] + matches[6]) as Bounds
    const lower = parseRangeSegment(matches[2], matches[3])
    const upper = parseRangeSegment(matches[4], matches[5])

    return new PGRange(lower ? parseBound(lower) : null, upper ? parseBound(upper) : null, bounds)
}

/**
 * This is a very naïve aproach that will only work for our specific use case.
 * Postgresql's interval type can represent far more than what we can with
 * PGInterval.
 */
function parseInterval(intervalString: string) {
    if (intervalString.includes('day')) {
        const days = parseInt(intervalString.split(' ', 1)[0], 10)
        if (days % 7 === 0) {
            return new PGInterval(days / 7, 'week')
        }
        return new PGInterval(days, 'day')
    }
    const hours = parseInt(intervalString.split(':', 1)[0], 10)
    return new PGInterval(hours, 'hour')
}

export function setupPostgresTypeOverrides() {
    // Handle ranges
    installRange(oids.INT4RANGE, oids.INTEGER)
    installRange(oids.INT8RANGE, oids.BIGINT)
    installRange(oids.NUMRANGE, oids.NUMERIC)
    installRange(oids.TSRANGE, oids.TIMESTAMP)
    installRange(oids.TSTZRANGE, oids.TIMESTAMPTZ)
    installRange(oids.DATERANGE, oids.DATE)

    // Handle points
    types.setTypeParser(oids.POINT, parsePoint)

    // Always ensure that large numbers are returned as ints
    // This means that "counts" are no longer strings.
    types.setTypeParser(oids.NUMERIC, (val) => parseFloat(val))

    // Parse timestamps without timezones as UTC dates
    // This could return Infinity. The author of the type parser has made no attempt to account for that.
    const dateParser: (dateString: string) => Date = types.getTypeParser(1114, 'text')
    types.setTypeParser(oids.TIMESTAMP, (dateString) => dateParser(dateString + 'Z')) // Add Z to force JS reading it as a UTC date

    types.setTypeParser(oids.INTERVAL, parseInterval)
}
