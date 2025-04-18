export default /* glsl */`

#ifndef _DECODE_INCLUDED_
#define _DECODE_INCLUDED_

vec3 decodeLinear(vec4 raw) {
    return raw.rgb;
}

float decodeGamma(float raw) {
    return pow(raw, 2.2);
}

vec3 decodeGamma(vec3 raw) {
    return pow(raw, vec3(2.2));
}

vec3 decodeGamma(vec4 raw) {
    return pow(raw.xyz, vec3(2.2));
}

vec3 decodeRGBM(vec4 raw) {
    vec3 color = (8.0 * raw.a) * raw.rgb;
    return color * color;
}

vec3 decodeRGBP(vec4 raw) {
    vec3 color = raw.rgb * (-raw.a * 7.0 + 8.0);
    return color * color;
}

vec3 decodeRGBE(vec4 raw) {
    if (raw.a == 0.0) {
        return vec3(0.0, 0.0, 0.0);
    } else {
        return raw.xyz * pow(2.0, raw.w * 255.0 - 128.0);
    }
}

vec4 passThrough(vec4 raw) {
    return raw;
}

vec3 unpackNormalXYZ(vec4 nmap) {
    return nmap.xyz * 2.0 - 1.0;
}

vec3 unpackNormalXY(vec4 nmap) {
    vec3 normal;
    normal.xy = nmap.wy * 2.0 - 1.0;
    normal.z = sqrt(1.0 - clamp(dot(normal.xy, normal.xy), 0.0, 1.0));
    return normal;
}

#endif
`;
