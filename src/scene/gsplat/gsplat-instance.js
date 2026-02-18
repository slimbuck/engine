import { Debug } from '../../core/debug.js';
import { Mat4 } from '../../core/math/mat4.js';
import { Vec3 } from '../../core/math/vec3.js';
import { BUFFERUSAGE_COPY_DST, CULLFACE_NONE, SEMANTIC_ATTR13, SEMANTIC_POSITION, PIXELFORMAT_R32U } from '../../platform/graphics/constants.js';
import { MeshInstance } from '../mesh-instance.js';
import { StorageBuffer } from '../../platform/graphics/storage-buffer.js';
import { GSplatResolveSH } from './gsplat-resolve-sh.js';
import { GSplatSorter } from './gsplat-sorter.js';
import { GSplatSogData } from './gsplat-sog-data.js';
import { GSplatResourceBase } from './gsplat-resource-base.js';
import { ShaderMaterial } from '../materials/shader-material.js';
import { BLEND_NONE, BLEND_PREMULTIPLIED } from '../constants.js';

/**
 * @import { Camera } from '../camera.js'
 * @import { GraphNode } from '../graph-node.js'
 * @import { Mesh } from '../mesh.js'
 * @import { Texture } from '../../platform/graphics/texture.js'
 * @import { VertexBuffer } from '../../platform/graphics/vertex-buffer.js'
 */

const mat = new Mat4();
const cameraPosition = new Vec3();
const cameraDirection = new Vec3();
/** @ignore */
class GSplatInstance {
    /** @type {GSplatResourceBase} */
    resource;

    /** @type {Texture|null} */
    orderTexture = null;

    /** @type {StorageBuffer|null} */
    orderBuffer = null;

    /** @type {ShaderMaterial} */
    _material;

    /** @type {MeshInstance} */
    meshInstance;

    options = {};

    /** @type {GSplatSorter|null} */
    sorter = null;

    lastCameraPosition = new Vec3();

    lastCameraDirection = new Vec3();

    /** @type {GSplatResolveSH|null} */
    resolveSH = null;

    /**
     * List of cameras this instance is visible for. Updated every frame by the renderer.
     *
     * @type {Camera[]}
     * @ignore
     */
    cameras = [];

    /**
     * @param {GSplatResourceBase} resource - The splat instance.
     * @param {object} [options] - Options for the instance.
     * @param {ShaderMaterial|null} [options.material] - The material instance.
     * @param {boolean} [options.highQualitySH] - Whether to use the high quality or the approximate spherical harmonic calculation. Only applies to SOG data.
     * @param {import('../scene.js').Scene} [options.scene] - The scene to fire sort timing events on.
     */
    constructor(resource, options = {}) {
        this.resource = resource;

        const device = resource.device;
        const dims = resource.streams.textureDimensions;
        Debug.assert(dims.x > 0 && dims.y > 0, 'Resource must have valid texture dimensions before creating instance');

        const numElements = dims.x * dims.y;

        if (device.isWebGPU) {
            this.orderBuffer = new StorageBuffer(device, numElements * 4, BUFFERUSAGE_COPY_DST);
        } else {
            this.orderTexture = resource.streams.createTexture(
                'splatOrder',
                PIXELFORMAT_R32U,
                dims
            );
        }

        if (options.material) {
            // material is provided
            this._material = options.material;

            // patch splat order and storage define
            this._material.setDefine('STORAGE_ORDER', device.isWebGPU);
            this.setMaterialOrderData(this._material);
        } else {
            // construct the material
            this._material = new ShaderMaterial({
                uniqueName: 'SplatMaterial',
                vertexGLSL: '#include "gsplatVS"',
                fragmentGLSL: '#include "gsplatPS"',
                vertexWGSL: '#include "gsplatVS"',
                fragmentWGSL: '#include "gsplatPS"',
                attributes: {
                    vertex_position: SEMANTIC_POSITION,
                    vertex_id_attrib: SEMANTIC_ATTR13
                }
            });

            // default configure
            this.configureMaterial(this._material);

            // update
            this._material.update();
        }

        resource.ensureMesh();
        this.meshInstance = new MeshInstance(/** @type {Mesh} */ (resource.mesh), this._material);
        this.meshInstance.setInstancing(/** @type {VertexBuffer} */ (resource.instanceIndices), true);
        this.meshInstance.gsplatInstance = this;

        // only start rendering the splat after we've received the splat order data
        this.meshInstance.instancingCount = 0;

        // clone centers to allow multiple instances of sorter
        const centers = resource.centers.slice();
        const chunks = resource.chunks?.slice();

        // create sorter
        this.sorter = new GSplatSorter(options.scene);
        this.sorter.init(this.orderTexture, this.orderBuffer, numElements, centers, chunks);
        this.sorter.on('updated', (count) => {
            // limit splat render count to exclude those behind the camera
            this.meshInstance.instancingCount = Math.ceil(count / GSplatResourceBase.instanceSize);

            // update splat count on the material
            this.material.setParameter('numSplats', count);
        });

        // configure sog sh resolve
        this.setHighQualitySH(options.highQualitySH ?? false);
    }

