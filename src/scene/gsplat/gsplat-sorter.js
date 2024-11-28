import { EventHandler } from '../../core/event-handler.js';
import { TEXTURELOCK_READ } from '../../platform/graphics/constants.js';

// sort blind set of data
function SortWorker() {

    // number of bits used to store the distance in integer array. Smaller number gives it a smaller
    // precision but faster sorting. Could be dynamic for less precise sorting.
    // 16bit seems plenty of large scenes (train), 10bits is enough for sled.
    const bucketBits = 16;
    const subbucketBits = 10;

    // number of buckets for count sorting to represent each unique distance using bucketBits bits
    const bucketCount = 1 << bucketBits;

    let order;
    let centers;
    let mapping;
    let cameraPosition;
    let cameraDirection;

    let forceUpdate = false;

    const lastCameraPosition = { x: 0, y: 0, z: 0 };
    const lastCameraDirection = { x: 0, y: 0, z: 0 };

    const boundMin = { x: 0, y: 0, z: 0 };
    const boundMax = { x: 0, y: 0, z: 0 };

    let buckets;
    let bucketSizes;
    let bucketOffsets;

    const update = () => {
        if (!order || !centers || !cameraPosition || !cameraDirection) return;

        const px = cameraPosition.x;
        const py = cameraPosition.y;
        const pz = cameraPosition.z;
        const dx = cameraDirection.x;
        const dy = cameraDirection.y;
        const dz = cameraDirection.z;

        const epsilon = 0.001;

        if (!forceUpdate &&
            Math.abs(px - lastCameraPosition.x) < epsilon &&
            Math.abs(py - lastCameraPosition.y) < epsilon &&
            Math.abs(pz - lastCameraPosition.z) < epsilon &&
            Math.abs(dx - lastCameraDirection.x) < epsilon &&
            Math.abs(dy - lastCameraDirection.y) < epsilon &&
            Math.abs(dz - lastCameraDirection.z) < epsilon) {
            return;
        }

        forceUpdate = false;

        lastCameraPosition.x = px;
        lastCameraPosition.y = py;
        lastCameraPosition.z = pz;
        lastCameraDirection.x = dx;
        lastCameraDirection.y = dy;
        lastCameraDirection.z = dz;

        // create distance buffer
        const numVertices = centers.length / 3;

        let skip = 0;

        if (buckets?.length !== numVertices) {
            buckets = new Uint32Array(numVertices);
        }

        if (!bucketSizes) {
            bucketSizes = new Uint32Array(bucketCount);
            bucketOffsets = new Uint32Array(bucketCount);
        } else {
            bucketSizes.fill(0);
        }

        // calc depth min/max using bounding box
        let minDist = 0;
        let maxDist = 0;
        for (let i = 0; i < 8; ++i) {
            const x = (i & 1 ? boundMin.x : boundMax.x) - px;
            const y = (i & 2 ? boundMin.y : boundMax.y) - py;
            const z = (i & 4 ? boundMin.z : boundMax.z) - pz;
            const d = x * dx + y * dy + z * dz;
            if (i === 0) {
                minDist = maxDist = d;
            } else {
                minDist = Math.min(minDist, d);
                maxDist = Math.max(maxDist, d);
            }
        }

        // positive distances are behind the camera
        maxDist = Math.min(maxDist, 0);

        // calculate per-point distance to camera and assign bucket
        const range = maxDist - minDist;
        const divider = (range < 1e-6) ? 0 : (1 << (bucketBits + subbucketBits)) / range;
        for (let i = 0; i < numVertices; ++i) {
            const istride = i * 3;
            const x = centers[istride + 0] - px;
            const y = centers[istride + 1] - py;
            const z = centers[istride + 2] - pz;
            const d = x * dx + y * dy + z * dz;

            if (d > maxDist) {
                // point is behind the user
                buckets[i] = 0xffffffff;
            } else {
                const bucket = Math.floor((d - minDist) * divider);
                buckets[i] = bucket;
                bucketSizes[bucket >>> subbucketBits]++;
            }
        }

        // calculate bucket offsets from sizes
        bucketOffsets[0] = bucketSizes[0];
        for (let i = 1; i < bucketCount; i++) {
            bucketOffsets[i] = bucketOffsets[i - 1] + bucketSizes[i];
        }

        // build the output array
        for (let i = 0; i < numVertices; i++) {
            const bucket = buckets[i];
            if (bucket === 0xffffffff) {
                skip++;
            } else {
                const destIndex = --bucketOffsets[bucket >>> subbucketBits];
                order[destIndex] = (bucket << 22) | i;  // store bucket in top bits and index below
            }
        }

        const inplaceSort = (data, start, end) => {
            (new Uint32Array(data.buffer, start * 4, end - start)).sort();
        };

        // full sort closest vertices
        const sortStart = numVertices - skip - 256 * 1024;
        let start = 0;
        for (let i = 0; i < bucketCount; i++) {
            const end = start + bucketSizes[i];
            if (end - start > 1) {
                if (start > sortStart) {
                    inplaceSort(order, start, end);
                }
            }
            start = end;
        }

        // remove bucket bits
        for (let i = 0; i < numVertices - skip; i++) {
            order[i] &= 0x3fffff;
        }

        // apply mapping
        if (mapping) {
            for (let i = 0; i < numVertices - skip; ++i) {
                order[i] = mapping[order[i]];
            }
        }

        // send results
        self.postMessage({
            order: order.buffer,
            count: numVertices - skip
        }, [order.buffer]);

        order = null;
    };

    self.onmessage = (message) => {
        if (message.data.order) {
            order = new Uint32Array(message.data.order);
        }
        if (message.data.centers) {
            centers = new Float32Array(message.data.centers);

            // calculate bounds
            boundMin.x = boundMax.x = centers[0];
            boundMin.y = boundMax.y = centers[1];
            boundMin.z = boundMax.z = centers[2];

            const numVertices = centers.length / 3;
            for (let i = 1; i < numVertices; ++i) {
                const x = centers[i * 3 + 0];
                const y = centers[i * 3 + 1];
                const z = centers[i * 3 + 2];

                boundMin.x = Math.min(boundMin.x, x);
                boundMin.y = Math.min(boundMin.y, y);
                boundMin.z = Math.min(boundMin.z, z);

                boundMax.x = Math.max(boundMax.x, x);
                boundMax.y = Math.max(boundMax.y, y);
                boundMax.z = Math.max(boundMax.z, z);
            }
            forceUpdate = true;
        }
        if (message.data.hasOwnProperty('mapping')) {
            mapping = message.data.mapping ? new Uint32Array(message.data.mapping) : null;
            forceUpdate = true;
        }
        if (message.data.cameraPosition) cameraPosition = message.data.cameraPosition;
        if (message.data.cameraDirection) cameraDirection = message.data.cameraDirection;

        update();
    };
}

