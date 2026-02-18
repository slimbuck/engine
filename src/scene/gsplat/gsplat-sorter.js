import { EventHandler } from '../../core/event-handler.js';
import { TEXTURELOCK_READ } from '../../platform/graphics/constants.js';
import { platform } from '../../core/platform.js';
import { SortWorker } from './gsplat-sort-worker.js';

/**
 * @import { StorageBuffer } from '../../platform/graphics/storage-buffer.js'
 * @import { Texture } from '../../platform/graphics/texture.js'
 */

class GSplatSorter extends EventHandler {
    worker;

    /** @type {Texture|null} */
    orderTexture = null;

    /** @type {StorageBuffer|null} */
    orderBuffer = null;

    /**
     * CPU-side buffer tracking for the storage buffer path. Holds the ArrayBuffer
     * currently owned by this side (not the worker) so it can be swapped back.
     *
     * @type {ArrayBuffer|null}
     */
    _orderData = null;

    centers;

    scene;

    constructor(scene) {
        super();
        this.scene = scene ?? null;

        const messageHandler = (message) => {
            const msgData = message.data ?? message;

            // Fire sortTime event on scene
            if (this.scene && msgData.sortTime !== undefined) {
                this.scene.fire('gsplat:sorted', msgData.sortTime);
            }

            const newOrder = msgData.order;

            if (this.orderBuffer) {
                // WebGPU: storage buffer path
                const oldOrder = this._orderData;
                this.worker.postMessage({ order: oldOrder }, [oldOrder]);

                const data = new Uint32Array(newOrder);
                this._orderData = newOrder;
                this.orderBuffer.write(0, data, 0, data.length);
            } else {
                // WebGL: texture path
                const oldOrder = this.orderTexture._levels[0].buffer;
                this.worker.postMessage({ order: oldOrder }, [oldOrder]);

                this.orderTexture._levels[0] = new Uint32Array(newOrder);
                this.orderTexture.markForUpload();
            }

            this.fire('updated', msgData.count);
        };

        const workerSource = `(${SortWorker.toString()})()`;

        if (platform.environment === 'node') {
            this.worker = new Worker(workerSource, {
                eval: true
            });
            this.worker.on('message', messageHandler);
        } else {
            this.worker = new Worker(URL.createObjectURL(new Blob([workerSource], {
                type: 'application/javascript'
            })));
            this.worker.addEventListener('message', messageHandler);
        }
    }

    destroy() {
        this.worker.terminate();
        this.worker = null;
    }

    /**
     * @param {Texture|null} orderTexture - The order texture (WebGL path).
     * @param {StorageBuffer|null} orderBuffer - The order storage buffer (WebGPU path).
     * @param {number} numElements - Total number of splat elements.
     * @param {Float32Array} centers - Splat center positions.
     * @param {Uint32Array} [chunks] - Optional chunk data.
     */
    init(orderTexture, orderBuffer, numElements, centers, chunks) {
        this.orderTexture = orderTexture;
        this.orderBuffer = orderBuffer;
        this.centers = centers.slice();

        let orderData;
        if (orderTexture) {
            orderData = orderTexture.lock({ mode: TEXTURELOCK_READ }).slice();
            orderTexture.unlock();
        } else {
            orderData = new Uint32Array(numElements);
            this._orderData = new ArrayBuffer(numElements * 4);
        }

        for (let i = 0; i < orderData.length; ++i) {
            orderData[i] = i;
        }

        const obj = {
            order: orderData.buffer,
            centers: centers.buffer,
            chunks: chunks?.buffer
        };

        const transfer = [orderData.buffer, centers.buffer].concat(chunks ? [chunks.buffer] : []);

        this.worker.postMessage(obj, transfer);
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
