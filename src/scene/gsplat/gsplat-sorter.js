import { Vec3 } from '../../core/math/vec3.js';
import { EventHandler } from '../../core/event-handler.js';
import { platform } from '../../core/platform.js';
import { SortWorker } from './gsplat-sort-worker.js';
import { Texture } from '../../platform/graphics/texture.js';
import { PIXELFORMAT_R32U } from '../../platform/graphics/constants.js';
import { getApplication } from '../../framework/globals.js';

class GSplatSorter extends EventHandler {
    worker;

    device = null;

    cameraDirty = false;
    position = new Vec3(Infinity);
    direction = new Vec3(Infinity);

    order = null;
    newOrder = null;
    count = 0;
    fence = null;
    fenceCount = 0;
    index = 0;
    waiting = false;

    constructor(device) {
        super();

        const handler = async (message) => {
            const msgData = message.data ?? message;
            const { order, count } = msgData;

            this.newOrder = order;
            this.count = count;
        };

        const workerSource = `(${SortWorker.toString()})()`;

        if (platform.environment === 'node') {
            // node worker
            this.worker = new Worker(workerSource, {
                eval: true
            });
            this.worker.on('message', handler);
        } else {
            // browser worker
            this.worker = new Worker(URL.createObjectURL(new Blob([workerSource], {
                type: 'application/javascript'
            })));
            this.worker.addEventListener('message', handler);
        }

        getApplication().on('postrender', () => {
            const { newOrder, waiting, fence } = this;

            // wait for fence to complete, return if it's still busy
            if (fence) {
                this.fenceCount++;
                if (fence() === null) {
                    return;
                }
                console.log(`waited ${this.fenceCount}`);
                this.fence = null;
            }

            if (waiting) {
                const { device } = this;

                // we've rendered with the new texture, create a fence so we know it's active
                this.waiting = false;
                this.fence = device.createFence();
                this.fenceCount = 0;
            } else if (newOrder) {
                const { count, size, textures, index } = this;

                // upload texture data
                const width = size.x;
                const height = Math.ceil(count / width);
                textures[index].write(0, 0, width, height, new Uint32Array(newOrder, 0, width * height));

                // activate the new texture
                this.fire('updated', count, textures[index]);

                // double buffered
                this.index = 1 - index;

                // signal 1 frame delay
                this.waiting = true;
                this.order = newOrder;
                this.newOrder = null;

                // send the buffer back to the worker
                this.send();
            }
        });

        this.device = device;
    }

    destroy() {
        this.worker.terminate();
        this.worker = null;
    }

    init(size, centers, mapping) {
        this.size = size;
        this.order = new ArrayBuffer(4 * size.x * size.y);

        // create order textures
        this.textures = [
            new Texture(this.device, { width: size.x, height: size.y, format: PIXELFORMAT_R32U, name: 'gsplat-order-0' }),
            new Texture(this.device, { width: size.x, height: size.y, format: PIXELFORMAT_R32U, name: 'gsplat-order-1' }),
        ];

        const obj = {
            orderBufferSize: size.x * size.y,
            centersBuffer: centers.buffer,
            mappingBuffer: mapping && mapping.buffer
        };

        const transfer = [
            obj.orderBuffer,
            obj.centersBuffer,
            obj.mappingBuffer
        ].filter(v => !!v);

        // send the initial buffer to worker
        this.worker.postMessage(obj, transfer);
    }

    setCamera(pos, dir) {
        if (pos.equalsApprox(this.position) &&
            dir.equalsApprox(this.direction)) {
            return; // no change
        }

        this.position.copy(pos);
        this.direction.copy(dir);
        this.cameraDirty = true;

        this.send();
    }

    send() {
        if (!this.cameraDirty || !this.order) {
            return;
        }

        const { position, direction } = this;

        this.worker.postMessage({
            orderBuffer: this.order,
            viewPos: { x: position.x, y: position.y, z: position.z },
            viewDir: { x: direction.x, y: direction.y, z: direction.z }
        });

        this.cameraDirty = false;
        this.order = null;
    }
}

export { GSplatSorter };
