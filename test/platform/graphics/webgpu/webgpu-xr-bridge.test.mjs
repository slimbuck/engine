import { expect } from 'chai';

import { EventHandler } from '../../../../src/core/event-handler.js';
import { WebgpuXrBridge } from '../../../../src/platform/graphics/webgpu/webgpu-xr-bridge.js';
import { XrBridge } from '../../../../src/platform/graphics/xr-bridge.js';

describe('WebgpuXrBridge', function () {

    // the projection layers created, by their options
    let layers;
    let previousBinding;

    beforeEach(function () {
        layers = [];
        previousBinding = globalThis.XRGPUBinding;
        globalThis.XRGPUBinding = class {
            getPreferredColorFormat() {
                return 'bgra8unorm';
            }

            createProjectionLayer(options) {
                layers.push(options);
                return { options };
            }
        };
    });

    afterEach(function () {
        globalThis.XRGPUBinding = previousBinding;
    });

    const createBridge = () => {
        const device = {
            wgpu: {},
            on: () => ({ off() {} }),
            _clearXrState() {},
            createXrBridgeImpl: bridge => new WebgpuXrBridge(bridge)
        };
        return new XrBridge(device, new EventHandler());
    };

    const session = {
        renderState: { depthNear: 0.1, depthFar: 1000 },
        updateRenderState() {}
    };

    // the bridge recreates the presentation a task after the device is restored
    const restore = async (bridge) => {
        bridge.impl.onGraphicsDeviceLost();
        bridge.impl.onGraphicsDeviceRestored();
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
    };

    it('keeps the depth of the projection layer when the device is restored', async function () {
        const bridge = createBridge();
        bridge.attachPresentation(session, { framebufferScaleFactor: 1, depthNear: 0.1, depthFar: 1000, depthFormat: 'depth24plus' });
        expect(layers[0].depthStencilFormat).to.equal('depth24plus');

        await restore(bridge);
        expect(layers).to.have.length(2);
        expect(layers[1].depthStencilFormat).to.equal('depth24plus');
    });

    it('keeps a projection layer without depth when the device is restored', async function () {
        const bridge = createBridge();
        bridge.attachPresentation(session, { framebufferScaleFactor: 1, depthNear: 0.1, depthFar: 1000, depthFormat: null });
        expect(layers[0].depthStencilFormat).to.be.undefined;

        await restore(bridge);
        expect(layers).to.have.length(2);
        expect(layers[1].depthStencilFormat).to.be.undefined;
    });
});
