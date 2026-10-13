import { Debug, DebugHelper } from '../../../core/debug.js';
import { StringIds } from '../../../core/string-ids.js';
import { getMultisampledTextureCache } from '../multi-sampled-texture-cache.js';
import { validateClearValues } from '../render-pass.js';
import { WebgpuDebug } from './webgpu-debug.js';

/**
 * @import { RenderPass } from '../render-pass.js'
 * @import { RenderTarget } from '../render-target.js'
 * @import { WebgpuGraphicsDevice } from '../webgpu/webgpu-graphics-device.js'
 */

const stringIds = new StringIds();

/**
 * Private class storing info about color buffer.
 *
 * @private
 */
class ColorAttachment {
    /**
     * @type {GPUTextureFormat}
     * @private
     */
    format;

    /**
     * @type {GPUTexture}
     * @private
     */
    multisampledBuffer;

    /**
     * True if the multi-sampled buffer is a transient ("memoryless") attachment, and so must be
     * cleared on load and discarded on store.
     *
     * @type {boolean}
     */
    transient = false;

    /**
     * View of the resolve buffer of an explicit multisampled attachment, used to attach / detach
     * the resolve target based on the per-pass resolve flag. The underlying texture is user-owned.
     *
     * @type {GPUTextureView|undefined}
     * @private
     */
    resolveView;

    destroy(device) {
        device.deferDestroy(this.multisampledBuffer);
        this.multisampledBuffer = null;
        this.resolveView = undefined;
    }
}

/**
 * Private class storing info about depth-stencil buffer.
 *
 * @private
 */
class DepthAttachment {
    /**
     * @type {GPUTextureFormat}
     * @private
     */
    format;

    /** @type {boolean} */
    hasStencil;

    /**
     * @type {GPUTexture|null}
     * @private
     */
    depthTexture = null;

    /**
     * True if the depthTexture is internally allocated / owned
     */
    depthTextureInternal = false;

    /**
     * Multi-sampled depth buffer allocated over the user provided depth buffer.
     *
     * @type {GPUTexture|null}
     * @private
     */
    multisampledDepthBuffer = null;

    /**
     * Key used to store multisampledDepthBuffer in the cache.
     */
    multisampledDepthBufferKey;

    /**
     * True if the depth attachment is a transient ("memoryless") attachment, and so must be
     * cleared on load and discarded on store.
     *
     * @type {boolean}
     */
    transient = false;

    /**
     * The view rendering writes to: the depth texture's, or the multi-sampled buffer's.
     *
     * @type {GPUTextureView|null}
     * @private
     */
    renderingView = null;

    /**
     * The format of the internal depth buffer, while {@link format} is an assigned texture's.
     *
     * @type {string|null}
     * @private
     */
    internalFormat = null;

    /**
     * @param {string} gpuFormat - The WebGPU format (GPUTextureFormat).
     */
    constructor(gpuFormat) {
        Debug.assert(gpuFormat);
        this.format = gpuFormat;
        this.hasStencil = gpuFormat === 'depth24plus-stencil8';
    }

    destroy(device) {
        if (this.depthTextureInternal) {
            device.deferDestroy(this.depthTexture);
            this.depthTexture = null;
        }

        // release multi-sampled depth buffer
        if (this.multisampledDepthBuffer) {

            this.multisampledDepthBuffer = null;

            // release reference to the texture, as its ref-counted
            getMultisampledTextureCache(device).release(this.multisampledDepthBufferKey);
        }
    }
}

/**
 * A WebGPU implementation of the RenderTarget.
 *
 * @ignore
 */
class WebgpuRenderTarget {
    /** @type {boolean} */
    initialized = false;

    /**
     * Unique key used by render pipeline creation
     *
     * @type {number}
     */
    key;

    /** @type {ColorAttachment[]} */
    colorAttachments = [];

    /** @type {DepthAttachment|null} */
    depthAttachment = null;

    /**
     * Texture assigned each frame, and not owned by this render target. This is used on the
     * framebuffer to assign per frame texture obtained from the context.
     *
     * @type {GPUTexture}
     * @private
     */
    assignedColorTexture = null;

    /**
     * Depth texture assigned per XR view, and not owned by this render target: the WebXR
     * projection layer's depth, which the compositor reads to reproject a late frame. Null while
     * the render target renders into its own depth buffer.
     *
     * @type {GPUTexture|null}
     * @private
     */
    assignedDepthTexture = null;

