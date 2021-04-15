export class PGPoint {
    public lat: number
    public lon: number

    constructor(lat: number, lon: number) {
        this.lat = lat
        this.lon = lon
    }

    public toPostgres() {
        return `(${this.lat},${this.lon})`
    }
}
