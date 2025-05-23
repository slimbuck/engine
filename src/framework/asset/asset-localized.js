import { EventHandler } from '../../core/event-handler.js';
import { I18n } from '../i18n/i18n.js';

import { Asset } from './asset.js';

class LocalizedAsset extends EventHandler {
    constructor(app) {
        super();

        this._app = app;
        app.i18n.on(I18n.EVENT_CHANGE, this._onSetLocale, this);

        this._autoLoad = false;
        this._disableLocalization = false;

        /** @type {number} */
        this._defaultAsset = null;
        /** @type {number} */
        this._localizedAsset = null;
    }

    /**
     * @param {Asset | number} value - The asset or id.
     */
    set defaultAsset(value) {
        const id = value instanceof Asset ? value.id : value;

        if (this._defaultAsset === id) return;

        if (this._defaultAsset) {
            this._unbindDefaultAsset();
        }

        this._defaultAsset = id;

        if (this._defaultAsset) {
            this._bindDefaultAsset();
        }

        // reset localized asset
        this._onSetLocale(this._app.i18n.locale);
    }

    get defaultAsset() {
        return this._defaultAsset;
    }

    /**
     * @param {Asset | number} value - The asset or id.
     */
    set localizedAsset(value) {
        const id = value instanceof Asset ? value.id : value;
        if (this._localizedAsset === id) {
            return;
        }

        if (this._localizedAsset) {
            this._app.assets.off(`add:${this._localizedAsset}`, this._onLocalizedAssetAdd, this);
            this._unbindLocalizedAsset();
        }

        this._localizedAsset = id;

        if (this._localizedAsset) {
            const asset = this._app.assets.get(this._localizedAsset);
            if (!asset) {
                this._app.assets.once(`add:${this._localizedAsset}`, this._onLocalizedAssetAdd, this);
            } else {
                this._bindLocalizedAsset();
            }
        }
    }

    get localizedAsset() {
        return this._localizedAsset;
    }

    set autoLoad(value) {
        if (this._autoLoad === value) return;

        this._autoLoad = value;

        if (this._autoLoad && this._localizedAsset) {
            this._unbindLocalizedAsset();
            this._bindLocalizedAsset();
        }
    }

    get autoLoad() {
        return this._autoLoad;
    }

    set disableLocalization(value) {
        if (this._disableLocalization === value) return;

        this._disableLocalization = value;

        // reset localized asset
        this._onSetLocale(this._app.i18n.locale);
    }

    get disableLocalization() {
        return this._disableLocalization;
    }

    _bindDefaultAsset() {
        const asset = this._app.assets.get(this._defaultAsset);
        if (!asset) {
            this._app.assets.once(`add:${this._defaultAsset}`, this._onDefaultAssetAdd, this);
        } else {
            this._onDefaultAssetAdd(asset);
        }
    }

    _unbindDefaultAsset() {
        if (!this._defaultAsset) return;

        this._app.assets.off(`add:${this._defaultAsset}`, this._onDefaultAssetAdd, this);

        const asset = this._app.assets.get(this._defaultAsset);
        if (!asset) return;

        asset.off('add:localized', this._onLocaleAdd, this);
        asset.off('remove:localized', this._onLocaleRemove, this);
        asset.off('remove', this._onDefaultAssetRemove, this);
    }

    _onDefaultAssetAdd(asset) {
        if (this._defaultAsset !== asset.id) return;

        asset.on('add:localized', this._onLocaleAdd, this);
        asset.on('remove:localized', this._onLocaleRemove, this);
        asset.once('remove', this._onDefaultAssetRemove, this);
    }

    _onDefaultAssetRemove(asset) {
        if (this._defaultAsset !== asset.id) return;
        asset.off('add:localized', this._onLocaleAdd, this);
        asset.off('remove:localized', this._onLocaleAdd, this);
        this._app.assets.once(`add:${this._defaultAsset}`, this._onDefaultAssetAdd, this);
    }

    _bindLocalizedAsset() {
        if (!this._autoLoad) return;

        const asset = this._app.assets.get(this._localizedAsset);
        if (!asset) return;

        asset.on('load', this._onLocalizedAssetLoad, this);
        asset.on('change', this._onLocalizedAssetChange, this);
        asset.on('remove', this._onLocalizedAssetRemove, this);

        if (asset.resource) {
            this._onLocalizedAssetLoad(asset);
        } else {
            this._app.assets.load(asset);
        }
    }

    _unbindLocalizedAsset() {
        const asset = this._app.assets.get(this._localizedAsset);
        if (!asset) return;

        asset.off('load', this._onLocalizedAssetLoad, this);
        asset.off('change', this._onLocalizedAssetChange, this);
        asset.off('remove', this._onLocalizedAssetRemove, this);
    }

    _onLocalizedAssetAdd(asset) {
        if (this._localizedAsset !== asset.id) return;

        this._bindLocalizedAsset();
    }

    _onLocalizedAssetLoad(asset) {
        this.fire('load', asset);
    }

    _onLocalizedAssetChange(asset, name, newValue, oldValue) {
        this.fire('change', asset, name, newValue, oldValue);
    }

    _onLocalizedAssetRemove(asset) {
        if (this._localizedAsset === asset.id) {
            this.localizedAsset = this._defaultAsset;
        }
        this.fire('remove', asset);
    }

    _onLocaleAdd(locale, assetId) {
        if (this._app.i18n.locale !== locale) return;

        // reset localized asset
        this._onSetLocale(locale);
    }

    _onLocaleRemove(locale, assetId) {
        if (this._app.i18n.locale !== locale) return;

        // reset localized asset
        this._onSetLocale(locale);
    }

    _onSetLocale(locale) {
        if (!this._defaultAsset) {
            this.localizedAsset = null;
            return;
        }

        const asset = this._app.assets.get(this._defaultAsset);
        if (!asset || this._disableLocalization) {
            this.localizedAsset = this._defaultAsset;
            return;
        }

        const localizedAssetId = asset.getLocalizedAssetId(locale);
        if (!localizedAssetId) {
            this.localizedAsset = this._defaultAsset;
            return;
        }

        this.localizedAsset = localizedAssetId;
    }

    destroy() {
        this.defaultAsset = null;
        this._app.i18n.off(I18n.EVENT_CHANGE, this._onSetLocale, this);
        this.off();
    }
}

export { LocalizedAsset };