    /**
     * A depth buffer of this render target's own format and sample count, which the views of an
     * XR session render into where they cannot render into the projection layer's depth, and which
     * is copied into it after each view (see {@link WebgpuRenderTarget#beginXrViewDepth}).
     *
     * @type {GPUTexture|null}
     * @private
     */
    xrDepthCopyTexture = null;

    /**
     * How the current XR view's depth reaches the projection layer: 'direct', 'copy' or 'clear'
     * (see {@link WebgpuRenderTarget#beginXrViewDepth}), or null outside a view.
     *
     * @type {string|null}
     * @private
     */
    xrViewDepth = null;

    /**
     * Render pass descriptor used when starting a render pass for this render target.
     *
     * @type {GPURenderPassDescriptor}
     * @private
     */
    renderPassDescriptor = {};

    /**
     * True if this is the backbuffer of the device.
     */
    isBackbuffer = false;

    /**
     * @param {RenderTarget} renderTarget - The render target owning this implementation.
     */
    constructor(renderTarget) {
        this.renderTarget = renderTarget;
    }

    /**
     * Release associated resources. Note that this needs to leave this instance in a state where
     * it can be re-initialized again, which is used by render target resizing.
     *
     * @param {WebgpuGraphicsDevice} device - The graphics device.
     */
    destroy(device) {
        this.initialized = false;

        this.assignedColorTexture = null;
        this.assignedDepthTexture = null;

        if (this.xrDepthCopyTexture) {
            device.deferDestroy(this.xrDepthCopyTexture);
            this.xrDepthCopyTexture = null;
        }

        this.colorAttachments.forEach((colorAttachment) => {
            colorAttachment.destroy(device);
        });
        this.colorAttachments.length = 0;

        this.depthAttachment?.destroy(device);
        this.depthAttachment = null;
    }

    updateKey() {
        const rt = this.renderTarget;

        // key used by render pipeline creation
        let key = `${rt.samples}:${this.depthAttachment ? this.depthAttachment.format : 'nodepth'}`;
        this.colorAttachments.forEach((colorAttachment) => {
            key += `:${colorAttachment.format}`;
        });

        // convert string to a unique number
        this.key = stringIds.get(key);
    }

    /**
     * Assign a color buffer. This allows the color buffer of the main framebuffer
     * to be swapped each frame to a buffer provided by the context.
     *
     * @param {any} gpuTexture - // `GPUTexture`; using `any` to avoid exporting WebGPU types in published typings.
     * @param {any} viewFormat - // `GPUTextureFormat`; using `any` to avoid exporting WebGPU types in published typings (may differ from texture storage for sRGB).
     */
    assignColorTexture(gpuTexture, viewFormat) {

        Debug.assert(gpuTexture);
        this.assignedColorTexture = gpuTexture;

        const wgpuDevice = /** @type {WebgpuGraphicsDevice} */ (this.renderTarget.device);
        const xrViewDesc = wgpuDevice?.xrColorTextureViewDescriptor;
        const xrSlice = xrViewDesc && gpuTexture === wgpuDevice.xrColorTexture;
        // When the WebXR runtime supplies a per-eye view descriptor, pass it through as-is.
        // The descriptor already carries the runtime's intended `format` (e.g. an sRGB view
        // format over a linear texture) along with the per-eye slice selection — merging an
        // override on top would discard the runtime's chosen format.
        const view = gpuTexture.createView(
            xrSlice ? xrViewDesc : { format: viewFormat }
        );
        DebugHelper.setLabel(view, xrSlice ? 'Framebuffer.xrColorTextureView' : 'Framebuffer.contextColorTextureView');

        // use it as render buffer or resolve target
        const colorAttachment = this.renderPassDescriptor.colorAttachments[0];
        const samples = this.renderTarget.samples;
        if (samples > 1) {
            colorAttachment.resolveTarget = view;
        } else {
            colorAttachment.view = view;
        }

        // for main framebuffer, this is how the format is obtained
        this.setColorAttachment(0, undefined, viewFormat);

        this.updateKey();
    }

