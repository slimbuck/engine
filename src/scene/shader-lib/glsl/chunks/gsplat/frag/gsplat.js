export default /* glsl */`

#ifdef DITHER
    varying float id;
    uniform int frameIndex;
    uniform sampler2D blueNoiseTex32;
#endif

#ifdef PICK_PASS
    #include "pickPS"
#endif

#if defined(SHADOW_PASS) || defined(PICK_PASS) || defined(PREPASS_PASS)
    uniform float alphaClip;
#endif

#ifdef PREPASS_PASS
    varying float vLinearDepth;
    #include "floatAsUintPS"
#endif

varying mediump vec2 gaussianUV;
varying mediump vec4 gaussianColor;

void main(void) {
    mediump float A = dot(gaussianUV, gaussianUV);
    if (A > 1.0) {
        discard;
    }

    // evaluate alpha
    mediump float alpha = exp(-A * 4.0) * gaussianColor.a;

    #if defined(SHADOW_PASS) || defined(PICK_PASS) || defined(PREPASS_PASS)
        if (alpha < alphaClip) {
            discard;
        }
    #endif

    #ifdef PICK_PASS

        gl_FragColor = getPickOutput();

    #elif SHADOW_PASS

        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);

    #elif PREPASS_PASS

        gl_FragColor = float2vec4(vLinearDepth);

    #else
        if (alpha < 1.0 / 255.0) {
            discard;
        }

        #ifdef DITHER
            ivec2 uv = ivec2(gl_FragCoord.xy) + ivec2(id, -id) * 3 + ivec2(-frameIndex, frameIndex) * 5;
            int comp = (int(id) + frameIndex) % 4;
            float noise = texelFetch(blueNoiseTex32, uv & 31, 0)[comp];
            if (alpha < noise)
                discard;
            gl_FragColor = vec4(gaussianColor.xyz, 1.0);
        #else
            gl_FragColor = vec4(gaussianColor.xyz * alpha, alpha);
        #endif
    #endif
}
`;
