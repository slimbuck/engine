import { Vec3 } from '../../core/math/vec3.js';
import { EventHandler } from '../../core/event-handler.js';
import { platform } from '../../core/platform.js';
import { SortWorker } from './gsplat-sort-worker.js';

class GSplatSorter extends EventHandler {
    worker;

    /** @type {Texture} */
    targetTexture = null;

    /** @type {Promise|null} */
    gpuWritePromise = null;

    position = new Vec3(Infinity);
    direction = new Vec3(Infinity);

    dirty = false;

    constructor() {
        super();

        const handler = async (message) => {
            // wait for previous write to complete
            await this.gpuWritePromise;

            const msgData = message.data ?? message;
            const { order, count } = msgData;

            const { targetTexture, position, direction } = this;
            const { width, height } = targetTexture;

            // this.gpuWritePromise = targetTexture.write(0, 0, width, height, new Uint32Array(order))
            // .then(() => {
            //     this.fire('updated', count);
            //     this.gpuWritePromise = null;
            // });

            targetTexture.write(0, 0, width, height, new Uint32Array(order))
            this.fire('updated', count);

            const toPost = { order };

            // if dirty, we need to send the camera position and direction
            if (this.dirty) {
                toPost.viewPos = { x: position.x, y: position.y, z: position.z };
                toPost.viewDir = { x: direction.x, y: direction.y, z: direction.z };
                this.dirty = false;
            }

            // return the order buffer
            this.worker.postMessage(toPost, [order]);
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
    }

    destroy() {
        this.worker.terminate();
        this.worker = null;
    }

    init(targetTexture, centers, mapping) {
        // store target texture
        this.targetTexture = targetTexture;

        const obj = {
            orderBufferSize: targetTexture.width * targetTexture.height,
            centersBuffer: centers.buffer,
            mappingBuffer: mapping && mapping.buffer
        };
        const transfer = [
            centers.buffer,
            mapping?.buffer
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

        if (this.gpuWritePromise) {
            this.dirty = true;
        } else {
            this.worker.postMessage({
                viewPos: { x: pos.x, y: pos.y, z: pos.z },
                viewDir: { x: dir.x, y: dir.y, z: dir.z }
            });
        }
    }
}

export { GSplatSorter };
