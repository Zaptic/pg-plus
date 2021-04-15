export type Bounds = '[]' | '()' | '[)' | '(]'
type Prepare<T> = (value: T) => string

function formatBound<T>(value: T | null, prepare: Prepare<T>) {
    if (value === null) {
        return ''
    }

    let preparedValue = prepare(value)
    if (/[()[\],"\\]/.test(preparedValue)) {
        // quote bound only if necessary
        preparedValue = '"' + preparedValue.replace(/(\\|")/, '\\$1') + '"'
    }
    return preparedValue
}

export class PGRange<T> {
    public start: T | null
    public end: T | null
    public bounds: Bounds

    constructor(start?: T, end?: T, bounds?: Bounds) {
        this.start = start || null
        this.end = end || null
        this.bounds = bounds || '[)'
    }

    public toPostgres(prepare: Prepare<T>) {
        const boundedStart = this.bounds[0] + formatBound(this.start, prepare)
        const boundedEnd = formatBound(this.end, prepare) + this.bounds[1]
        return boundedStart + ',' + boundedEnd
    }
}
