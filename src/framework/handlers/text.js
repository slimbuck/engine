import { http } from '../../platform/net/http.js';
import { ResourceHandler } from './handler.js';

class TextHandler extends ResourceHandler {
    /**
     * TextDecoder for decoding binary data.
     *
     * @type {TextDecoder|null}
     * @private
     */
    decoder = null;

    constructor(app) {
        super(app, 'text');
    }

    load(url, callback) {
        if (typeof url === 'string') {
            url = {
                load: url,
                original: url
            };
        }

        http.get(url.load, {
            retry: this.maxRetries > 0,
            maxRetries: this.maxRetries
        }, (err, response) => {
            if (!err) {
                callback(null, response);
            } else {
                callback(`Error loading text resource: ${url.original} [${err}]`);
            }
        });
    }

    /**
     * Parses raw DataView and returns string.
     *
     * @param {DataView} data - The raw data as a DataView
     * @returns {string} The parsed resource data.
     */
    openBinary(data) {
        this.decoder ??= new TextDecoder('utf-8');
        return this.decoder.decode(data);
    }
}

export { TextHandler };