    /**
     * Assign a depth buffer, the main framebuffer's equivalent of {@link assignColorTexture}: a
     * depth texture for the current XR view, rendered into in place of the internal depth buffer,
     * or null to render into the internal depth buffer again. The texture must have the render
     * target's sample count, and a stencil aspect if the render target has stencil, as the render
     * pipelines then emit stencil state. Does nothing for a render target without a depth buffer
     * or one not initialized yet.
     *
     * @param {any} gpuTexture - // `GPUTexture|null`; using `any` to avoid exporting WebGPU types in published typings.
     * @param {any} [viewDescriptor] - // `GPUTextureViewDescriptor`; the view's slice of an array texture.
     * @returns {boolean} True if the texture is rendered into from now on.
     */
    assignDepthTexture(gpuTexture, viewDescriptor) {
        const attachment = this.renderPassDescriptor.depthStencilAttachment;
        if (!attachment || !this.depthAttachment) {
            return false;
        }
        Debug.assert(!gpuTexture || gpuTexture.sampleCount === this.renderTarget.samples,
            'An assigned depth texture must have the render target\'s sample count.');
        Debug.assert(!gpuTexture || !this.renderTarget.stencil || gpuTexture.format.includes('stencil'),
            'An assigned depth texture needs a stencil aspect when the render target has stencil.');
        if (!gpuTexture && !this.assignedDepthTexture) {
            return true;
        }

        // the render pipelines take their depth format from the attachment, and the assigned
        // texture's can differ from the internal buffer's
        const depth = this.depthAttachment;
        depth.internalFormat ??= depth.format;
        this.assignedDepthTexture = gpuTexture ?? null;
        if (gpuTexture) {
            const view = gpuTexture.createView(viewDescriptor);
            DebugHelper.setLabel(view, 'Framebuffer.xrDepthTextureView');
            attachment.view = view;
            depth.format = gpuTexture.format;
        } else {
            attachment.view = depth.renderingView;
            depth.format = depth.internalFormat;
            depth.internalFormat = null;
        }
        depth.hasStencil = depth.format.includes('stencil');

        this.updateKey();
        return true;
    }

    /**
     * Prepares the depth of an XR view whose projection layer has a depth texture, which the
     * compositor reads to reproject a frame that misses its display time for the head's movement
     * as well as its rotation. Called on the framebuffer before the view's passes render, and
     * {@link WebgpuRenderTarget#endXrViewDepth} after them. A single-sampled framebuffer renders
     * its depth straight into the layer's, unless it has stencil and the layer's format does not
     * (Safari's is depth24plus). Otherwise it renders into a depth buffer of its own kind, multi-
     * sampled or with stencil, which is then copied into the layer's. Where the layer takes no
     * scene depth (XrManager#submitDepth off), the scene's depth does not reach the
     * framebuffer (a camera's own frame passes render the scene into a target of their own), or
     * the framebuffer has no depth buffer yet, the layer's depth is cleared to the far plane, so
     * the compositor reprojects the view by its rotation alone rather than by unrelated contents.
     *
     * @param {any} sub - The view's sub-image, an entry of `device.xrSubImages` with a depth texture.
     * @param {boolean} sceneDepth - Whether the layer takes the scene's depth, and the view's
     * passes render it into the framebuffer.
     */
    beginXrViewDepth(sub, sceneDepth) {
        const { samples, stencil } = this.renderTarget;
        const layerStencil = sub.depthTexture.format.includes('stencil');
        if (sceneDepth && samples === 1 && (!stencil || layerStencil) &&
            this.assignDepthTexture(sub.depthTexture, sub.depthViewDescriptor)) {
            this.xrViewDepth = 'direct';
        } else if (sceneDepth && this.depthAttachment && this.assignDepthTexture(this.getXrDepthCopyTexture())) {
            this.xrViewDepth = 'copy';
        } else {
            this.xrViewDepth = 'clear';
        }
    }

    /**
     * Completes the depth of an XR view after its passes have rendered: copies it into the
     * projection layer's, or clears the layer's (see {@link WebgpuRenderTarget#beginXrViewDepth}).
     *
     * @param {any} sub - The view's sub-image, an entry of `device.xrSubImages` with a depth texture.
     */
    endXrViewDepth(sub) {
        const device = /** @type {WebgpuGraphicsDevice} */ (this.renderTarget.device);
        const { depthTexture, depthViewDescriptor } = sub;
        if (this.xrViewDepth === 'copy') {
            device.resolver.copyDepth(device.getCommandEncoder(), this.xrDepthCopyTexture, depthTexture, depthViewDescriptor);
        } else if (this.xrViewDepth === 'clear') {
            device.resolver.clearDepth(device.getCommandEncoder(), depthTexture, depthViewDescriptor);
        }
        this.xrViewDepth = null;
    }

