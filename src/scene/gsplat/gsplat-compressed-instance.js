import { createShaderFromCode } from '../shader-lib/utils.js';
import { RenderTarget } from '../../platform/graphics/render-target.js';
import { PIXELFORMAT_RGBA8, SEMANTIC_POSITION } from '../../platform/graphics/constants.js';
import { RenderPass } from '../../platform/graphics/render-pass.js';
import { CULLFACE_NONE } from '../../platform/graphics/constants.js';
import { DepthState } from '../../platform/graphics/depth-state.js';
import { GeometryRender } from '../graphics/geometry-render.js';
import { Geometry } from '../geometry/geometry.js';
import { Vec4 } from '../../core/math/vec4.js';

const vs = /* glsl */ `
attribute vec2 vertex_position;
void main(void) {
    gl_Position = vec4(vertex_position, 0.0, 1.0);
}
`;

const fs = /* glsl */ `
uniform highp usampler2D packedTexture;
uniform highp sampler2D chunkTexture;

void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
}
`;

class DrawRenderPass extends RenderPass {
    constructor(device, renderer) {
        super(device);
        this.renderer = renderer;
    }

    execute(rect, scissorRect) {
        const { device, renderer } = this;

        device.setCullMode(CULLFACE_NONE);
        device.setDepthState(DepthState.NODEPTH);
        device.setStencilState(null, null);
        renderer.render(rect, scissorRect);
    }
}


const _tempRect = new Vec4();

const drawWithShader = (target, renderPass, rect) =>{

    const { device } = renderPass;

    // by default render to the whole render target
    if (!rect) {
        rect = _tempRect;
        rect.x = 0;
        rect.y = 0;
        rect.z = target ? target.width : device.width;
        rect.w = target ? target.height : device.height;
    }

    if (device.isWebGPU && target === null && device.samples > 1) {
        renderPass.colorOps.store = true;
    }

    renderPass.render();
}

class GSplatCompressedInstance {
    constructor(gsplatCompressed) {
        const { device } = gsplatCompressed;

        const shader = createShaderFromCode(device, vs, fs, 'gsplat-compressed-sh-resolve', {
            vertex_position: SEMANTIC_POSITION,
        });

        const colorTexture = gsplatCompressed.createTexture(
            'resolvedSH',
            PIXELFORMAT_RGBA8,
            gsplatCompressed.evalTextureSize(gsplatCompressed.numSplats)
        );

        const renderTarget = new RenderTarget({
            colorBuffer: colorTexture,
            depth: false
        });

        const geometry = new Geometry();
        geometry.positions = [0, 0, 1, 0, 1, 1, 0, 1];
        geometry.indices = [0, 1, 2, 0, 2, 3];

        const render = new GeometryRender(geometry, shader);
        const renderPass = new DrawRenderPass(device, render);

        this.shader = shader;
        this.colorTexture = colorTexture;
        this.renderTarget = renderTarget;
        this.render = render;
        this.renderPass = renderPass;
    }

    destroy() {
        this.shader.destroy();
        this.colorTexture.destroy();
        this.renderTarget.destroy();
        this.render.destroy();
        this.renderPass.destroy();
    }

    update(cameraEntity) {
        const { renderTarget, renderPass } = this;
        drawWithShader(renderTarget, renderPass);
    }
}

export { GSplatCompressedInstance };
