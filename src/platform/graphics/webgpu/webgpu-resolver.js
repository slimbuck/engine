import { Shader } from '../shader.js';
import { DEPTHRESOLVE_MAX, DEPTHRESOLVE_MIN, DEPTHRESOLVE_SAMPLE0, SHADERLANGUAGE_WGSL } from '../constants.js';
import { Debug, DebugHelper } from '../../../core/debug.js';
import { DebugGraphics } from '../debug-graphics.js';
import webgpuDepthResolve from '../shader-chunks/frag/webgpu-depth-resolve.js';
import webgpuDepthCopy from '../shader-chunks/frag/webgpu-depth-copy.js';

/**
 * @import { WebgpuGraphicsDevice } from './webgpu-graphics-device.js'
 * @import { WebgpuShader } from './webgpu-shader.js'
 */

/**
 * A WebGPU helper class implementing custom resolve of multi-sampled textures, and copies of depth
 * textures into depth textures.
 *
 * @ignore
 */
class WebgpuResolver {
    /** @type {WebgpuGraphicsDevice} */
    device;

    /**
     * Cache of render pipelines for each texture format and depth resolve mode, to avoid their
     * per frame creation.
     *
     * @type {Map<string, GPURenderPipeline>}
     * @private
     */
    pipelineCache = new Map();

    /**
     * Cache of shaders for each depth resolve mode (DEPTHRESOLVE_***).
     *
     * @type {Map<string, Shader>}
     * @private
     */
    shaderCache = new Map();

    constructor(device) {
        this.device = device;
    }

    destroy() {
        this.shaderCache.forEach(shader => shader.destroy());
        this.shaderCache = null;
        this.pipelineCache = null;
    }

    /**
     * @param {string} mode - The depth resolve mode (DEPTHRESOLVE_***).
     * @returns {Shader} Shader for the given resolve mode.
     * @private
     */
    getShader(mode) {
        Debug.assert(mode === DEPTHRESOLVE_SAMPLE0 || mode === DEPTHRESOLVE_MIN || mode === DEPTHRESOLVE_MAX, `Invalid depth resolve mode '${mode}'`);
        let shader = this.shaderCache.get(mode);
        if (!shader) {
            // the resolve mode is selected by a define, handled by the shader preprocessor
            const code = `#define DEPTH_RESOLVE_${mode.toUpperCase()}\n${webgpuDepthResolve}`;
            shader = new Shader(this.device, {
                name: `WebGPUResolverDepthShader-${mode}`,
                shaderLanguage: SHADERLANGUAGE_WGSL,
                vshader: code,
                fshader: code
            });
            this.shaderCache.set(mode, shader);
        }
        return shader;
    }

    /**
     * @param {GPUTextureFormat} format - Texture format.
     * @param {string} mode - The depth resolve mode (DEPTHRESOLVE_***).
     * @returns {GPURenderPipeline} Pipeline for the given format and resolve mode.
     * @private
     */
    getPipeline(format, mode) {
        const key = `${format}-${mode}`;
        let pipeline = this.pipelineCache.get(key);
        if (!pipeline) {
            pipeline = this.createPipeline(format, mode);
            this.pipelineCache.set(key, pipeline);
        }
        return pipeline;
    }