    /**
     * @returns {GPUTexture} The depth buffer XR views render into where they cannot render into
     * the projection layer's depth (see {@link WebgpuRenderTarget#beginXrViewDepth}), created to
     * match the render target's own.
     * @private
     */
    getXrDepthCopyTexture() {
        const { width, height, samples } = this.renderTarget;
        const device = /** @type {WebgpuGraphicsDevice} */ (this.renderTarget.device);
        const format = this.depthAttachment.internalFormat ?? this.depthAttachment.format;
        let texture = this.xrDepthCopyTexture;
        if (!texture || texture.width !== width || texture.height !== height ||
            texture.sampleCount !== samples || texture.format !== format) {
            if (texture) {
                device.deferDestroy(texture);
            }
            texture = device.wgpu.createTexture({
                size: [width, height, 1],
                dimension: '2d',
                sampleCount: samples,
                format,
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
            });
            DebugHelper.setLabel(texture, `${this.renderTarget.name}.xrDepthCopyTexture`);
            this.xrDepthCopyTexture = texture;
        }
        return texture;
    }

    setColorAttachment(index, multisampledBuffer, format) {
        if (!this.colorAttachments[index]) {
            this.colorAttachments[index] = new ColorAttachment();
        }

        if (multisampledBuffer) {
            this.colorAttachments[index].multisampledBuffer = multisampledBuffer;
        }

        if (format) {
            this.colorAttachments[index].format = format;
        }
    }

    /**
     * Initialize render target for rendering one time.
     *
     * @param {WebgpuGraphicsDevice} device - The graphics device.
     * @param {RenderTarget} renderTarget - The render target.
     */
    init(device, renderTarget) {

        const wgpu = device.wgpu;
        Debug.assert(!this.initialized);

        WebgpuDebug.memory(device);
        WebgpuDebug.validate(device);

        // initialize depth/stencil
        this.initDepthStencil(device, wgpu, renderTarget);

        // initialize color attachments

        // color formats are based on the textures
        if (renderTarget._colorBuffers) {
            renderTarget._colorBuffers.forEach((colorBuffer, index) => {
                this.setColorAttachment(index, undefined, colorBuffer.impl.format);
            });
        }

        this.renderPassDescriptor.colorAttachments = [];
        const count = this.isBackbuffer ? 1 : (renderTarget._colorBuffers?.length ?? 0);
        for (let i = 0; i < count; ++i) {
            const colorAttachment = this.initColor(device, wgpu, renderTarget, i);

            // default framebuffer, buffer gets assigned later
            const isDefaultFramebuffer = i === 0 && this.colorAttachments[0]?.format;

            // if we have a color buffer, or is the default framebuffer
            if (colorAttachment.view || isDefaultFramebuffer) {
                this.renderPassDescriptor.colorAttachments.push(colorAttachment);
            }
        }

        this.updateKey();

        this.initialized = true;

        WebgpuDebug.end(device, 'RenderTarget initialization', { renderTarget });
        WebgpuDebug.end(device, 'RenderTarget initialization', { renderTarget });
    }

