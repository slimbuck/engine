import { createShaderFromCode } from '../shader-lib/utils.js';
import { RenderTarget } from '../../platform/graphics/render-target.js';
import { PIXELFORMAT_RGBA8, SEMANTIC_POSITION } from '../../platform/graphics/constants.js';
import { RenderPass } from '../../platform/graphics/render-pass.js';
import { CULLFACE_NONE } from '../../platform/graphics/constants.js';
import { DepthState } from '../../platform/graphics/depth-state.js';
import { GeometryRender } from '../graphics/geometry-render.js';
import { Geometry } from '../geometry/geometry.js';
import { Vec4 } from '../../core/math/vec4.js';
import { Vec3 } from '../../core/math/vec3.js';
import { Mat4 } from '../../core/math/mat4.js';

const vs = /* glsl */ `
attribute vec3 vertex_position;

uniform highp sampler2D chunkTexture;
uniform vec3 cameraPosition;

varying vec3 positionMin;
varying vec3 positionMax;
varying vec3 colorMin;
varying vec3 colorMax;

void main(void) {
    int chunkIndex = int(vertex_position.z);
    ivec2 chunkDims = textureSize(chunkTexture, 0);
    int width = chunkDims.x / 5;
    int height = chunkDims.y;
    int chunkU = chunkIndex % width;
    int chunkV = chunkIndex / width;

    // read chunk data
    vec4 chunkDataA = texelFetch(chunkTexture, ivec2(chunkU * 5, chunkV), 0);
    vec4 chunkDataB = texelFetch(chunkTexture, ivec2(chunkU * 5 + 1, chunkV), 0);
    vec4 chunkDataD = texelFetch(chunkTexture, ivec2(chunkU * 5 + 3, chunkV), 0);
    vec4 chunkDataE = texelFetch(chunkTexture, ivec2(chunkU * 5 + 4, chunkV), 0);

    positionMin = chunkDataA.xyz;
    positionMax = vec3(chunkDataA.w, chunkDataB.xy);
    colorMin = chunkDataD.xyz;
    colorMax = vec3(chunkDataD.w, chunkDataE.xy);

    // output quad covering this chunk
    float u = (float(chunkU) + vertex_position.x) / float(width);
    float v = (float(chunkV) + vertex_position.y) / float(height);
    gl_Position = vec4(u * 2.0 - 1.0, v * 2.0 - 1.0, 0.0, 1.0);
}
`;

