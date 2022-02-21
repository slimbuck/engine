import { DeviceCache } from "../../graphics/device-cache.js";
import { StandardMaterial } from "./standard-material.js";

const defaultMaterialCache = new DeviceCache((device) => {
    const material = new StandardMaterial();
    material.name = "Default Material";
    material.shadingModel = SPECULAR_BLINN;
    return material;
});

export { defaultMaterialCache };
