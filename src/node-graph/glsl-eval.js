
// function are invoked with GlslContext in this
var GlslGen = {
    // generate a unique identifier
    identifier: function () {
        return "id_" + this.nextId++;
    },

    // generate a number
    number: function (n) {
        return "" + n;
    },

    // generate a type declaration
    typeDecl: function (type) {
        switch (type.dataType) {
            case DataType.vec:
                return [null, 'float', 'vec2', 'vec3', 'vec4'][type.dimension];
            case DataType.mat:
                return [null, null, 'mat2', 'mat3', 'mat4'][type.dimension];
            case DataType.texture:
                return ['texture', null, null, null, null][type.dimension];
            default:
                return null;
        }
    },

    // generate a constant declaration
    // eg: 'vec3(0.0, 1.0, 2.0)'
    constDecl: function (type, data) {
        var result = GlslGen.typeDecl(type) + "(";
        var i;
        switch (type.dataType) {
            case DataType.vec:
                for (i=0; i<type.dimension; ++i) {
                    result += (i ? "," : "") + GlslGen.number(data[i]);
                }
                break;
            case DataType.mat:
                for (i=0; i<type.dimension*type.dimension; ++i) {
                    result += (i ? "," : "") + GlslGen.number(data[i]);
                }
                break;
            case DataType.texture:
                // TODO:
                break;
        }
        result += ")";
        return result;
    },

    // generate a type case
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
                case DataType.vec:
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
                                data[i] = '0';
                            }
                        }
                        return GlslGen.constantDecl(type, data);
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
};

// node handlers
var GlslHandlers = {
    value: function (node, context) {
        // generate a value id
        var value = node.data.value;
        var id = GlslGen.identifier.call(context);
        var typeDecl = GlslGen.typeDecl.call(context, value.type);
        var constDecl = GlslGen.constDecl.call(context, value.type, value.data);
        context.emit(typeDecl + " " + id + " = " + constDecl + ";");
    },

    identifier: function (node, context) {

    },

    add: function (node, context) {
        var id = GlslGen.identifier.call(context);
        var typeDecl = GlslGen.typeDecl.call(context, node.outputTypes[0]);

        for (var i=0; i<node.connections.length; ++i) {

        }
    },

    mul: function (node, context) {

    },

    graph: function (node, context) {

    },

    input: function (node, context) {

    },

    output: function (node, context) {

    }
};

var GlslEvalContext = function (symbolTable) {
    this.symbolTable = symbolTable;
    this.nextId = 0;
    this.result = [];
};

Object.assign(GlslEvalContext.prototype, {
    // generate a unique identifier
    emit: function (code) {
        this.result.push(code);
    }
});

var GlslEval = function (graph, symbolTable) {
    // construct an evaluation context
    var context = new GlslEvalContext(symbolTable);

    // walk the graph invoking the corresponding glsl node handler
    graph.walkOutputs(function (node) {
        var handler = GlslHandlers[node.type.name];
        if (handler) {
            handler.call(graph, node, context);
        }
    });

    return context.result;
};
