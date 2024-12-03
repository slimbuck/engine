export default /* glsl */`

#if TONEMAP == FILMIC
    #include "tonemappingFilmicPS"
#elif TONEMAP == LINEAR
    #include "tonemappingLinearPS"
#elif TONEMAP == HEJL
    #include "tonemappingHejlPS"
#elif TONEMAP == ACES
    #include "tonemappingAcesPS"
#elif TONEMAP == ACES2
    #include "tonemappingAces2PS"
#elif TONEMAP == NEUTRAL
    #include "tonemappingNeutralPS"
#endif

#if TONEMAP != NONE
    #if GAMMA == SRGB
        #include "decodePS"
        #include "gamma2_2PS"
    #else
        #include "gamma1_0PS"
    #endif
#endif

// prepare the output color for the given gamma-space color
vec3 prepareOutputFromGamma(vec3 gammaColor) {
    #if TONEMAP == NONE
        #if GAMMA == NONE
            // convert to linear space
            return decodeGamma(gammaColor);
        #else
            // output gamma space color directly
            return gammaColor;
        #endif
    #else
        // apply tonemapping in linear space and output to linear or
        // gamma (which is handled by gammaCorrectOutput)
        return gammaCorrectOutput(toneMap(decodeGamma(gammaColor)));
    #endif
}
`;