    destroy() {
        this.resource?.releaseMesh();
        this.orderTexture?.destroy();
        this.orderBuffer?.destroy();
        this.resolveSH?.destroy();
        this.material?.destroy();
        this.meshInstance?.destroy();
        this.sorter?.destroy();
    }

    /**
     * Set order data parameters on the material.
     *
     * @param {ShaderMaterial} material - The material to configure.
     */
    setMaterialOrderData(material) {
        if (this.orderBuffer) {
            material.setParameter('splatOrder', this.orderBuffer);
        } else {
            material.setParameter('splatOrder', this.orderTexture);
            material.setParameter('splatTextureSize', this.orderTexture.width);
        }
    }

    /**
     * @param {ShaderMaterial} value - The material instance.
     */
    set material(value) {
        if (this._material !== value) {
            // set the new material
            this._material = value;

            // patch order data and storage define
            this._material.setDefine('STORAGE_ORDER', this.resource.device.isWebGPU);
            this.setMaterialOrderData(this._material);

            if (this.meshInstance) {
                this.meshInstance.material = value;
            }
        }
    }

    get material() {
        return this._material;
    }

    /**
     * Configure the material with gsplat instance and resource properties.
     *
     * @param {ShaderMaterial} material - The material to configure.
     * @param {object} [options] - Object for passing optional arguments.
     * @param {boolean} [options.dither] - Specify true to configure the material for dithered rendering (stochastic alpha).
     */
    configureMaterial(material, options = {}) {
        // allow resource to configure the material
        this.resource.configureMaterial(material, null, this.resource.format.getInputDeclarations());

        // set instance properties
        material.setParameter('numSplats', 0);
        material.setDefine('STORAGE_ORDER', this.resource.device.isWebGPU);
        this.setMaterialOrderData(material);
        material.setParameter('alphaClip', 0.3);
        material.setDefine(`DITHER_${options.dither ? 'BLUENOISE' : 'NONE'}`, '');
        material.cull = CULLFACE_NONE;
        material.blendType = options.dither ? BLEND_NONE : BLEND_PREMULTIPLIED;
        material.depthWrite = !!options.dither;
    }

    /**
     * Sorts the GS vertices based on the given camera.
     * @param {GraphNode} cameraNode - The camera node used for sorting.
     */
    sort(cameraNode) {
        if (this.sorter) {
            const cameraMat = cameraNode.getWorldTransform();
            cameraMat.getTranslation(cameraPosition);
            cameraMat.getZ(cameraDirection);

            const modelMat = this.meshInstance.node.getWorldTransform();
            const invModelMat = mat.invert(modelMat);
            invModelMat.transformPoint(cameraPosition, cameraPosition);
            invModelMat.transformVector(cameraDirection, cameraDirection);

            // sort if the camera has changed
            if (!cameraPosition.equalsApprox(this.lastCameraPosition) || !cameraDirection.equalsApprox(this.lastCameraDirection)) {
                this.lastCameraPosition.copy(cameraPosition);
                this.lastCameraDirection.copy(cameraDirection);
                this.sorter.setCamera(cameraPosition, cameraDirection);
            }
        }
    }

    update() {
        if (this.cameras.length > 0) {

            // sort by the first camera it's visible for
            // TODO: extend to support multiple cameras
            const camera = this.cameras[0];
            this.sort(camera._node);

            // resolve spherical harmonics
            this.resolveSH?.render(camera._node, this.meshInstance.node.getWorldTransform());

            // we get new list of cameras each frame
            this.cameras.length = 0;
        }
    }

    setHighQualitySH(value) {
        const { resource } = this;
        const { gsplatData } = resource;

        if (gsplatData instanceof GSplatSogData &&
            gsplatData.shBands > 0 &&
            value === !!this.resolveSH) {

            if (this.resolveSH) {
                this.resolveSH.destroy();
                this.resolveSH = null;
            } else {
                this.resolveSH = new GSplatResolveSH(resource.device, this);
            }
        }
    }
}

export { GSplatInstance };