    initDepthStencil(device, wgpu, renderTarget) {

        const { samples, width, height, depth, depthBuffer } = renderTarget;

        // depth buffer that we render to (single or multi-sampled). We don't create resolve
        // depth buffer as we don't currently resolve it. This might need to change in the future.
        if (depth || depthBuffer) {

            // the depth texture view the rendering will write to
            let renderingView;

            // allocate depth buffer if not provided
            if (!depthBuffer) {

                // TODO: support rendering to 32bit depth without a stencil as well
                this.depthAttachment = new DepthAttachment('depth24plus-stencil8');

                /** @type {GPUTextureDescriptor} */
                const depthTextureDesc = {
                    size: [width, height, 1],
                    dimension: '2d',
                    sampleCount: samples,
                    format: this.depthAttachment.format,
                    usage: GPUTextureUsage.RENDER_ATTACHMENT
                };

                // transient (memoryless) depth - keep the contents on-chip only, which precludes
                // sampling (resolve) or copying (grab) it. The RT flag is already gated on device support.
                const transientDepth = renderTarget.transientDepth;

                if (transientDepth) {
                    // memoryless attachment: RENDER_ATTACHMENT only, never sampled or copied.
                    //
                    // Transient-attachment validation invariants, all satisfied here and which must
                    // be preserved by any future edit:
                    // - no `viewFormats` on this descriptor (must be an empty array for transient textures);
                    // - the view below is created with no `usage` override (a view cannot change a
                    //   transient texture's usage);
                    // - this texture is only ever a depth render `view`, never a `resolveTarget`
                    //   (depth resolve/grab is additionally blocked while transient - see
                    //   WebgpuGraphicsDevice).
                    depthTextureDesc.usage |= GPUTextureUsage.TRANSIENT_ATTACHMENT;
                    this.depthAttachment.transient = true;
                } else if (samples > 1) {
                    // enable multi-sampled depth texture to be a source of our shader based resolver in WebgpuResolver
                    // TODO: we do not always need to resolve it, and so might consider this flag to be optional
                    depthTextureDesc.usage |= GPUTextureUsage.TEXTURE_BINDING;
                } else {
                    // single sampled depth buffer can be copied out (grab pass)
                    // TODO: we should not enable this for shadow maps, as it is not needed
                    depthTextureDesc.usage |= GPUTextureUsage.COPY_SRC;
                }

                // allocate depth buffer
                const depthTexture = wgpu.createTexture(depthTextureDesc);
                DebugHelper.setLabel(depthTexture, `${renderTarget.name}.autoDepthTexture`);
                this.depthAttachment.depthTexture = depthTexture;
                this.depthAttachment.depthTextureInternal = true;

                renderingView = depthTexture.createView();
                DebugHelper.setLabel(renderingView, `${renderTarget.name}.autoDepthView`);

            } else if (depthBuffer.samples > 1) {

                // explicit multisampled depth attachment - the depth buffer is itself a
                // multisampled depth-format texture, rendered into directly. The user texture is
                // not owned by this render target.
                this.depthAttachment = new DepthAttachment(depthBuffer.impl.format);
                this.depthAttachment.depthTexture = depthBuffer.impl.gpuTexture;
                this.depthAttachment.depthTextureInternal = false;

                renderingView = depthBuffer.impl.gpuTexture.createView();
                DebugHelper.setLabel(renderingView, `${renderTarget.name}.msDepthView`);

            } else {  // use provided depth buffer

                this.depthAttachment = new DepthAttachment(depthBuffer.impl.format);

                if (samples > 1) {  // create a multi-sampled depth buffer for the provided depth buffer

                    // single-sampled depthBuffer.impl.format can be R32F in some cases, but that cannot be used as a depth
                    // buffer, only as a texture to resolve it to. We always use depth24plus-stencil8 for msaa depth buffers.
                    const depthFormat = 'depth24plus-stencil8';
                    this.depthAttachment.format = depthFormat;
                    this.depthAttachment.hasStencil = depthFormat === 'depth24plus-stencil8';

                    // key for matching multi-sampled depth buffer - render targets rendering to
                    // different faces / layers of the depth buffer need their own
                    const key = `${depthBuffer.id}:${renderTarget.getLayer(depthBuffer)}:${width}:${height}:${samples}:${depthFormat}`;

                    // check if we have already allocated a multi-sampled depth buffer for the depth buffer
                    const msTextures = getMultisampledTextureCache(device);
                    let msDepthTexture = msTextures.get(key); // this incRefs it if found
                    if (!msDepthTexture) {

                        /** @type {GPUTextureDescriptor} */
                        const multisampledDepthDesc = {
                            size: [width, height, 1],
                            dimension: '2d',
                            sampleCount: samples,
                            format: depthFormat,
                            usage: GPUTextureUsage.RENDER_ATTACHMENT |
                                // if msaa and resolve targets are different formats, we need to be able to bind the msaa target as a texture for manual shader resolve
                                (depthFormat !== depthBuffer.impl.format ? GPUTextureUsage.TEXTURE_BINDING : 0)
                        };

                        // allocate multi-sampled depth buffer
                        msDepthTexture = wgpu.createTexture(multisampledDepthDesc);
                        DebugHelper.setLabel(msDepthTexture, `${renderTarget.name}.multisampledDepth`);

                        // store it in the cache
                        msTextures.set(key, msDepthTexture);
                    }

                    this.depthAttachment.multisampledDepthBuffer = msDepthTexture;
                    this.depthAttachment.multisampledDepthBufferKey = key;

                    renderingView = msDepthTexture.createView();
                    DebugHelper.setLabel(renderingView, `${renderTarget.name}.multisampledDepthView`);

                } else {

                    // use provided depth buffer
                    this.depthAttachment.depthTexture = depthBuffer.impl.gpuTexture;

                    // render to mip level 0, as a render target with a depth buffer does not
                    // support rendering to a mip level
                    const mipLevelCount = 1;

                    // single layer view - a layer of a 2d array texture, or a cubemap face, which
                    // is a 2d array layer in order [+X, -X, +Y, -Y, +Z, -Z]
                    if (depthBuffer.cubemap || depthBuffer.array) {
                        renderingView = depthBuffer.impl.createView({
                            dimension: '2d',
                            baseArrayLayer: renderTarget.layer,
                            arrayLayerCount: 1,
                            mipLevelCount,
                            baseMipLevel: 0
                        });
                    } else {
                        renderingView = depthBuffer.impl.createView({
                            mipLevelCount,
                            baseMipLevel: 0
                        });
                    }
                    DebugHelper.setLabel(renderingView, `${renderTarget.name}.depthView`);
                }
            }

            Debug.assert(renderingView);
            this.depthAttachment.renderingView = renderingView;
            this.renderPassDescriptor.depthStencilAttachment = {
                view: renderingView
            };
        }
    }

