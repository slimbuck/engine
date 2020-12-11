
// emit a shader constant definition
// eg: 'vec3 uniqueName = vec3(1.0, 2.0, 3.0);'
// and returns 'uniqueName'
var glslEval_Constant = function (inputs, nodeSettings, nodeParams, evaluator) {
    var outputType = nodeSettings.types[0];
    var id = evaluator.gen.identifier();                                    // 'id_0'
    var typeDecl = evaluator.gen.typeDecl(outputType);                      // 'vec3'
    var constDecl = evaluator.gen.constantDecl(outputType, nodeParams);     // 'vec3(0.0, 1.0, 2.0)
    
    evaluator.emit(typeDecl + " " + id + " = " + constDecl + ";");
    return [ {
        type: outputType,
        id: id
    } ];
};

// emit code to add inputs
var glslEval_Add = function (inputs, nodeSettings, nodeParams, evaluator) {
    var outputType = evaluator.determineTypeFromInputs(inputs);
    var id = evaluator.gen.identifier();                                    // 'name_1'
    var typeDecl = evaluator.gen.typeDecl(outputType);                      // 'vec3'

    var castInputs = [];
    for (var i=0; i<inputs.length; ++i) {
        var input = inputs[i];
        if (input) {
            castInputs.push(evaluator.gen.cast(outputType, inputs[i]));
        }
    }

    evaluator.emit(typeDecl + " " + id + " = " + castInputs.join(' + ') + ";");
    return [ {
        type: outputType,
        id: id
    }];
};

// null
var glslEval_Null = function (inputs, nodeSettings, nodeParams, evaluator) {
    return [ ];
};

var GlslEvaluator = function () {
    this.coreNodes = {
        'constant': glslEval_Constant,
        'add': glslEval_Add,
        'null': glslEval_Null
    };

    // array of text strings
    this.result = [];
};

Object.assign(GlslEvaluator.prototype, {
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

    // emit a fragment
    emit: function (text) {
        this.result.push(text);
    },

    // generate various things
    gen: {
        nextNameId: 0,

        // generate a unique identifier
        identifier: function () {
            return "id_" + this.nextNameId++;
        },

        // get the declaration for a given type
        typeDecl: function (type) {
            switch (type.dataType) {
                case DataType.float:
                    return [null, 'float', 'vec2', 'vec3', 'vec4'][type.dimension];
                case DataType.mat:
                    return [null, null, 'mat2', 'mat3', 'mat4'][type.dimension];
                case DataType.texture:
                    return ['texture', null, null, null, null][type.dimension];
            }
            return null;
        },

        // generate a number
        number: function (n) {
            return "" + n;
        },

        // generate a constant declaration
        // eg: 'vec3(0.0, 1.0, 2.0)'
        constantDecl: function (type, data) {
            var result = this.typeDecl(type) + "(";
            var i;
            switch (type.dataType) {
                case DataType.float:
                    for (i=0; i<type.dimension; ++i) {
                        result += (i ? "," : "") + this.number(data[i]);
                    }
                    break;
                case DataType.mat:
                    for (i=0; i<type.dimension*type.dimension; ++i) {
                        result += (i ? "," : "") + this.number(data[i]);
                    }
                    break;
                case DataType.texture:
                    // TODO:
                    break;
            }
            result += ")";
            return result;
        },

        cast: function (type, value) {
            if (type.dataType !== value.type.dataType) {
                // error: can't cast between float, mat, texture
                return null;
            }

            if (type === value.type) {
                // no cast needed, types match
                return value.id;
            } else {
                var i;
                switch (type.dataType) {
                    case DataType.float:
                        if (type.dimension < value.type.dimension) {
                            // contracting cast
                            return value.id + '.' + ['x', 'xy', 'xyz', 'xyzw'][type.dimension];
                        } else {
                            // expanding cast
                            var data = [];
                            for (i=0; i<type.dimension; ++i) {
                                if (value.type.dimension === 1) {
                                    data[i] = value.id;
                                } else if (i < value.type.dimension) {
                                    data[i] = value.id + '.' + ['x', 'y', 'z', 'w'][i];
                                } else {
                                    data[i] = '0.0';
                                }
                            }
                            return this.constantDecl(type, data);
                        }
                    case DataType.mat:
                        // TODO:
                        break;
                    case DataType.texture:
                        // TODO:
                        break;
                }
            }            
        }
    }
});
