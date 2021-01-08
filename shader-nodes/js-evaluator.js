// JsEvaluator

// constant node, evaluates to the constant
var JsEval_Constant = function (inputs, nodeSettings, nodeParams, evaluator) {
    var result = evaluator.createValue(nodeSettings.types[0], nodeParams);
    console.log('constant result=' + JSON.stringify(result));
    return [ result ];
};

var JsEval_Identifier = function (inputs, nodeSettings, nodeParams, evaluator) {
    
};

// eval node
var JsEval_Add = function (inputs, nodeSettings, nodeParams, evaluator) {
    // determine the output type automatically from input types. (type
    // could also be specified by user for this node).
    var outputType = evaluator.determineTypeFromInputs(inputs);
    if (outputType === null) {
        // type error
        return null;
    }

    var i, j;

    // cast input values to output type
    var castInputs = [ ];
    for (i=0; i<inputs.length; ++i) {
        var input = inputs[i];
        if (input) {
            castInputs.push(evaluator.castValue(outputType, input));
        }
    }

    // sum inputs
    var result = evaluator.createValue(outputType);
    for (i=0; i<castInputs.length; ++i) {
        var input = castInputs[i];
        for (j=0; j<outputType.dimension; ++j) {
            result.data[j] += input.data[j];
        }
    }

    console.log('add result=' + JSON.stringify(result));

    // return the result
    return [ result ];
};

// null node
var JsEval_Null = function (inputs, nodeSettings, nodeParams, evaluator) {
    return  [ ];
};

var JsEvaluator = function () {
    this.coreNodes = {
        constant: JsEval_Constant,
        identifier: JsEval_Identifier,
        add: JsEval_Add,
        null: JsEval_Null
    };
};

Object.assign(JsEvaluator.prototype, {
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
            var inputs = [ ];
            for (var i=0; i<graph.meta[node.type].inputs; ++i) {
                if (node.connections.hasOwnProperty(i)) {
                    var connection = node.connections[i];
                    var result = eval.call(this, connection.node.id);
                    inputs.push(result[connection.output]);
                } else {
                    inputs.push(null);
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
        for (var i=0; i<inputs.length; ++i) {
            var input = inputs[i];
            if (input) {
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
    },

    // create a value given its type and optionally initialize
    // the value data data
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
