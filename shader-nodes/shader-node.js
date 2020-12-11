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

// helper predefined types
var FloatType = new Type(DataType.float, 1);
var Vec2Type = new Type(DataType.float, 2);
var Vec3Type = new Type(DataType.float, 3);
var Vec4Type = new Type(DataType.float, 4);
var Mat2Type = new Type(DataType.mat, 2);
var Mat3Type = new Type(DataType.mat, 3);
var Mat4Type = new Type(DataType.mat, 4);
var TextureType = new Type(DataType.texture, 0);

// JsBuilder

// value node
var Eval_Value = function (inputs, nodeSettings, nodeParams, builder) {
    console.log('value inputs=' + JSON.stringify(inputs));
    return {
        0: builder.createValue(nodeSettings.type, nodeParams)
    };
};

// eval node
var Eval_Add = function (inputs, nodeSettings, nodeParams, builder) {
    console.log('add inputs=' + JSON.stringify(inputs));

    // determine the output type automatically from input types. (type
    // could also be specified by user for this node).
    var outputType = builder.determineTypeFromInputs(inputs);
    if (outputType === null) {
        // type error
        return null;
    }

    var i, j;

    // cast input values to output type
    var castInputs = [ ];
    for (i in inputs) {
        if (inputs.hasOwnProperty(i)) {
            castInputs.push(builder.castValue(outputType, inputs[i]));
        }
    }

    // sum inputs
    var result = builder.createValue(outputType);
    for (i=0; i<castInputs.length; ++i) {
        var input = castInputs[i];
        for (j=0; j<outputType.dimension; ++j) {
            result.data[j] += input.data[j];
        }
    }

    // return the result
    return {
        0: result
    }
};

// null node
var Eval_Null = function (inputs, nodeSettings, nodeParams, builder) {
    console.log('null inputs=' + JSON.stringify(inputs));
    return { };
};

var JsBuilder = function (coreNodes) {
    this.coreNodes = coreNodes;
};

