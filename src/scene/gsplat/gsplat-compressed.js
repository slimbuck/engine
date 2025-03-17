import { Vec2 } from '../../core/math/vec2.js';
import { Texture } from '../../platform/graphics/texture.js';
import { BoundingBox } from '../../core/shape/bounding-box.js';
import {
    ADDRESS_CLAMP_TO_EDGE, FILTER_NEAREST, PIXELFORMAT_RGBA32F, PIXELFORMAT_RGBA32U
} from '../../platform/graphics/constants.js';
import { createGSplatMaterial } from './gsplat-material.js';

/**
 * @import { GSplatCompressedData } from './gsplat-compressed-data.js'
 * @import { GraphicsDevice } from '../../platform/graphics/graphics-device.js'
 * @import { Material } from '../materials/material.js'
 * @import { SplatMaterialOptions } from './gsplat-material.js'
 */

// copy data with padding
const strideCopy = (target, targetStride, src, srcStride, numEntries) => {
    for (let i = 0; i < numEntries; ++i) {
        for (let j = 0; j < srcStride; ++j) {
            target[i * targetStride + j] = src[i * srcStride + j];
        }
    }
};

// rearrange packed RGBA32U texel data from being layed out linearly into blocks of 16 x 16
const swizzlePackedData = (data, width, height) => {
    // stores 16 rows of pixels at a time
    const tmp = new Uint32Array(width * 4 * 16);

    for (let chunkHigh = 0; chunkHigh < height / 16; ++chunkHigh) {
        tmp.set(data.subarray(width * 4 * 16 * chunkHigh, width * 4 * 16 * (chunkHigh + 1)));

        // swizzle
        for (let chunkWide = 0; chunkWide < width / 16; ++chunkWide) {
            for (let j = 0; j < 16; ++j) {
                for (let k = 0; k < 16; ++k) {
                    const src = 4 * (chunkWide * 256 + j * 16 + k);
                    const dst = 4 * ((chunkHigh * 16 + j) * width + chunkWide * 16 + k);
                    for (let l = 0; l < 4; ++l) {
                        data[dst + l] = tmp[src + l];
                    }
                }
            }
        }
    }
};

class GSplatCompressed {
    device;

    numSplats;

    numSplatsVisible;

    /** @type {BoundingBox} */
    aabb;

    /** @type {Texture} */
    packedTexture;

    /** @type {Texture} */
    chunkTexture;

    /** @type {Texture?} */
    shTexture0;

    /** @type {Texture?} */
    shTexture1;

    /** @type {Texture?} */
    shTexture2;

