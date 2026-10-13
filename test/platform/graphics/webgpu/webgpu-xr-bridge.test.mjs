import { expect } from 'chai';
import sinon from 'sinon';

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

            // a view's sub-image: a slice of the layer's color and, where the layer has one, depth
            getViewSubImage(layer, view) {
                return {
                    colorTexture: { width: 64, height: 64, format: 'bgra8unorm' },
                    depthStencilTexture: layer.options.depthStencilFormat ? { format: layer.options.depthStencilFormat } : null,
                    viewport: { x: 0, y: 0, width: 64, height: 64 },
                    getViewDescriptor: () => ({ baseArrayLayer: view.index })
                };
            }
        };
    });

    afterEach(function () {
        globalThis.XRGPUBinding = previousBinding;
        sinon.restore();
    });

    const createBridge = () => {
        const device = {
            wgpu: {},
            xrSubImages: [],
            resolver: { clearDepth: sinon.spy() },
            on: () => ({ off() {} }),
            getCommandEncoder: () => ({}),
            setXrBackBufferFormat() {},
            _clearXrState() {
                this.xrSubImages.length = 0;
            },
            createXrBridgeImpl: bridge => new WebgpuXrBridge(bridge)
        };
        return new XrBridge(device, new EventHandler());
    };

    const session = {
        renderState: { depthNear: 0.1, depthFar: 1000 },
        updateRenderState() {}
    };

    const attach = (bridge, depthFormat) => {
        bridge.attachPresentation(session, { framebufferScaleFactor: 1, depthNear: 0.1, depthFar: 1000, depthFormat });
    };

    // an XR frame whose viewer pose has the given number of views
    const frame = viewCount => ({
        getViewerPose: () => ({ views: Array.from({ length: viewCount }, (_, index) => ({ index })) })
    });

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
        attach(bridge, 'depth24plus');
        expect(layers[0].depthStencilFormat).to.equal('depth24plus');

        await restore(bridge);
        expect(layers).to.have.length(2);
        expect(layers[1].depthStencilFormat).to.equal('depth24plus');
    });

    it('keeps a projection layer without depth when the device is restored', async function () {
        const bridge = createBridge();
        attach(bridge, null);
        expect(layers[0].depthStencilFormat).to.be.undefined;

        await restore(bridge);
        expect(layers).to.have.length(2);
        expect(layers[1].depthStencilFormat).to.be.undefined;
    });

    it('clears the depth of a single view to the far plane', function () {
        const bridge = createBridge();
        attach(bridge, 'depth24plus');
        bridge.impl.beginFrame(frame(1), {});

        const { clearDepth } = bridge.device.resolver;
        const sub = bridge.device.xrSubImages[0];
        expect(clearDepth.calledOnce).to.be.true;
        expect(clearDepth.firstCall.args[1]).to.equal(sub.depthTexture);
        expect(clearDepth.firstCall.args[2]).to.equal(sub.depthViewDescriptor);
    });

    it('leaves the depth of several views to their passes', function () {
        const bridge = createBridge();
        attach(bridge, 'depth24plus');
        bridge.impl.beginFrame(frame(2), {});
        expect(bridge.device.xrSubImages).to.have.length(2);
        expect(bridge.device.resolver.clearDepth.called).to.be.false;
    });

    it('clears no depth for a view without one', function () {
        const bridge = createBridge();
        attach(bridge, null);
        bridge.impl.beginFrame(frame(1), {});
        expect(bridge.device.resolver.clearDepth.called).to.be.false;
    });
});
