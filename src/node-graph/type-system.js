
// type system implements node graph type deduction and validation
var TypeSystem = {
    // Test for valid type conversion between the source and destination type. Data types
    // much match and Vec can arbitrarily change dimension, unlike Mat and Texture.
    isValidTypeConversion: function (dstType, srcType) {
        return (srcType.dataType === dstType.dataType) &&
               (srcType.dataType === DataType.Vec || srcType.dimension === dstType.dimension);
    },

    // Given a list of types, determine the containing type which encompasses
    // all the input types. For example, given the list [Float, Vec2, Vec3], returns
    // Vec3. Mixed data types are not supported.
    determineContainingType: function (types) {
        var dataType = null;
        var dimension = 0;
        for (var i=0; i<types.length; ++i) {
            var type = types[i];
            if (type) {
                if (!dataType) {
                    dataType = type.dataType;
                    dimension = type.dimension;
                } else {
                    if (dataType !== type.dataType) {
                        console.log('type error');
                        return null;        // type error, input contains mixed types
                    } else {
                        dimension = Math.max(dimension, type.dimension);
                    }
                }
            }
        }
        switch (dataType) {
            case DataType.Vec:
                return [null, Types.Float, Types.Vec2, Types.Vec3, Types.Vec4][dimension];
            case DataType.Mat:
                return [null, null, Types.Mat2, Types.Mat3, Types.Mat4][dimension];
            case DataType.Texture:
                return [Types.Texture, null, null, null, null][dimension];
            default:
                return null;
        }
    },

    // Make a list of connected upstream types
    getUpstreamTypes: function (node) {
        return node.connections ? node.connections.map(function (c) {
                return c.node.outputTypes[c.output];
            }) : null;
    }
};
