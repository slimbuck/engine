// sort blind set of data
function SortWorker() {
    // handle self being different in node.js and browser
    const myself = (typeof self !== 'undefined' && self) || (require('node:worker_threads').parentPort);

    const globals = {
        /** @type {number} */
        orderBufferSize: 0,
        /** @type  {Uint32Array[]}*/
        orderBuffers: [],
        /** @type {Float32Array|null} */
        centers: null,
        /** @type {Float32Array|null} */
        chunks: null,
        /** @type {Uint32Array|null} */
        mapping: null,
        viewPos: {
            x: 0,
            y: 0,
            z: 0
        },
        viewDir: {
            x: 0,
            y: 0,
            z: 0
        },
        boundMin: {
            x: 0,
            y: 0,
            z: 0
        },
        boundMax: {
            x: 0,
            y: 0,
            z: 0
        }
    };

    // could be increased, but this seems a good compromise between stability and performance
    const numBins = 32;
    const binCount = new Array(numBins).fill(0);
    const binBase = new Array(numBins).fill(0);
    const binDivider = new Array(numBins).fill(0);

    const binarySearch = (m, n, compare_fn) => {
        while (m <= n) {
            const k = (n + m) >> 1;
            const cmp = compare_fn(k);
            if (cmp > 0) {
                m = k + 1;
            } else if (cmp < 0) {
                n = k - 1;
            } else {
                return k;
            }
        }
        return ~m;
    };

    const copyVec3 = (dst, src) => {
        dst.x = src.x;
        dst.y = src.y;
        dst.z = src.z;
    };

    let distances;
    let countBuffer;

    const update = () => {
        const { orderBuffers, orderBufferSize, centers, chunks, mapping, viewPos, viewDir, boundMin, boundMax } = globals;

        const dx = viewDir.x;
        const dy = viewDir.y;
        const dz = viewDir.z;

        // calc min/max distance using bound
        let minDist = 0;
        let maxDist = 0;
        for (let i = 0; i < 8; ++i) {
            const x = (i & 1 ? boundMin.x : boundMax.x);
            const y = (i & 2 ? boundMin.y : boundMax.y);
            const z = (i & 4 ? boundMin.z : boundMax.z);
            const d = x * dx + y * dy + z * dz;
            if (i === 0) {
                minDist = maxDist = d;
            } else {
                minDist = Math.min(minDist, d);
                maxDist = Math.max(maxDist, d);
            }
        }

        const numVertices = centers.length / 3;

        // calculate number of bits needed to store sorting result
        const compareBits = Math.max(10, Math.min(20, Math.round(Math.log2(numVertices / 4))));
        const bucketCount = 2 ** compareBits + 1;

        // create distance buffer
        if (distances?.length !== numVertices) {
            distances = new Uint32Array(numVertices);
        }

        if (!countBuffer || countBuffer.length !== bucketCount) {
            countBuffer = new Uint32Array(bucketCount);
        } else {
            countBuffer.fill(0);
        }

        const range = maxDist - minDist;

        if (range < 1e-6) {
            // all points are at the same distance
            for (let i = 0; i < numVertices; ++i) {
                distances[i] = 0;
                countBuffer[0]++;
            }
        } else {
            // use chunks to calculate rough histogram of splats per distance
            const numChunks = chunks.length / 4;

            binCount.fill(0);
            for (let i = 0; i < numChunks; ++i) {
                const x = chunks[i * 4 + 0];
                const y = chunks[i * 4 + 1];
                const z = chunks[i * 4 + 2];
                const r = chunks[i * 4 + 3];
                const d = x * dx + y * dy + z * dz - minDist;

                const binMin = Math.max(0, Math.floor((d - r) * numBins / range));
                const binMax = Math.min(numBins, Math.ceil((d + r) * numBins / range));

                for (let j = binMin; j < binMax; ++j) {
                    binCount[j]++;
                }
            }

            // count total number of histogram bin entries
            const binTotal = binCount.reduce((a, b) => a + b, 0);

            // calculate per-bin base and divider
            for (let i = 0; i < numBins; ++i) {
                binDivider[i] = (binCount[i] / binTotal * bucketCount) >>> 0;
            }
            for (let i = 0; i < numBins; ++i) {
                binBase[i] = i === 0 ? 0 : binBase[i - 1] + binDivider[i - 1];
            }

            // generate per vertex distance key using histogram to distribute bits
            const binRange = range / numBins;
            let ii = 0;
            for (let i = 0; i < numVertices; ++i) {
                const x = centers[ii++];
                const y = centers[ii++];
                const z = centers[ii++];
                const d = (x * dx + y * dy + z * dz - minDist) / binRange;
                const bin = d >>> 0;
                const sortKey = (binBase[bin] + binDivider[bin] * (d - bin)) >>> 0;

                distances[i] = sortKey;

                // count occurrences of each distance
                countBuffer[sortKey]++;
            }
        }

        // Change countBuffer[i] so that it contains actual position of this digit in outputArray
        for (let i = 1; i < bucketCount; i++) {
            countBuffer[i] += countBuffer[i - 1];
        }

        // Allocate order buffer
        const order = orderBuffers.length > 0 ? orderBuffers.pop() : new Uint32Array(orderBufferSize);

        // Build the output array
        for (let i = 0; i < numVertices; i++) {
            const distance = distances[i];
            const destIndex = --countBuffer[distance];
            order[destIndex] = i;
        }

        // Find splat with distance 0 to limit rendering behind the camera
        const px = viewPos.x;
        const py = viewPos.y;
        const pz = viewPos.z;
        const cameraDist = px * dx + py * dy + pz * dz;
        const dist = (i) => {
            let o = order[i] * 3;
            return centers[o++] * dx + centers[o++] * dy + centers[o] * dz - cameraDist;
        };
        const findZero = () => {
            const result = binarySearch(0, numVertices - 1, i => -dist(i));
            return Math.min(numVertices, Math.abs(result));
        };

        const count = dist(numVertices - 1) >= 0 ? findZero() : numVertices;

        // apply mapping
        if (mapping) {
            for (let i = 0; i < numVertices; ++i) {
                order[i] = mapping[order[i]];
            }
        }

        // send results
        myself.postMessage({
            order: order.buffer,
            count
        }, [order.buffer]);
    };

    // given a list of centers, calculate chunk bounding spheres and scene min and max bounds
    const calculateChunksAndBounds = (centers, chunks, boundMin, boundMax) => {
        const numVertices = centers.length / 3;
        const numChunks = Math.ceil(numVertices / 256);

        boundMin.x = boundMin.y = boundMin.z = Infinity;
        boundMax.x = boundMax.y = boundMax.z = -Infinity;

        // calculate bounds
        let mx, my, mz, Mx, My, Mz;
        for (let c = 0; c < numChunks; ++c) {
            mx = my = mz = Infinity;
            Mx = My = Mz = -Infinity;

            const start = c * 256;
            const end = Math.min(numVertices, (c + 1) * 256);
            for (let i = start; i < end; ++i) {
                const x = centers[i * 3 + 0];
                const y = centers[i * 3 + 1];
                const z = centers[i * 3 + 2];

                const validX = Number.isFinite(x);
                const validY = Number.isFinite(y);
                const validZ = Number.isFinite(z);

                if (!validX) centers[i * 3 + 0] = 0;
                if (!validY) centers[i * 3 + 1] = 0;
                if (!validZ) centers[i * 3 + 2] = 0;
                if (!validX || !validY || !validZ) {
                    continue;
                }

                if (x < mx) mx = x; else if (x > Mx) Mx = x;
                if (y < my) my = y; else if (y > My) My = y;
                if (z < mz) mz = z; else if (z > Mz) Mz = z;

                if (x < boundMin.x) boundMin.x = x; else if (x > boundMax.x) boundMax.x = x;
                if (y < boundMin.y) boundMin.y = y; else if (y > boundMax.y) boundMax.y = y;
                if (z < boundMin.z) boundMin.z = z; else if (z > boundMax.z) boundMax.z = z;
            }

            // calculate chunk center and radius from bound min/max
            chunks[c * 4 + 0] = (mx + Mx) * 0.5;
            chunks[c * 4 + 1] = (my + My) * 0.5;
            chunks[c * 4 + 2] = (mz + Mz) * 0.5;
            chunks[c * 4 + 3] = Math.sqrt((Mx - mx) ** 2 + (My - my) ** 2 + (Mz - mz) ** 2) * 0.5;
        }
    };

    let handle;

    myself.addEventListener('message', (message) => {
        const msgData = message.data ?? message;

        const { orderBufferSize, orderBuffer, centersBuffer, mappingBuffer, viewPos, viewDir } = msgData;

        if (orderBufferSize) {
            globals.orderBufferSize = orderBufferSize;
            globals.orderBuffers = globals.orderBuffers.filter((b) => b.length === orderBufferSize);
        }
        if (orderBuffer) {
            globals.orderBuffers.push(new Uint32Array(orderBuffer));
        }
        if (centersBuffer) {
            const centers = new Float32Array(centersBuffer);
            globals.centers = centers;
            globals.chunks = null;
        }
        if (msgData.hasOwnProperty('mappingBuffer')) {
            const mapping = mappingBuffer && new Uint32Array(mappingBuffer);
            globals.mapping = mapping;
            globals.chunks = null;
        }
        if (msgData.viewPos) {
            copyVec3(globals.viewPos, viewPos);
        }
        if (msgData.viewDir) {
            copyVec3(globals.viewDir, viewDir);
        }

        if (globals.centers && !globals.chunks) {
            globals.chunks = new Float32Array(Math.ceil(globals.centers.length / 3 / 256) * 4);
            calculateChunksAndBounds(globals.centers, globals.chunks, globals.boundMin, globals.boundMax);
        }

        if (viewPos || viewDir) {
            if (!handle && globals.centers && globals.orderBufferSize > 0) {
                handle = setTimeout(() => {
                    handle = null;
                    update();
                }, 0);
            }
        }
    });
}

export { SortWorker };
