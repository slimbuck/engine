import { Component } from '../component.js';

/**
 * @import { AudioListenerComponentSystem } from './system.js'
 * @import { Entity } from '../../entity.js'
 */

/**
 * Represents the audio listener in the 3D world, so that 3D positioned audio sources are heard
 * correctly.
 *
 * @category Sound
 */
class AudioListenerComponent extends Component {
    /**
     * Create a new AudioListenerComponent instance.
     *
     * @param {AudioListenerComponentSystem} system - The ComponentSystem that created this component.
     * @param {Entity} entity - The Entity that this component is attached to.
     */
    constructor(system, entity) { // eslint-disable-line no-useless-constructor
        super(system, entity);
    }

    setCurrentListener() {
        if (this.enabled && this.entity.audiolistener && this.entity.enabled) {
            this.system.current = this.entity;
            const position = this.system.current.getPosition();
            this.system.manager.listener.setPosition(position);
        }
    }

    onEnable() {
        this.setCurrentListener();
    }

    onDisable() {
        if (this.system.current === this.entity) {
            this.system.current = null;
        }
    }
}

export { AudioListenerComponent };