const fs = /* glsl */ `
// x: position bits, y: rotation bits, z: scale bits, w: color bits
uniform highp usampler2D packedTexture;
uniform highp usampler2D shTexture0;
uniform highp usampler2D shTexture1;
uniform highp usampler2D shTexture2;

uniform vec3 cameraPosition;

// chunk details
varying vec3 positionMin;
varying vec3 positionMax;
varying vec3 colorMin;
varying vec3 colorMax;

vec4 unpack8888(in uint bits) {
    return vec4((uvec4(bits) >> uvec4(24u, 16u, 8u, 0u)) & 0xffu) / 255.0;
}

vec4 unpack8888s(in uint bits) {
    return vec4((uvec4(bits) >> uvec4(0u, 8u, 16u, 24u)) & 0xffu) * (8.0 / 255.0) - 4.0;
}

vec3 unpack111011(uint bits) {
    return vec3((uvec3(bits) >> uvec3(21u, 11u, 0u)) & uvec3(0x7ffu, 0x3ffu, 0x7ffu)) / vec3(2047.0, 1023.0, 2047.0);
}

void readSH(ivec2 uv, out vec3 sh[15]) {
    uvec4 shData0 = texelFetch(shTexture0, uv, 0);
    uvec4 shData1 = texelFetch(shTexture1, uv, 0);
    uvec4 shData2 = texelFetch(shTexture2, uv, 0);

    vec4 r0 = unpack8888s(shData0.x);
    vec4 r1 = unpack8888s(shData0.y);
    vec4 r2 = unpack8888s(shData0.z);
    vec4 r3 = unpack8888s(shData0.w);

    vec4 g0 = unpack8888s(shData1.x);
    vec4 g1 = unpack8888s(shData1.y);
    vec4 g2 = unpack8888s(shData1.z);
    vec4 g3 = unpack8888s(shData1.w);

    vec4 b0 = unpack8888s(shData2.x);
    vec4 b1 = unpack8888s(shData2.y);
    vec4 b2 = unpack8888s(shData2.z);
    vec4 b3 = unpack8888s(shData2.w);

    sh[0] =  vec3(r0.x, g0.x, b0.x);
    sh[1] =  vec3(r0.y, g0.y, b0.y);
    sh[2] =  vec3(r0.z, g0.z, b0.z);
    sh[3] =  vec3(r0.w, g0.w, b0.w);
    sh[4] =  vec3(r1.x, g1.x, b1.x);
    sh[5] =  vec3(r1.y, g1.y, b1.y);
    sh[6] =  vec3(r1.z, g1.z, b1.z);
    sh[7] =  vec3(r1.w, g1.w, b1.w);
    sh[8] =  vec3(r2.x, g2.x, b2.x);
    sh[9] =  vec3(r2.y, g2.y, b2.y);
    sh[10] = vec3(r2.z, g2.z, b2.z);
    sh[11] = vec3(r2.w, g2.w, b2.w);
    sh[12] = vec3(r3.x, g3.x, b3.x);
    sh[13] = vec3(r3.y, g3.y, b3.y);
    sh[14] = vec3(r3.z, g3.z, b3.z);
}

#define SH_C1 0.4886025119029199f
#define SH_C2_0 1.0925484305920792f
#define SH_C2_1 -1.0925484305920792f
#define SH_C2_2 0.31539156525252005f
#define SH_C2_3 -1.0925484305920792f
#define SH_C2_4 0.5462742152960396f
#define SH_C3_0 -0.5900435899266435f
#define SH_C3_1 2.890611442640554f
#define SH_C3_2 -0.4570457994644658f
#define SH_C3_3 0.3731763325901154f
#define SH_C3_4 -0.4570457994644658f
#define SH_C3_5 1.445305721320277f
#define SH_C3_6 -0.5900435899266435f

vec3 evalSH(in vec3 dir, in vec3 sh[15], float scale) {
    float x = dir.x;
    float y = dir.y;
    float z = dir.z;

    // 1st degree
    vec3 result = SH_C1 * (-sh[0] * y + sh[1] * z - sh[2] * x);

    // 2nd degree
    float xx = x * x;
    float yy = y * y;
    float zz = z * z;
    float xy = x * y;
    float yz = y * z;
    float xz = x * z;

    result +=
        sh[3] * (SH_C2_0 * xy) *  +
        sh[4] * (SH_C2_1 * yz) +
        sh[5] * (SH_C2_2 * (2.0 * zz - xx - yy)) +
        sh[6] * (SH_C2_3 * xz) +
        sh[7] * (SH_C2_4 * (xx - yy));

    // 3rd degree
    result +=
        sh[8]  * (SH_C3_0 * y * (3.0 * xx - yy)) +
        sh[9]  * (SH_C3_1 * xy * z) +
        sh[10] * (SH_C3_2 * y * (4.0 * zz - xx - yy)) +
        sh[11] * (SH_C3_3 * z * (2.0 * zz - 3.0 * xx - 3.0 * yy)) +
        sh[12] * (SH_C3_4 * x * (4.0 * zz - xx - yy)) +
        sh[13] * (SH_C3_5 * z * (xx - yy)) +
        sh[14] * (SH_C3_6 * x * (xx - 3.0 * yy));

    return result * scale;
}

void main() {
    ivec2 uv = ivec2(gl_FragCoord.xy);

    // read packed position
    uvec4 packedData = texelFetch(packedTexture, uv, 0);

    // unpack position with chunk min/max
    vec3 position = mix(positionMin, positionMax, unpack111011(packedData.x));
    vec4 color = mix(vec4(colorMin, 0.0), vec4(colorMax, 1.0), unpack8888(packedData.w));

    // read and unpack sh coefficients
    vec3 sh[15];
    readSH(uv, sh);

    // calculate the view vector
    vec3 view = normalize(position - cameraPosition);

    // evaluate sh
    vec3 result = color.xyz + evalSH(view, sh, 1.0);

    gl_FragColor = vec4(result * 0.5, color.w);
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

const resolve = (scope, values) => {
    for (const key in values) {
        scope.resolve(key).setValue(values[key]);
    }
};

const cameraSplatPosition = new Vec3();
const cameraSplatPositionArray = [0, 0, 0];
const splatInverse = new Mat4();

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

        const numChunks = Math.ceil(gsplatCompressed.numSplats / 256);

        const geometry = new Geometry();
        geometry.positions = new Array(numChunks * 4 * 3);
        geometry.indices = new Array(numChunks * 6);

        const quad = [0, 0, 1, 0, 1, 1, 0, 1];
        const indices = [0, 1, 2, 0, 2, 3];
        for (let i = 0; i < numChunks; i++) {
            for (let j = 0; j < 4; j++) {
                geometry.positions[i * 12 + j * 3 + 0] = quad[j * 2 + 0];
                geometry.positions[i * 12 + j * 3 + 1] = quad[j * 2 + 1];
                geometry.positions[i * 12 + j * 3 + 2] = i;
            }
            for (let j = 0; j < 6; j++) {
                geometry.indices[i * 6 + j] = indices[j] + i * 4;
            }
        }

        const render = new GeometryRender(geometry, shader);
        const renderPass = new DrawRenderPass(device, render);
        renderPass.init(renderTarget);
        renderPass.colorOps.clear = false;
        renderPass.depthStencilOps.clearDepth = false;    

        this.gsplatCompressed = gsplatCompressed;
        this.shader = shader;
        this.colorTexture = colorTexture;
        this.renderTarget = renderTarget;
        this.render = render;
        this.renderPass = renderPass;
        this.prevCameraPosition = new Vec3();
    }

    destroy() {
        this.shader.destroy();
        this.colorTexture.destroy();
        this.renderTarget.destroy();
        this.render.destroy();
        this.renderPass.destroy();
    }

    update(cameraPosition, splatEntity) {
        const { gsplatCompressed, renderTarget, renderPass, prevCameraPosition } = this;
        const { device } = gsplatCompressed;

        // if the camera hasn't moved, no need to update spherical harmonics
        if (cameraPosition.equals(prevCameraPosition)) {
            return;
        }

        prevCameraPosition.copy(cameraPosition);

        // calculate the camera position in splat space
        splatInverse.invert(splatEntity.getWorldTransform());
        splatInverse.transformPoint(cameraPosition, cameraSplatPosition);
        cameraSplatPosition.toArray(cameraSplatPositionArray);

        resolve(device.scope, {
            ...gsplatCompressed,
            cameraPosition: cameraSplatPositionArray
        });

        drawWithShader(renderTarget, renderPass);
    }
}

export { GSplatCompressedInstance };