    /**
     * @param {GraphicsDevice} device - The graphics device.
     * @param {GSplatCompressedData} gsplatData - The splat data.
     */
    constructor(device, gsplatData) {
        const { chunkData, chunkSize, numChunks, numSplats, vertexData, shBands } = gsplatData;

        this.device = device;
        this.numSplats = numSplats;
        this.numSplatsVisible = numSplats;

        // initialize aabb
        this.aabb = new BoundingBox();
        gsplatData.calcAabb(this.aabb);

        // initialize centers
        this.centers = new Float32Array(numSplats * 3);
        gsplatData.getCenters(this.centers);

        // initialize centers
        this.centers = new Float32Array(numSplats * 3);
        gsplatData.getCenters(this.centers);

        const dims = this.evalTextureSize(numSplats);
        const chunkDims = new Vec2(dims.x / 16 * 5, dims.y / 16);

        // swizzle packed data
        swizzlePackedData(vertexData, dims.x, dims.y);

        // initialize packed data
        this.packedTexture = this.createTexture('packedData', PIXELFORMAT_RGBA32U, dims, vertexData);

        // initialize chunk data
        this.chunkTexture = this.createTexture('chunkData', PIXELFORMAT_RGBA32F, chunkDims);
        const chunkTextureData = this.chunkTexture.lock();
        strideCopy(chunkTextureData, 20, chunkData, chunkSize, numChunks);

        if (chunkSize === 12) {
            // if the chunks don't contain color min/max values we must update max to 1 (min is filled with 0's)
            for (let i = 0; i < numChunks; ++i) {
                chunkTextureData[i * 20 + 15] = 1;
                chunkTextureData[i * 20 + 16] = 1;
                chunkTextureData[i * 20 + 17] = 1;
            }
        }

        this.chunkTexture.unlock();

        // load optional spherical harmonics data
        if (shBands > 0) {

            // swizzle sh data
            const shData0 = new Uint32Array(gsplatData.shData0.buffer);
            const shData1 = new Uint32Array(gsplatData.shData1.buffer);
            const shData2 = new Uint32Array(gsplatData.shData2.buffer);

            swizzlePackedData(shData0, dims.x, dims.y);
            swizzlePackedData(shData1, dims.x, dims.y);
            swizzlePackedData(shData2, dims.x, dims.y);

            this.shTexture0 = this.createTexture('shTexture0', PIXELFORMAT_RGBA32U, dims, shData0);
            this.shTexture1 = this.createTexture('shTexture1', PIXELFORMAT_RGBA32U, dims, shData1);
            this.shTexture2 = this.createTexture('shTexture2', PIXELFORMAT_RGBA32U, dims, shData2);
        } else {
            this.shTexture0 = null;
            this.shTexture1 = null;
            this.shTexture2 = null;
        }
    }

    destroy() {
        this.packedTexture?.destroy();
        this.chunkTexture?.destroy();
        this.shTexture0?.destroy();
        this.shTexture1?.destroy();
        this.shTexture2?.destroy();
    }

    /**
     * @param {SplatMaterialOptions} options - The splat material options.
     * @returns {Material} material - The material to set up for the splat rendering.
     */
    createMaterial(options) {
        const result = createGSplatMaterial(options);
        result.setDefine('GSPLAT_COMPRESSED_DATA', true);
        result.setParameter('packedTexture', this.packedTexture);
        result.setParameter('chunkTexture', this.chunkTexture);
        result.setParameter('numSplats', this.numSplatsVisible);
        if (this.shTexture0) {
            result.setDefine('SH_BANDS', 3);
            result.setParameter('shTexture0', this.shTexture0);
            result.setParameter('shTexture1', this.shTexture1);
            result.setParameter('shTexture2', this.shTexture2);
        } else {
            result.setDefine('SH_BANDS', 0);
        }
        return result;
    }

    /**
     * Evaluates the texture size needed to store a given number of elements.
     * The function calculates a width and height that is close to a square
     * that can contain 'count' elements.
     *
     * @param {number} count - The number of elements to store in the texture.
     * @returns {Vec2} The width and height of the texture.
     */
    evalTextureSize(count) {
        const chunks = Math.ceil(count / 256);
        const chunksWide = Math.min(chunks, 4096 / 16);
        const chunksHigh = Math.ceil(chunks / chunksWide);
        const width = chunksWide * 16;
        const height = chunksHigh * 16;
        return new Vec2(width, height);
    }

    /**
     * Creates a new texture with the specified parameters.
     *
     * @param {string} name - The name of the texture to be created.
     * @param {number} format - The pixel format of the texture.
     * @param {Vec2} size - The width and height of the texture.
     * @param {Uint8Array|Uint16Array|Uint32Array} [data] - The initial data to fill the texture with.
     * @returns {Texture} The created texture instance.
     */
    createTexture(name, format, size, data) {
        return new Texture(this.device, {
            name: name,
            width: size.x,
            height: size.y,
            format: format,
            cubemap: false,
            mipmaps: false,
            minFilter: FILTER_NEAREST,
            magFilter: FILTER_NEAREST,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE,
            ...(data ? { levels: [data] } : { })
        });
    }
}

export { GSplatCompressed };
