import { Debug, DebugHelper } from '../../core/debug.js';
import { Vec4 } from '../../core/math/vec4.js';
import { BindGroup, DynamicBindGroup } from '../../platform/graphics/bind-group.js';
import { BINDGROUP_MESH, BINDGROUP_MESH_UB, BINDGROUP_VIEW } from '../../platform/graphics/constants.js';
import { DebugGraphics } from '../../platform/graphics/debug-graphics.js';
import { ShaderProcessorOptions } from '../../platform/graphics/shader-processor-options.js';
import { UniformBuffer } from '../../platform/graphics/uniform-buffer.js';
import { Mesh } from '../mesh.js';
import { processShader } from '../shader-lib/utils.js';

/**
 * @import { Geometry } from '../geometry/geometry.js'
 * @import { Shader } from '../../platform/graphics/shader.js'
 */

const _tempViewport = new Vec4();
const _tempScissor = new Vec4();
const _dynamicBindGroup = new DynamicBindGroup();

/**
 * An object that renders a geometry using a {@link Shader}.
 *
 * Example:
 *
 * ```javascript
 * const shader = pc.createShaderFromCode(app.graphicsDevice, vertexShader, fragmentShader, `MyShader`);
 * const quad = new QuadRender(shader);
 * quad.render();
 * quad.destroy();
 * ```
 *
 * @category Graphics
 */
class GeometryRender {
    /**
     * @type {Mesh}
     * @ignore
     */
    mesh;

    /**
     * @type {UniformBuffer}
     * @ignore
     */
    uniformBuffer;

    /**
     * @type {BindGroup}
     * @ignore
     */
    bindGroup;

    /**
     * Create a new QuadRender instance.
     *
     * @param {Geometry} geometry - The geometry to be rendered.
     * @param {Shader} shader - The shader to be used to render the quad.
     */
    constructor(geometry, shader) {
        Debug.assert(shader);
        
        const { device } = shader;

        this.mesh = Mesh.fromGeometry(device, geometry);
        this.shader = shader;

        if (device.supportsUniformBuffers) {

            // add uniform buffer support to shader
            const processingOptions = new ShaderProcessorOptions();
            this.shader = processShader(shader, processingOptions);

            // uniform buffer
            const ubFormat = this.shader.meshUniformBufferFormat;
            if (ubFormat) {
                this.uniformBuffer = new UniformBuffer(device, ubFormat, false);
            }

            // bind group
            const bindGroupFormat = this.shader.meshBindGroupFormat;
            Debug.assert(bindGroupFormat);
            this.bindGroup = new BindGroup(device, bindGroupFormat);
            DebugHelper.setName(this.bindGroup, `QuadRender-MeshBindGroup_${this.bindGroup.id}`);
        }
    }

    /**
     * Destroys the resources associated with this instance.
     */
    destroy() {
        this.mesh.destroy();
        this.mesh = null;

        this.uniformBuffer?.destroy();
        this.uniformBuffer = null;

        this.bindGroup?.destroy();
        this.bindGroup = null;
    }

    /**
     * Renders the quad. If the viewport is provided, the original viewport and scissor is restored
     * after the rendering.
     *
     * @param {Vec4} [viewport] - The viewport rectangle of the quad, in pixels. The viewport is
     * not changed if not provided.
     * @param {Vec4} [scissor] - The scissor rectangle of the quad, in pixels. Used only if the
     * viewport is provided.
     */
    render(viewport, scissor) {
        const { mesh, shader } = this;
        const { device } = shader;

        DebugGraphics.pushGpuMarker(device, 'GeometryRender');

        // only modify viewport or scissor if viewport supplied
        if (viewport) {

            // backup current settings
            _tempViewport.set(device.vx, device.vy, device.vw, device.vh);
            _tempScissor.set(device.sx, device.sy, device.sw, device.sh);

            // set new values
            scissor = scissor ?? viewport;
            device.setViewport(viewport.x, viewport.y, viewport.z, viewport.w);
            device.setScissor(scissor.x, scissor.y, scissor.z, scissor.w);
        }

        device.setVertexBuffer(mesh.vertexBuffer);
        device.setIndexBuffer(mesh.indexBuffer[0]);
        device.setShader(shader);

        if (device.supportsUniformBuffers) {
            const { bindGroup, uniformBuffer } = this;

            // not using view bind group
            device.setBindGroup(BINDGROUP_VIEW, device.emptyBindGroup);

            // mesh bind group
            bindGroup.update();
            device.setBindGroup(BINDGROUP_MESH, bindGroup);

            // dynamic uniform buffer bind group
            if (uniformBuffer) {
                uniformBuffer.update(_dynamicBindGroup);
                device.setBindGroup(BINDGROUP_MESH_UB, _dynamicBindGroup.bindGroup, _dynamicBindGroup.offsets);
            } else {
                device.setBindGroup(BINDGROUP_MESH_UB, device.emptyBindGroup);
            }
        }

        device.draw(mesh.primitive[0]);

        // restore if changed
        if (viewport) {
            device.setViewport(_tempViewport.x, _tempViewport.y, _tempViewport.z, _tempViewport.w);
            device.setScissor(_tempScissor.x, _tempScissor.y, _tempScissor.z, _tempScissor.w);
        }

        DebugGraphics.popGpuMarker(device);
    }
}

export { GeometryRender };
