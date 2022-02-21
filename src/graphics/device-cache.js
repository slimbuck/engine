
// simple cache storing key->value
// missFunc is called if the key is not present
class SimpleCache {
    map = new Map();

    get(key, missFunc) {
        if (!this.map.has(key)) {
            const result = missFunc();
            this.map.set(key, result);
            return result;
        }
        return this.map.get(key);
    }

    clear() {
        this.map.clear();
    }
}

// per-device cache
class DeviceCache {
    constructor(missFunc = null) {
        this.cache = new SimpleCache();
        this.missFunc = missFunc;
    }

    // get the cache entry for the given device and key
    // if entry doesn't exist, missFunc will be invoked to create it
    get(device, key = null, missFunc = null) {
        return this.cache.get(device, () => {
            const cache = new SimpleCache();
            device.on('destroy', () => {
                cache.map.forEach((value, key) => {
                    value.destroy();
                });
                this.cache.map.delete(device);
            });
            return cache;
        }).get(key, () => {
            return (missFunc || this.missFunc)(device, key);
        });
    }

    clear() {
        this.cache.clear();
    }
}

export {
    SimpleCache,
    DeviceCache
};