class GSplatSorter extends EventHandler {
    worker;

    orderTexture;

    centers;

    constructor() {
        super();

        this.worker = new Worker(URL.createObjectURL(new Blob([`(${SortWorker.toString()})()`], {
            type: 'application/javascript'
        })));

        this.worker.onmessage = (message) => {
            const newOrder = message.data.order;
            const oldOrder = this.orderTexture._levels[0].buffer;

            // send vertex storage to worker to start the next frame
            this.worker.postMessage({
                order: oldOrder
            }, [oldOrder]);

            // write the new order data to gpu texture memory
            this.orderTexture._levels[0] = new Uint32Array(newOrder);
            this.orderTexture.upload();

            // set new data directly on texture
            this.fire('updated', message.data.count);
        };
    }

    destroy() {
        this.worker.terminate();
        this.worker = null;
    }

    init(orderTexture, centers) {
        this.orderTexture = orderTexture;
        this.centers = centers.slice();

        // get the texture's storage buffer and make a copy
        const orderBuffer = this.orderTexture.lock({
            mode: TEXTURELOCK_READ
        }).buffer.slice();
        this.orderTexture.unlock();

        // send the initial buffer to worker
        this.worker.postMessage({
            order: orderBuffer,
            centers: centers.buffer
        }, [orderBuffer, centers.buffer]);
    }

    setMapping(mapping) {
        if (mapping) {
            // create new centers array
            const centers = new Float32Array(mapping.length * 3);
            for (let i = 0; i < mapping.length; ++i) {
                const src = mapping[i] * 3;
                const dst = i * 3;
                centers[dst + 0] = this.centers[src + 0];
                centers[dst + 1] = this.centers[src + 1];
                centers[dst + 2] = this.centers[src + 2];
            }

            // update worker with new centers and mapping for the subset of splats
            this.worker.postMessage({
                centers: centers.buffer,
                mapping: mapping.buffer
            }, [centers.buffer, mapping.buffer]);
        } else {
            // restore original centers
            const centers = this.centers.slice();
            this.worker.postMessage({
                centers: centers.buffer,
                mapping: null
            }, [centers.buffer]);
        }
    }

    setCamera(pos, dir) {
        this.worker.postMessage({
            cameraPosition: { x: pos.x, y: pos.y, z: pos.z },
            cameraDirection: { x: dir.x, y: dir.y, z: dir.z }
        });
    }
}

export { GSplatSorter };