Object.assign(JsBuilder.prototype, {
    evaluate: function (nodeId, graph, params) {
        var resultCache = { };

        var eval = function eval (nodeId) {
            // return cached result if it exists
            var result = resultCache[nodeId];
            if (result) {
                return result;
            }

            // get node inputs
            var node = graph.nodeById[nodeId];
            var inputs = { };
            for (var c in node.connections) {
                if (node.connections.hasOwnProperty(c)) {
                    var connection = node.connections[c];
                    var result = eval.call(this, connection.node.id);
                    inputs[c] = result[connection.output];
                }
            }

            // evaluate the node
            var result = this.coreNodes[node.type](inputs, node.settings, params[node.id], this);

            // store result in cache for next time
            resultCache[nodeId] = result;

            // return evaluation result
            return result;
        };

        return eval.call(this, nodeId);
    },

    // determine the maximum dimension from a set of inputs
    determineTypeFromInputs: function (inputs) {
        var type = null;
        var dimension = 0;
        for (var i in inputs) {
            if (inputs.hasOwnProperty(i)) {
                var input = inputs[i];
                if (!type) {
                    type = input.type.dataType;
                    dimension = input.type.dimension;
                } else {
                    if (type !== input.type.dataType) {
                        console.log('type error');
                        return null;        // type error, input contains mixed types
                    } else {
                        dimension = Math.max(dimension, input.type.dimension);
                    }
                }
            }
        }
        switch (type) {
            case DataType.float:
                return [null, FloatType, Vec2Type, Vec3Type, Vec4Type][dimension];
            case DataType.mat:
                return [null, null, Mat2Type, Mat3Type, Mat4Type][dimension];
            case DataType.texture:
                return [TextureType, null, null, null, null][dimension];
            default: return null;
        }
    },

    // allocate storage for the given type and initialize its data
    allocateValueStorage: function (type) {
        switch (type.dataType) {
            case DataType.float:
                switch (type.dimension) {
                    case 1: return [0];
                    case 2: return [0, 0];
                    case 3: return [0, 0, 0];
                    case 4: return [0, 0, 0, 0];
                }
            case DataType.mat:
                switch (type.dimension) {
                    case 2: return [1, 0, 0, 1];
                    case 3: return [1, 0, 0, 0, 1, 0, 0, 0, 1];
                    case 4: return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
                }
        }
        return null;
    },

    // create a value given its type and optionally initialization data
    createValue: function (type, initialData) {
        var data = this.allocateValueStorage(type);

        if (initialData !== undefined && initialData !== null) {
            switch (type.dataType) {
                case DataType.float:
                case DataType.mat:
                    var len = data.length;
                    for (var i=0; i<len; ++i) {
                        data[i] = initialData[i];
                    }
                    break;
                case DataType.texture:
                    data = initialData;
                    break;
            }
        }

        return {
            type: type,
            data: data
        }
    },

    // copy matching types
    copyValue: function (dst, src) {
        switch (dst.type.dataType) {
            case DataType.float:
            case DataType.mat:
                var len = dst.type.dimension;   // == dst.data.length
                for (var i=0; i<len; ++i) {
                    dst.data[i] = src.data[i];
                }
                break;
            case DataType.texture:
                dst.data = src.data;
                break;
        }
    },

    // cast a value to the new type, returns the new value
    castValue: function (type, value) {
        if (type.dataType !== value.type.dataType) {
            // error: can't cast between float, mat, texture
            return null;
        }

        // allocate result value
        var result = this.createValue(type);

        if (type === value.type) {
            // types match, just copy
            this.copyValue(result, value);
        } else {
            switch (type.dataType) {
                case DataType.float:
                    var i;
                    if (value.type == FloatType) {
                        // float -> vec conversion: duplicate value
                        for (i=0; i<type.dimension; ++i) {
                            result.data[i] = value.data[0];
                        }
                    } else {
                        // any other vec type: copy just overlapping elements
                        var len = Math.min(type.dimension, value.type.dimension);
                        for (i=0; i<len; ++i) {
                            result.data[i] = value.data[i];
                        }
                    }
                    break;
                case DataType.mat:
                    // TODO: copy matrix bits across different sizes
                    break;
                case DataType.texture:
                    result.data = value.data;
                    break;
            }
        }
        return result;
    }
});

// graph
var Graph = function () {
    this.nodeById = { };
};

Object.assign(Graph.prototype, {
    createNode: function (id, type, settings) {
        var node = {
            id: id,
            type: type,
            settings: settings,
            connections: { }
        };
        this.nodeById[id] = node;
    },

    createConnection: function (srcNodeId, dstNodeId, srcOutput, dstInput) {
        this.nodeById[dstNodeId].connections[dstInput] = { node: this.nodeById[srcNodeId], output: srcOutput };
    }
});

// create builder
var JsCoreNodes = {
    value: Eval_Value,
    add: Eval_Add,
    null: Eval_Null
};
var builder = new JsBuilder(JsCoreNodes);

// create graph
var graph = new Graph();
graph.createNode(0, 'value', { type: Vec2Type, name: 'vec2Value' } );
graph.createNode(1, 'value', { type: Vec4Type, name: 'vec4Value' } );
graph.createNode(2, 'value', { type: Vec3Type, name: 'vec3Value' } );
graph.createNode(3, 'add', null);
graph.createNode(4, 'null', null);
graph.createConnection(0, 3, 0, 0);
graph.createConnection(1, 3, 0, 1);
graph.createConnection(2, 3, 0, 2);
graph.createConnection(3, 4, 0, 0);

// map of nodeId->nodeParam
var graphParams = {
    0: [ 1, 2 ],
    1: [ 3, 4, 5, 6 ],
    2: [ 7, 8, 9 ]
};
builder.evaluate(4, graph, graphParams);
