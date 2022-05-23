const CHUNK_API_1_54 = '1.54';

const engineChunkVersions = {
    // frontend
    clearCoatNormalPS: CHUNK_API_1_54,
    diffusePS: CHUNK_API_1_54,
    diffuseDetailMapPS: CHUNK_API_1_54,
    emissivePS: CHUNK_API_1_54,
    lightmapDirPS: CHUNK_API_1_54,
    lightmapSinglePS: CHUNK_API_1_54,
    normalMapFastPS: CHUNK_API_1_54,
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
    specularAaNonePS: CHUNK_API_1_54,
    specularAaToksvigPS: CHUNK_API_1_54,
    specularAaToksvigFastPS: CHUNK_API_1_54,
    startPS: CHUNK_API_1_54,
};

const semverLess = (a, b) => {
    const aver = a.split('.').map(t => parseInt(t, 10));
    const bver = b.split('.').map(t => parseInt(t, 10));
    return (a.ver[0] < b.ver[0]) || ((a.ver[0] === b.ver[0]) && (a.ver[1] < b.ver[1]));
};

const chunkIsOutdated = (chunkName, APIVersion) => {
    const engineAPIVersion = engineChunkVersions[chunkName];
    return engineAPIVersion ? (APIVersion ? semverLess(APIVersion, engineAPIVersion) : true) : false;
};

export {
    chunkIsOutdated,
    CHUNK_API_1_54
};
