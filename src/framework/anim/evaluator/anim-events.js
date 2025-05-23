/**
 * AnimEvents stores a sorted array of animation events which should fire sequentially during the
 * playback of an {@link AnimTrack}.
 *
 * @category Animation
 */
class AnimEvents {
    /**
     * Create a new AnimEvents instance.
     *
     * @param {object[]} events - An array of animation events.
     * @example
     * const events = new pc.AnimEvents([
     *     {
     *         name: 'my_event',
     *         time: 1.3, // given in seconds
     *         // any additional properties added are optional and will be available in the EventHandler callback's event object
     *         myProperty: 'test',
     *         myOtherProperty: true
     *     }
     * ]);
     * animTrack.events = events;
     */
    constructor(events) {
        this._events = [...events];
        this._events.sort((a, b) => a.time - b.time);
    }

    get events() {
        return this._events;
    }
}

export { AnimEvents };