    /**
     * @param {WebgpuGraphicsDevice} device - The graphics device.
     * @param {GPUDevice} wgpu - The WebGPU device.
     * @param {RenderTarget} renderTarget - The render target.
     * @param {number} index - The color buffer index.
     * @returns {GPURenderPassColorAttachment} The color attachment.
     * @private
     */
    initColor(device, wgpu, renderTarget, index) {
        // Single-sampled color buffer gets passed in:
        // - for normal render target, constructor takes the color buffer as an option
        // - for the main framebuffer, the device supplies the buffer each frame
        // And so we only need to create multi-sampled color buffer if needed here.
        /** @type {GPURenderPassColorAttachment} */
        const colorAttachment = {};

        const { samples, width, height, mipLevel } = renderTarget;
        const colorBuffer = renderTarget.getColorBuffer(index);

        // view used to write to the color buffer (either by rendering to it, or resolving to it)
        let colorView = null;
        if (colorBuffer) {

            // render to a single mip level
            const mipLevelCount = 1;

            // single layer view - a layer of a 2d array texture, or a cubemap face, which is a 2d
            // array layer in order [+X, -X, +Y, -Y, +Z, -Z]
            if (colorBuffer.cubemap || colorBuffer.array) {
                colorView = colorBuffer.impl.createView({
                    dimension: '2d',
                    baseArrayLayer: renderTarget.layer,
                    arrayLayerCount: 1,
                    mipLevelCount,
                    baseMipLevel: mipLevel
                });
            } else {
                // a 2d texture, or a volume texture, whose depth slice is selected by the attachment
                colorView = colorBuffer.impl.createView({
                    mipLevelCount,
                    baseMipLevel: mipLevel
                });
            }
        }

        // multi-sampled color buffer
        if (samples > 1) {

            // explicit multisampled attachment - the color buffer is itself a multisampled
            // texture, rendered into directly; the optional per-attachment resolve buffer becomes
            // the resolve target. The user texture is not owned by this render target.
            if (!this.isBackbuffer && colorBuffer?.samples > 1) {

                this.setColorAttachment(index, undefined, colorBuffer.impl.format);

                colorAttachment.view = colorView;
                DebugHelper.setLabel(colorAttachment.view, `${renderTarget.name}.msColorView`);

                const resolveBuffer = renderTarget.getResolveBuffer(index);
                if (resolveBuffer) {
                    const resolveView = resolveBuffer.impl.createView({ mipLevelCount: 1, baseMipLevel: 0 });
                    DebugHelper.setLabel(resolveView, `${renderTarget.name}.resolveView`);

                    // stored on the attachment info so setupForRenderPass can honor the per-pass
                    // resolve flag by attaching / detaching it
                    this.colorAttachments[index].resolveView = resolveView;
                    colorAttachment.resolveTarget = resolveView;
                }

                return colorAttachment;
            }

            // Main framebuffer: MSAA texture format must match the attachment view format used for
            // resolve; WebgpuGraphicsDevice#frameStart sets that on this impl via setColorAttachment
            // before the first init.
            const format = this.isBackbuffer ?
                (this.colorAttachments[index]?.format ?? device.backBufferViewFormat) :
                colorBuffer.impl.format;

            // transient (memoryless) color - the multi-sampled buffer is only ever rendered to and
            // resolved into the single-sampled target, never stored, sampled or copied, so it can be
            // kept on-chip. The RT flag is already gated on device support and MSAA.
            //
            // Transient-attachment validation invariants, all satisfied here and which must be
            // preserved by any future edit:
            // - no `viewFormats` on the descriptor below (must be an empty array for transient textures);
            // - the multi-sampled view is created with no `usage` override (a view cannot change a
            //   transient texture's usage);
            // - this multi-sampled buffer is the render `view`; the single-sampled, non-transient
            //   buffer is the `resolveTarget` - a transient texture must never be the `resolveTarget`.
            const transientColor = renderTarget.transientColor;

            /** @type {GPUTextureDescriptor} */
            const multisampledTextureDesc = {
                size: [width, height, 1],
                dimension: '2d',
                sampleCount: samples,
                format: format,
                usage: transientColor ?
                    GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TRANSIENT_ATTACHMENT :
                    GPUTextureUsage.RENDER_ATTACHMENT
            };

            // allocate multi-sampled color buffer
            const multisampledColorBuffer = wgpu.createTexture(multisampledTextureDesc);
            DebugHelper.setLabel(multisampledColorBuffer, `${renderTarget.name}.multisampledColor`);
            this.setColorAttachment(index, multisampledColorBuffer, multisampledTextureDesc.format);
            this.colorAttachments[index].transient = transientColor;

            colorAttachment.view = multisampledColorBuffer.createView();
            DebugHelper.setLabel(colorAttachment.view, `${renderTarget.name}.multisampledColorView`);

            colorAttachment.resolveTarget = colorView;

        } else {

            colorAttachment.view = colorView;

            // a volume texture renders to a depth slice of its 3d view
            if (colorBuffer?.volume) {
                colorAttachment.depthSlice = renderTarget.slice;
            }
        }

        return colorAttachment;
    }

