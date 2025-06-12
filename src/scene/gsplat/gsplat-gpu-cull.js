import { drawQuadWithShader } from '../../scene/graphics/quad-render-utils.js';
import { BlendState } from '../../platform/graphics/blend-state.js';
import {
    CULLFACE_NONE,
    PIXELFORMAT_RGBA8,
    PIXELFORMAT_R8,
    SEMANTIC_POSITION
} from '../../platform/graphics/constants.js';
import { DepthState } from '../../platform/graphics/depth-state.js';
import { RenderTarget } from '../../platform/graphics/render-target.js';
import { Texture } from '../../platform/graphics/texture.js';
import { ShaderUtils } from '../shader-lib/shader-utils.js';

const cullVS = /* glsl */`
    attribute vec2 vertex_position;
    void main(void) {
        gl_Position = vec4(vertex_position, 0.0, 1.0);
    }
`;

const cullFS = /* glsl */`
    uniform mat4 matrix_model;
    uniform mat4 matrix_view;
    uniform mat4 matrix_projection;

    uniform sampler2D chunkTexture;
    uniform highp uint numSplats;

    bool visibleSphere(mat4 mvp, vec3 center, float radius) {
        vec4 clipCenter = mvp * vec4(center, 1.0);
        float clipRadius = radius * length(mvp[0].xyz);

        if (clipCenter.x > clipCenter.w + clipRadius) return false;
        if (clipCenter.x < -clipCenter.w - clipRadius) return false;
        if (clipCenter.y > clipCenter.w + clipRadius) return false;
        if (clipCenter.y < -clipCenter.w - clipRadius) return false;
        if (clipCenter.z < -clipRadius) return false;
        if (clipCenter.z > clipCenter.w + clipRadius) return false;
        return true;
    }

    void main(void) {
        ivec2 uv = ivec2(gl_FragCoord) * ivec2(5, 1);

        // read chunk data
        vec4 chunkDataA = texelFetch(chunkTexture, uv, 0);
        vec4 chunkDataB = texelFetch(chunkTexture, uv + ivec2(1, 0), 0);
        vec4 chunkDataC = texelFetch(chunkTexture, uv + ivec2(2, 0), 0);

        // extract chunk details
        vec3 chunkMin = chunkDataA.xyz;
        vec3 chunkMax = vec3(chunkDataA.w, chunkDataB.xy);
        vec3 scale = exp(chunkDataC.yzw);

        gl_FragColor = visibleSphere(
            matrix_projection * matrix_view * matrix_model,
            (chunkMin + chunkMax) * 0.5,
            (length(chunkMax - chunkMin) + max(scale.x, max(scale.y, scale.z)) * 0.5)
        ) ? vec4(1.0) : vec4(0.0);
    }
`;

const resolve = (scope, values) => {
    for (const key in values) {
        scope.resolve(key).setValue(values[key]);
    }
};

class GSplatGpuCull {
    constructor(device, gsplatInstance) {
        this.device = device;
        this.gsplatInstance = gsplatInstance;

        this.shader = ShaderUtils.createShader(device, {
            uniqueName: 'gsplatCullShader',
            vertexGLSL: cullVS,
            fragmentGLSL: cullFS,
            attributes: {
                vertex_position: SEMANTIC_POSITION
            }
        });

        const { chunkTexture } = gsplatInstance.resource;

        this.texture = new Texture(device, {
            width: chunkTexture.width / 5,
            height: chunkTexture.height,
            format: PIXELFORMAT_RGBA8,
            mipmaps: false
        });

        this.renderTarget = new RenderTarget({
            colorBuffer: this.texture,
            depth: false
        });

        this.device.scope.resolve('cullTexture').setValue(this.texture);
    }

    destroy() {
        this.renderTarget.destroy();
        this.texture.destroy();
        this.shader.destroy();
    }

    update(camera, modelMat) {
        const { device, gsplatInstance } = this;
        const { packedTexture, chunkTexture } = gsplatInstance.resource;

        resolve(device.scope, {
            packedTexture,
            chunkTexture,
            numSplats: gsplatInstance.numSplats,
            matrix_model: modelMat.data,
            matrix_camera: camera.camera.viewMatrix.data,
            matrix_projection: camera.camera.projectionMatrix.data
        });

        device.setBlendState(BlendState.NOBLEND);
        device.setCullMode(CULLFACE_NONE);
        device.setDepthState(DepthState.NODEPTH);

        drawQuadWithShader(this.device, this.renderTarget, this.shader);
    }
}

export { GSplatGpuCull };
