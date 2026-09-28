import { GSplatRenderer } from './gsplat-renderer.js';

/**
 * Renderer for {@link GSPLAT_RENDERER_EXTERNAL}: draws nothing and allocates nothing. It neither
 * sorts on the CPU nor runs a GPU pipeline, so the manager keeps the world (LOD, streaming, budget,
 * work buffer) up to date for an application-provided renderer to consume.
 *
 * @ignore
 */
class GSplatExternalRenderer extends GSplatRenderer {
    get requiresCpuSort() {
        return false;
    }
}

export { GSplatExternalRenderer };