    /**
     * Update WebGPU render pass descriptor by RenderPass settings.
     *
     * @param {RenderPass} renderPass - The render pass to start.
     * @param {RenderTarget} renderTarget - The render target to render to.
     */
    setupForRenderPass(renderPass, renderTarget) {

        Debug.assert(this.renderPassDescriptor);

        // integer formats require the clear value components to be integers representable in the
        // format, otherwise WebGPU generates a validation error
        Debug.call(() => validateClearValues(renderPass));

        const count = this.renderPassDescriptor.colorAttachments?.length ?? 0;
        for (let i = 0; i < count; ++i) {
            const colorAttachment = this.renderPassDescriptor.colorAttachments[i];
            const colorOps = renderPass.colorArrayOps[i];
            const srgb = renderTarget.isColorBufferSrgb(i);
            colorAttachment.clearValue = srgb ? colorOps.clearValueLinear : colorOps.clearValue;
            colorAttachment.loadOp = colorOps.clear ? 'clear' : 'load';
            colorAttachment.storeOp = colorOps.store ? 'store' : 'discard';

            // explicit multisampled attachment with a resolve buffer - honor the per-pass resolve
            // flag by attaching / detaching the resolve target
            if (this.colorAttachments[i]?.resolveView) {
                colorAttachment.resolveTarget = colorOps.resolve ? this.colorAttachments[i].resolveView : undefined;
            }

            // a multisampled attachment that is neither stored nor resolved produces no observable
            // output - rendering into the void. This cannot happen with default ops, only when
            // they are overridden.
            if (!this.isBackbuffer && renderTarget.samples > 1 && colorAttachment.storeOp === 'discard' && !colorAttachment.resolveTarget) {
                Debug.warnOnce(`Render target '${renderTarget.name}': multisampled color attachment ${i} is neither stored nor resolved, the rendered output is discarded.`);
            }

            // a transient (memoryless) attachment must be cleared on load and discarded on store.
            // The frame-graph store-on-no-clear optimization can flip these post-authoring (e.g. a
            // later pass reuses this target without clearing, or its contents are grabbed), which
            // would be an invalid use of a transient texture - force compliant ops to avoid a
            // WebGPU validation error (rendering may be incorrect, hence the error).
            if (this.colorAttachments[i]?.transient && (colorAttachment.loadOp !== 'clear' || colorAttachment.storeOp !== 'discard')) {
                Debug.errorOnce(`Transient (memoryless) color attachment on render target '${renderTarget.name}' requires loadOp 'clear' and storeOp 'discard', but resolved to loadOp '${colorAttachment.loadOp}' / storeOp '${colorAttachment.storeOp}'. This is usually caused by a later pass reusing this target without clearing, or by a color grab pass (sceneColorMap). Forcing clear/discard to avoid a validation error; rendering may be incorrect. Disable transientColor or stop reusing/grabbing this target.`);
                colorAttachment.loadOp = 'clear';
                colorAttachment.storeOp = 'discard';
            }
        }

        const depthAttachment = this.renderPassDescriptor.depthStencilAttachment;
        if (depthAttachment) {
            // an XR view's depth is the compositor's input, so it is always stored
            const xrDepth = this.assignedDepthTexture;
            const hasStencil = this.depthAttachment.hasStencil;

            depthAttachment.depthClearValue = renderPass.depthStencilOps.clearDepthValue;
            depthAttachment.depthLoadOp = renderPass.depthStencilOps.clearDepth ? 'clear' : 'load';
            depthAttachment.depthStoreOp = (renderPass.depthStencilOps.storeDepth || xrDepth) ? 'store' : 'discard';
            depthAttachment.depthReadOnly = false;

            // a depth-only format takes no stencil operations
            if (!hasStencil) {
                delete depthAttachment.stencilClearValue;
                delete depthAttachment.stencilLoadOp;
                delete depthAttachment.stencilStoreOp;
                delete depthAttachment.stencilReadOnly;
            }

            if (hasStencil) {
                depthAttachment.stencilClearValue = renderPass.depthStencilOps.clearStencilValue;
                depthAttachment.stencilLoadOp = renderPass.depthStencilOps.clearStencil ? 'clear' : 'load';
                depthAttachment.stencilStoreOp = renderPass.depthStencilOps.storeStencil ? 'store' : 'discard';
                depthAttachment.stencilReadOnly = false;
            }

            // transient (memoryless) depth must be cleared on load and discarded on store (see the
            // color attachment note above) - force compliant ops to avoid a validation error.
            if (this.depthAttachment.transient && !xrDepth &&
                (depthAttachment.depthLoadOp !== 'clear' || depthAttachment.depthStoreOp !== 'discard' ||
                (this.depthAttachment.hasStencil && (depthAttachment.stencilLoadOp !== 'clear' || depthAttachment.stencilStoreOp !== 'discard')))) {

                Debug.errorOnce(`Transient (memoryless) depth attachment on render target '${renderTarget.name}' requires loadOp 'clear' and storeOp 'discard', but resolved to depth loadOp '${depthAttachment.depthLoadOp}' / storeOp '${depthAttachment.depthStoreOp}'. This is usually caused by a later pass reusing this target without clearing, or by a depth grab pass (sceneDepthMap) / depth prepass / depth resolve. Forcing clear/discard to avoid a validation error; rendering may be incorrect. Disable transientDepth or stop reusing/grabbing this target.`);
                depthAttachment.depthLoadOp = 'clear';
                depthAttachment.depthStoreOp = 'discard';
                if (this.depthAttachment.hasStencil) {
                    depthAttachment.stencilLoadOp = 'clear';
                    depthAttachment.stencilStoreOp = 'discard';
                }
            }
        }
    }

    loseContext() {
        this.initialized = false;
    }

    resolve(device, target, color, depth) {
    }
}

export { WebgpuRenderTarget };
