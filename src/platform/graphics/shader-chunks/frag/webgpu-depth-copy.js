// Shader used by WebgpuResolver to copy a depth texture into a depth texture which cannot be the
// destination of a texture copy, by rendering a fullscreen quad that writes the depth. With
// DEPTH_COPY_MULTISAMPLED defined the source is multisampled, and the nearest of its samples is
// written.
export default /* wgsl */`

    var<private> pos : array<vec2f, 4> = array<vec2f, 4>(
        vec2(-1.0, 1.0), vec2(1.0, 1.0), vec2(-1.0, -1.0), vec2(1.0, -1.0)
    );

    struct VertexOutput {
        @builtin(position) position : vec4f,
    };

    @vertex
    fn vertexMain(@builtin(vertex_index) vertexIndex : u32) -> VertexOutput {
        var output : VertexOutput;
        output.position = vec4f(pos[vertexIndex], 0, 1);
        return output;
    }

    #ifdef DEPTH_COPY_MULTISAMPLED
        @group(0) @binding(0) var img : texture_depth_multisampled_2d;
    #else
        @group(0) @binding(0) var img : texture_depth_2d;
    #endif

    @fragment
    fn fragmentMain(@builtin(position) fragColor: vec4f) -> @builtin(frag_depth) f32 {
        let coord = vec2i(fragColor.xy);
        var depth = textureLoad(img, coord, 0);
        #ifdef DEPTH_COPY_MULTISAMPLED
            let count = i32(textureNumSamples(img));
            for (var i = 1; i < count; i++) {
                depth = min(depth, textureLoad(img, coord, i));
            }
        #endif
        return depth;
    }
`;
