import { createShaderFromCode } from '../shader-lib/utils.js';
import { RenderTarget } from '../../platform/graphics/render-target.js';
import { PIXELFORMAT_RGBA8, SEMANTIC_POSITION } from '../../platform/graphics/constants.js';

const vs = /* glsl */ `
    attribute vec2 vertex_position;
    void main(void) {
        gl_Position = vec4(vertex_position, 0.0, 1.0);
    }
`;

const fs = /* glsl */ `
uniform highp usampler2D packedTexture;
uniform highp sampler2D chunkTexture;

`;

class GSplatCompressedInstance {
    constructor(gsplatCompressed) {

        // create shader
        this.shader = createShaderFromCode( gsplatCompressed.device, vs, fs, 'gsplat-compressed-color', {
                vertex_position: SEMANTIC_POSITION,
            }
        );

        this.colorTexture = gsplatCompressed.createTexture(
            'splatColor',
            PIXELFORMAT_RGBA8,
            gsplatCompressed.evalTextureSize(gsplatCompressed.numSplats)
        );

        this.renderTarget = new RenderTarget({
            colorBuffer: this.colorTexture,
            depth: false
        });
    }

    destroy() {
        this.renderTarget.destroy();
        this.colorTexture.destroy();
    }

    update(cameraEntity) {

    }
}

export { GSplatCompressedInstance };
