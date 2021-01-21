
// value contains a type and data
class Value {
    constructor(type, data) {
        this.type = type;
        this.data = Value.AllocValueStorage(type);
        if (data) {
            this.setFromData(data);
        }
    }

    // set the value data
    setFromData(data) {
        var len = Math.min(this.data.length, data.length);
        for (var i=0; i<len; ++i) {
            this.data[i] = data[i];
        }
    }

    copyFrom(value) {
        // types must match
        if (value.type !== this.type) {
            return false;
        }
        this._doCopyFrom(value);
        return true;
    }

    // copy the value and perform automatic cast, if necessary and appropriate
    castFrom(value) {
        var srcType = value.type;
        var dstType = this.type;

        // let's be optimistic
        if (srcType === dstType) {
            this._doCopyFrom(value);
            return true;
        }
        else if (srcType.dataType === dstType.dataType) {
            switch (dstType.dataType) {
                case DataType.vec:
                    var src = value.data;
                    var dst = this.data;
                    var len = dst.length;
                    if (srcType === Types.float) {
                        // float -> vec conversion: repeat src value
                        for (var i=0; i<len; ++i) {
                            dst[i] = src[0];
                        }
                    } else if (len < src.length) {
                        // contracting cast
                        for (var i=0; i<len; ++i) {
                            dst[i] = src[i];
                        }
                    } else {
                        // expanding cast: pad with [0, 0, 0, 1]
                        var padding = [0, 0, 0, 1];
                        for (var i=0; i<len; ++i) {
                            dst[i] = (i < src.length) ? src[i] : padding[i];
                        }
                    }
                    break;
                case DataType.mat:
                    // TODO:
                    break;
                case DataType.texture:
                    // ERROR: types should be identical, how did we get here?
                    break;
            }
            return true;
        } else {
            // invalid cast, data types don't match
            return false;
        }
    }


    // copy data assuming value type matches this exactly
    _doCopyFrom(value) {
        switch (this.type.dataType) {
            case DataType.vec:
            case DataType.mat:
                var src = value.data;
                var dst = this.data;
                var len = dst.length;
                for (var i=0; i<len; ++i) {
                    dst[i] = src[i];
                }
                break;
            case DataType.texture:
                this.data = value.data;
                break;
        }
    }

    static AllocValueStorage (type) {
        switch (type.dataType) {
            case DataType.vec:
                switch (type.dimension) {
                    case 1: return [0];
                    case 2: return [0, 0];
                    case 3: return [0, 0, 0];
                    case 4: return [0, 0, 0, 0];
                }
                break;
            case DataType.mat:
                switch (type.dimension) {
                    case 2: return [1, 0, 0, 1];
                    case 3: return [1, 0, 0, 0, 1, 0, 0, 0, 1];
                    case 4: return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
                }
                break;
        }
        return null;
    }
}
