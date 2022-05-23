import { CHUNK_API_1_51, CHUNK_API_1_54 } from '../../constants.js';
import { Debug } from '../../../core/debug.js';
import { shaderChunks } from './chunks.js';

const chunkVersions = {
    // frontend
    aoPS: CHUNK_API_1_51,
    clearCoatNormalPS: CHUNK_API_1_54,
    diffusePS: CHUNK_API_1_54,
    diffuseDetailMapPS: CHUNK_API_1_54,
    emissivePS: CHUNK_API_1_54,
    lightmapDirPS: CHUNK_API_1_54,
    lightmapSinglePS: CHUNK_API_1_54,
    normalMapPS: CHUNK_API_1_54,
    normalDetailMapPS: CHUNK_API_1_54,

    // backend
    clusteredLightPS: CHUNK_API_1_54,
    endPS: CHUNK_API_1_54,
    lightmapAddPS: CHUNK_API_1_54,
    lightmapDirAddPS: CHUNK_API_1_54,
    lightSpecularAnisoGGXPS: CHUNK_API_1_54,
    lightSpecularBlinnPS: CHUNK_API_1_54,
    lightSpecularPhongPS: CHUNK_API_1_54,
    normalVertexPS: CHUNK_API_1_54,
    startPS: CHUNK_API_1_54,
};

// removed
const removedChunks = {
    ambientPrefilteredCubePS: CHUNK_API_1_51,
    ambientPrefilteredCubeLodPS: CHUNK_API_1_51,
    dpAtlasQuadPS: CHUNK_API_1_51,
    genParaboloidPS: CHUNK_API_1_51,
    prefilterCubemapPS: CHUNK_API_1_51,
    reflectionDpAtlasPS: CHUNK_API_1_51,
    reflectionPrefilteredCubePS: CHUNK_API_1_51,
    reflectionPrefilteredCubeLodPS: CHUNK_API_1_51,

    lightmapSingleVertPS: CHUNK_API_1_54,
    normalMapFastPS: CHUNK_API_1_54,
    specularAaNonePS: CHUNK_API_1_54,
    specularAaToksvigPS: CHUNK_API_1_54,
    specularAaToksvigFastPS: CHUNK_API_1_54
};

// compare two "major.minor" semantic version strings and return true if a is a smaller version than b.
const semverLess = (a, b) => {
    const aver = a.split('.').map(t => parseInt(t, 10));
    const bver = b.split('.').map(t => parseInt(t, 10));
    return (aver[0] < bver[0]) || ((aver[0] === bver[0]) && (aver[1] < bver[1]));
};

// validate user chunks
const validateUserChunks = (userChunks) => {
    const result = { };

    const userAPIVersion = userChunks.APIVersion;
    for (const chunkName in userChunks) {
        if (chunkName === 'APIVersion') {
            continue;
        }

        if (!shaderChunks.hasOwnProperty(chunkName)) {
            const removedVersion = removedChunks[chunkName];
            if (removedVersion) {
                Debug.warn(`Shader chunk '${chunkName}' was removed in API ${removedVersion} and is no longer supported.`);
            } else {
                Debug.warn(`Shader chunk '${chunkName}' is not supported.`);
            }
        } else {
            const engineAPIVersion = chunkVersions[chunkName];
            const chunkIsOutdated = engineAPIVersion && (!userAPIVersion || semverLess(userAPIVersion, engineAPIVersion));

            if (chunkIsOutdated) {
                Debug.warn(`Shader chunk '${chunkName}' is API version ${engineAPIVersion}, but the supplied chunk is version ${userAPIVersion || '-'}. Please update to the latest API.`);
            }

            result[chunkName] = userChunks[chunkName];
        }
    }
    return result;
};

export {
    validateUserChunks
};
