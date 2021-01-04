
// data types
var DataType = {
    float: 'float',
    mat: 'mat',
    texture: 'texture'
};

// a type consists of a data type and dimension
var Type = function (dataType, dimension) {
    this.dataType = dataType;
    this.dimension = (dataType == DataType.texture) ? 0 : dimension;
};

// supported types
var FloatType = new Type(DataType.float, 1);
var Vec2Type = new Type(DataType.float, 2);
var Vec3Type = new Type(DataType.float, 3);
var Vec4Type = new Type(DataType.float, 4);
var Mat2Type = new Type(DataType.mat, 2);
var Mat3Type = new Type(DataType.mat, 3);
var Mat4Type = new Type(DataType.mat, 4);
var TextureType = new Type(DataType.texture, 0);

// graph
var Graph = function () {
    this.nodeById = { };

    // metadata for core node types
    this.meta = {
        constant: { inputs: 0, outputs: 1 },
        identifier: { inputs: 0, outputs: 1 },
        add: { inputs: 6, outputs: 1 },
        null: { inputs: 1, outputs: 1 }
    }
};

Object.assign(Graph.prototype, {
    createNode: function (id, type, settings) {
        this.nodeById[id] = {
            id: id,
            type: type,
            settings: settings,
            connections: { }
        };
    },

    createConnection: function (srcNodeId, dstNodeId, srcOutput, dstInput) {
        this.nodeById[dstNodeId].connections[dstInput] = { node: this.nodeById[srcNodeId], output: srcOutput };
    }
});
