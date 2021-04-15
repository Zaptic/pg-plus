export type TimeDimension = 'hour' | 'day' | 'week'

export class PGInterval {
    public quantity: number
    public unit: TimeDimension

    constructor(quantity: number, unit: TimeDimension) {
        this.quantity = quantity
        this.unit = unit
    }

    public toPostgres() {
        return `${this.quantity} ${this.unit}`
    }

    public toJSON() {
        return {
            quantity: this.quantity,
            unit: this.unit,
        }
    }
}