    /**
     * @param {GPUTextureFormat} format - Texture format.
     * @param {string} mode - The depth resolve mode (DEPTHRESOLVE_***).
     * @returns {GPURenderPipeline} Pipeline for the given format and resolve mode.
     * @private
     */
    createPipeline(format, mode) {

        /** @type {WebgpuShader} */
        const webgpuShader = this.getShader(mode).impl;

        const pipeline = this.device.wgpu.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: webgpuShader.getVertexShaderModule(),
                entryPoint: webgpuShader.vertexEntryPoint
            },
            fragment: {
                module: webgpuShader.getFragmentShaderModule(),
                entryPoint: webgpuShader.fragmentEntryPoint,
                targets: [{
                    format: format
                }]
            },
            primitive: {
                topology: 'triangle-strip'
            }
        });
        DebugHelper.setLabel(pipeline, `RenderPipeline-DepthResolver-${format}-${mode}`);
        return pipeline;
    }

    /**
     * @param {GPUCommandEncoder} commandEncoder - Command encoder to use for the resolve.
     * @param {GPUTexture} sourceTexture - Source multi-sampled depth texture to resolve.
     * @param {GPUTexture} destinationTexture - Destination depth texture to resolve to.
     * @param {string} [mode] - The depth resolve mode (DEPTHRESOLVE_***). Defaults to
     * {@link DEPTHRESOLVE_MIN}.
     * @private
     */
    resolveDepth(commandEncoder, sourceTexture, destinationTexture, mode = DEPTHRESOLVE_MIN) {

        Debug.assert(sourceTexture.sampleCount > 1);
        Debug.assert(destinationTexture.sampleCount === 1);
        Debug.assert(sourceTexture.depthOrArrayLayers === destinationTexture.depthOrArrayLayers);

        const device = this.device;
        const wgpu = device.wgpu;

        // pipeline depends on the format and the resolve mode
        const pipeline = this.getPipeline(destinationTexture.format, mode);

        DebugGraphics.pushGpuMarker(device, 'DEPTH_RESOLVE-RENDERER');

        const numFaces = sourceTexture.depthOrArrayLayers;
        for (let face = 0; face < numFaces; face++) {

            // copy depth only (not stencil)
            const srcView = sourceTexture.createView({
                dimension: '2d',
                aspect: 'depth-only',
                baseMipLevel: 0,
                mipLevelCount: 1,
                baseArrayLayer: face
            });

            const dstView = destinationTexture.createView({
                dimension: '2d',
                baseMipLevel: 0,
                mipLevelCount: 1,
                baseArrayLayer: face
            });

            const passEncoder = commandEncoder.beginRenderPass({
                colorAttachments: [{
                    view: dstView,
                    loadOp: 'clear',
                    storeOp: 'store'
                }]
            });
            DebugHelper.setLabel(passEncoder, 'DepthResolve-PassEncoder');

            // no need for a sampler when using textureLoad
            const bindGroup = wgpu.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [{
                    binding: 0,
                    resource: srcView
                }]
            });

            passEncoder.setPipeline(pipeline);
            passEncoder.setBindGroup(0, bindGroup);
            passEncoder.draw(4);
            passEncoder.end();
        }

        DebugGraphics.popGpuMarker(device);

        // clear invalidated state
        device.pipeline = null;
    }

    /**
     * @param {boolean} multisampled - Whether the source depth texture is multi-sampled.
     * @returns {Shader} Shader copying a depth texture into a depth target.
     * @private
     */
    getCopyShader(multisampled) {
        const key = multisampled ? 'copy-multisampled' : 'copy';
        let shader = this.shaderCache.get(key);
        if (!shader) {
            const code = `${multisampled ? '#define DEPTH_COPY_MULTISAMPLED\n' : ''}${webgpuDepthCopy}`;
            shader = new Shader(this.device, {
                name: `WebGPUResolverDepthShader-${key}`,
                shaderLanguage: SHADERLANGUAGE_WGSL,
                vshader: code,
                fshader: code
            });
            this.shaderCache.set(key, shader);
        }
        return shader;
    }

    /**
     * @param {GPUTextureFormat} format - Destination depth format.
     * @param {boolean} multisampled - Whether the source depth texture is multi-sampled.
     * @returns {GPURenderPipeline} Pipeline copying depth into the given format.
     * @private
     */
    getCopyPipeline(format, multisampled) {
        const key = `copy-${format}-${multisampled}`;
        let pipeline = this.pipelineCache.get(key);
        if (!pipeline) {

            /** @type {WebgpuShader} */
            const webgpuShader = this.getCopyShader(multisampled).impl;

            pipeline = this.device.wgpu.createRenderPipeline({
                layout: 'auto',
                vertex: {
                    module: webgpuShader.getVertexShaderModule(),
                    entryPoint: webgpuShader.vertexEntryPoint
                },
                fragment: {
                    module: webgpuShader.getFragmentShaderModule(),
                    entryPoint: webgpuShader.fragmentEntryPoint,
                    targets: []
                },
                primitive: {
                    topology: 'triangle-strip'
                },
                depthStencil: {
                    format: format,
                    depthWriteEnabled: true,
                    depthCompare: 'always'
                }
            });
            DebugHelper.setLabel(pipeline, `RenderPipeline-DepthCopy-${format}-${multisampled}`);
            this.pipelineCache.set(key, pipeline);
        }
        return pipeline;
    }

    /**
     * Copies the depth of a depth texture into a depth texture of the same size which cannot be
     * the destination of a texture copy, such as a WebXR projection layer's: the nearest of a
     * multi-sampled source's samples. Stencil is not copied.
     *
     * @param {GPUCommandEncoder} commandEncoder - Command encoder to use for the copy.
     * @param {GPUTexture} sourceTexture - Source depth texture, single or multi-sampled.
     * @param {GPUTexture} destinationTexture - Destination single-sampled depth texture.
     * @param {GPUTextureViewDescriptor} [destinationViewDescriptor] - The slice of the destination
     * to copy into.
     * @private
     */
    copyDepth(commandEncoder, sourceTexture, destinationTexture, destinationViewDescriptor) {

        Debug.assert(destinationTexture.sampleCount === 1);
        Debug.assert(sourceTexture.width === destinationTexture.width && sourceTexture.height === destinationTexture.height);

        const device = this.device;
        const multisampled = sourceTexture.sampleCount > 1;
        const pipeline = this.getCopyPipeline(destinationTexture.format, multisampled);

        DebugGraphics.pushGpuMarker(device, 'DEPTH_COPY');

        const srcView = sourceTexture.createView({
            dimension: '2d',
            aspect: 'depth-only',
            baseMipLevel: 0,
            mipLevelCount: 1
        });

        /** @type {GPURenderPassDepthStencilAttachment} */
        const depthStencilAttachment = {
            view: destinationTexture.createView(destinationViewDescriptor),
            depthClearValue: 1,
            depthLoadOp: 'clear',
            depthStoreOp: 'store'
        };
        if (destinationTexture.format.includes('stencil')) {
            depthStencilAttachment.stencilLoadOp = 'clear';
            depthStencilAttachment.stencilStoreOp = 'store';
        }

        const passEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [],
            depthStencilAttachment
        });
        DebugHelper.setLabel(passEncoder, 'DepthCopy-PassEncoder');

        const bindGroup = device.wgpu.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: srcView
            }]
        });

        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.draw(4);
        passEncoder.end();

        DebugGraphics.popGpuMarker(device);

        // clear invalidated state
        device.pipeline = null;
    }
}

export { WebgpuResolver };
