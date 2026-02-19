// Stats timer interface for graph
class StatsTimer {
    constructor(app, statNames, decimalPlaces, unitsName, multiplier) {
        this.app = app;
        this.values = [];

        this.unitsName = unitsName;
        this.decimalPlaces = decimalPlaces;
        this.multiplier = multiplier || 1;

        // Pre-split stat paths once at construction to avoid per-frame string allocations
        this._statPaths = statNames.map(name => name.split('.'));

        app.on('frameupdate', (ms) => {
            for (let i = 0; i < this._statPaths.length; i++) {
                const parts = this._statPaths[i];
                let obj = this.app.stats;
                for (let j = 0; j < parts.length; j++) {
                    if (!obj) break;
                    obj = (obj instanceof Map) ? obj.get(parts[j]) : obj[parts[j]];
                }
                this.values[i] = ((obj ?? 0)) * this.multiplier;
            }
        });
    }

    get timings() {
        return this.values;
    }
}

export { StatsTimer };
