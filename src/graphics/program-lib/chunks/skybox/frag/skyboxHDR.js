export default /* glsl */`
varying vec3 vViewDir;

uniform samplerCube texture_cubeMap;

uniform vec3 view_position;

const vec3 domeOrigin = vec3(0.0, 2.0, 0.0);
const float domeRadius = 25.0;

vec3 warp(vec3 dir) {
    vec3 L = domeOrigin - view_position;
    float tca = dot(L, dir);
    float d2 = domeRadius * domeRadius - dot(L, L) + tca * tca;
    if (d2 < 0.0) {
        return vec3(0.0, 1.0, 0.0);
    }
    float thc = sqrt(d2);
    float t0 = tca - thc;
    float t1 = tca + thc;

    vec3 hitPoint = view_position + dir * max(t0, t1);

    if (hitPoint.y < 0.0) {
        float groundDistance = -view_position.y / dir.y;
        hitPoint = view_position + dir * groundDistance;
    }

    return normalize(hitPoint - domeOrigin);
}

void main(void) {
    vec3 dir = warp(normalize(vViewDir)) * vec3(-1.0, 1.0, 1.0);

    vec3 linear = $DECODE(textureCube(texture_cubeMap, fixSeamsStatic(dir, $FIXCONST)));

    gl_FragColor = vec4(gammaCorrectOutput(toneMap(processEnvironment(linear))), 1.0);
}
`;
