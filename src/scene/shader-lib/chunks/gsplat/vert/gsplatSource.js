export default /* glsl */`
attribute vec3 vertex_position;         // xy: cornerUV, z: render order offset
attribute uint vertex_id_attrib;        // render order base

uniform uint numSplats;                 // total number of splats
uniform highp usampler2D splatOrder;    // per-splat index to source gaussian

// initialize the splat source structure
bool initSource(out SplatSource source) {
    uint w = uint(textureSize(splatOrder, 0).x);

    // calculate splat order
    source.order = vertex_id_attrib + uint(vertex_position.z);

    // return if out of range (since the last block of splats may be partially full)
    if (source.order >= numSplats) {
        return false;
    }

    ivec2 orderUV = ivec2(source.order % w, source.order / w);

    // read splat id
    source.id = texelFetch(splatOrder, orderUV, 0).r;

    // uint chunkIndex = source.id / 256u;
    // uint chunkU = chunkIndex % 256u;
    // uint chunkV = chunkIndex / 256u;

    // uint pixelIndex = source.id % 256u;
    // uint pixelU = pixelIndex % 16u;
    // uint pixelV = pixelIndex / 16u;

    // map id to uv
    // source.uv = ivec2(chunkU * 16u + pixelU, chunkV * 16u + pixelV);
    source.uv = ivec2(source.id % w, source.id / w);

    // get the corner
    source.cornerUV = vertex_position.xy;

    return true;
}
`;
