import { expect } from 'chai';
import sinon from 'sinon';

import { Vec3 } from '../../../src/core/math/vec3.js';
import {
    GSPLAT_FORWARD, GSPLAT_SHADOW, GSPLAT_RENDERER_EXTERNAL, GSPLAT_RENDERER_RASTER_GPU_SORT
} from '../../../src/scene/constants.js';
import { GSplatExternalRenderer } from '../../../src/scene/gsplat-unified/gsplat-external-renderer.js';
import { GSplatManager } from '../../../src/scene/gsplat-unified/gsplat-manager.js';
import { GSplatWorkBuffer } from '../../../src/scene/gsplat-unified/gsplat-work-buffer.js';

describe('GSPLAT_RENDERER_EXTERNAL', function () {

    // A manager over a stubbed world, so the per-frame flow runs without graphics resources.
    const makeManager = () => {
        const manager = Object.create(GSplatManager.prototype);
        const worldState = { version: 1, sortedBefore: false, totalActiveSplats: 100 };
        Object.assign(manager, {
            device: {},
            node: {},
            cameraNode: { camera: {}, forward: new Vec3(0, 0, -1), getPosition: () => new Vec3() },
            layer: {},
            gsplat: { currentRenderer: GSPLAT_RENDERER_EXTERNAL, radialSorting: true, dirty: false },
            director: { _streamToken: 0, eventHandler: { fire: sinon.spy() } },
            cpuSorter: null,
            shadowRenderer: null,
            _hybridScratch: null,
            sortNeeded: true,
            lastSortCameraPos: new Vec3(Infinity, Infinity, Infinity),
            lastSortCameraFwd: new Vec3(Infinity, Infinity, Infinity),
            _renderViewParams: {},
            _bakeResult: { rebuilt: false, count: 0, textureSize: 0, sortNeeded: false },
            _markResult: { rebuilt: false, count: 0, textureSize: 0 },
            world: {
                workBuffer: { format: { extraStreamsVersion: 0 } },
                currentVersion: 1,
                lastWorldStateVersion: 1,
                awaitingLodUpdate: false,
                pendingLoadCount: 0,
                getState: () => worldState,
                resetFrameStats() {},
                invalidate: sinon.spy(),
                markSorted: sinon.spy((version, count, camera, updateBounds, result) => {
                    worldState.sortedBefore = true;
                    return result;
                }),
                bake: sinon.spy((version, camera, updateBounds, result) => result),
                computeAggregateAabb: () => null,
                markInstancesNeedLodUpdate() {}
            }
        });
        manager.updateStreaming = () => false;
        manager.sortCpu = sinon.spy();
        manager._createRenderer(GSPLAT_RENDERER_EXTERNAL);
        manager.setRenderMode(GSPLAT_FORWARD);
        return manager;
    };

    it('creates a renderer without material, sort or bounds', function () {
        const manager = makeManager();
        expect(manager.renderer).to.be.an.instanceof(GSplatExternalRenderer);
        expect(manager.activeRenderer).to.equal(GSPLAT_RENDERER_EXTERNAL);
        expect(manager.material).to.equal(null);
        expect(manager.cpuSorter).to.equal(null);
        expect(manager._hybridScratch).to.equal(null);
        expect(manager.renderer.requiresCpuSort).to.equal(false);
        expect(manager.renderer.requiresBounds).to.equal(false);
    });

    it('bakes the world without uploading bounds or sorting', function () {
        const manager = makeManager();
        expect(manager.update()).to.equal(100);

        expect(manager.world.markSorted.calledOnce).to.equal(true);
        expect(manager.world.markSorted.firstCall.args[3]).to.equal(false);
        expect(manager.world.bake.calledOnce).to.equal(true);
        expect(manager.world.bake.firstCall.args[2]).to.equal(false);
        expect(manager.sortCpu.called).to.equal(false);
        expect(manager.director.eventHandler.fire.calledWith('frame:ready')).to.equal(true);
    });

    it('casts no shadows', function () {
        const manager = makeManager();
        manager.setRenderMode(GSPLAT_FORWARD | GSPLAT_SHADOW);
        expect(manager.shadowRenderer).to.equal(null);
    });

    it('frees the GPU-sort resources when switched to at runtime', function () {
        const manager = makeManager();
        const hybrid = { destroy: sinon.spy() };
        const shadow = { destroy: sinon.spy() };
        const scratch = { destroy: sinon.spy() };
        Object.assign(manager, {
            renderer: hybrid,
            shadowRenderer: shadow,
            _hybridScratch: scratch,
            renderMode: GSPLAT_FORWARD | GSPLAT_SHADOW,
            activeRenderer: GSPLAT_RENDERER_RASTER_GPU_SORT
        });

        manager.prepareRendererMode();

        expect(manager.renderer).to.be.an.instanceof(GSplatExternalRenderer);
        expect(hybrid.destroy.calledOnce).to.equal(true);
        expect(shadow.destroy.calledOnce).to.equal(true);
        expect(scratch.destroy.calledOnce).to.equal(true);
        expect(manager.shadowRenderer).to.equal(null);
        expect(manager._hybridScratch).to.equal(null);
    });
});

describe('GSplatWorkBuffer order buffer', function () {

    // A WebGPU work buffer with stubbed render targets and a device that tracks storage buffers.
    const makeWorkBuffer = () => {
        const dims = { x: 1, y: 1 };
        const workBuffer = Object.create(GSplatWorkBuffer.prototype);
        Object.assign(workBuffer, {
            device: {
                isWebGPU: true,
                buffers: new Set(),
                _vram: { sb: 0 },
                createBufferImpl: () => ({ allocate() {}, destroy() {} })
            },
            renderTarget: { resize() {} },
            colorRenderTarget: { resize() {} },
            streams: {
                textureDimensions: dims,
                resize: (w, h) => {
                    dims.x = w;
                    dims.y = h;
                }
            },
            uploadStream: { upload: sinon.spy() }
        });
        workBuffer.orderBuffer = { byteSize: 4, destroy: sinon.spy() };
        return workBuffer;
    };

    it('does not grow on resize', function () {
        const workBuffer = makeWorkBuffer();
        workBuffer.resize(256);
        expect(workBuffer.orderBuffer.byteSize).to.equal(4);
    });

    it('grows to the texture size on the first order upload', function () {
        const workBuffer = makeWorkBuffer();
        workBuffer.resize(256);
        const data = new Uint32Array(1000);
        workBuffer.setOrderData(data);

        expect(workBuffer.orderBuffer.byteSize).to.equal(256 * 256 * 4);
        const [uploaded, target, offset, count] = workBuffer.uploadStream.upload.firstCall.args;
        expect(uploaded).to.equal(data);
        expect(target).to.equal(workBuffer.orderBuffer);
        expect(offset).to.equal(0);
        expect(count).to.equal(1000);
    });

    it('keeps the buffer while it is large enough', function () {
        const workBuffer = makeWorkBuffer();
        workBuffer.resize(256);
        workBuffer.setOrderData(new Uint32Array(1000));
        const buffer = workBuffer.orderBuffer;

        workBuffer.resize(128);
        workBuffer.setOrderData(new Uint32Array(500));
        expect(workBuffer.orderBuffer).to.equal(buffer);
    });
});
