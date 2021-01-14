
// function are invoked with GlslContext in this
var GlslGen = {
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
    cast: function (dstType, srcType, srcId) {
        if (dstType.dataType !== srcType.dataType) {
            // error: can't cast between float, mat, texture
            return null;
        }

        if (dstType === srcType) {
            // no cast needed, types match
            return srcId;
        } else {
            var i;
            switch (dstType.dataType) {
                case DataType.vec:
                    if (dstType.dimension < srcType.dimension) {
                        // contracting cast
                        return srcId + '.' + ['x', 'xy', 'xyz', 'xyzw'][dstType.dimension];
                    } else {
                        // expanding cast
                        var data = [];
                        for (i=0; i<dstType.dimension; ++i) {
                            if (dstType.dimension === 1) {
                                data[i] = srcId;
                            } else if (i < srcType.dimension) {
                                data[i] = srcId + '.' + ['x', 'y', 'z', 'w'][i];
                            } else {
                                data[i] = '0';
                            }
                        }
                        return GlslGen.constDecl(dstType, data);
                    }
                case DataType.mat:
                    // TODO:
                    break;
                case DataType.texture:
                    // TODO:
                    break;
            }
        }            
    },

    // generate a function header given the function name and list of inputs and
    // outputs.
    functionDecl: function (functionId, inputTypes, inputIds, outputTypes, outputIds) {
        var result = [];
        var i;

        if (inputTypes && inputTypes.length && inputIds && inputIds.length) {
            for (i=0; i<inputTypes.length; ++i) {
                result.push("in " + GlslGen.typeDecl(inputTypes[i]) + " " + inputIds[i]);
            }
        }

        if (outputTypes && outputTypes.length && outputIds && outputIds.length) {
            for (i=0; i<outputTypes.length; ++i) {
                result.push("out " + GlslGen.typeDecl(outputTypes[i]) + " " + outputIds[i]);
            }
        }

        return "void " + functionId + "(" + result.join(",") + ") {";
    },

    // code to invoke a function
    functionCall: function (functionId, inputIds, outputIds) {
        return functionId + "(" + (inputIds || []).concat(outputIds || []).join(",") + ");";
    }
};

// node handlers
var GlslHandlers = {
    value: function (node, context) {
        var value = node.data.value;
        var id = context.symbolTable.get(node)[0];
        var typeDecl = GlslGen.typeDecl(value.type);
        var constDecl = GlslGen.constDecl(value.type, value.data);
        context.emit(typeDecl + " " + id + " = " + constDecl + ";");
        context.symbolTable.set(node, [ id ]);
    },

    identifier: function (node, context) {
        var id = node.data.name;
        var typeDecl = GlslGen.typeDecl(node.outputTypes[0]);
        context.emit(typeDecl + " " + id + ";");
        context.symbolTable.set(node, id);
    },

    // implement an infix operator which just applies the operator
    // to the list of inputs, for example add:
    // vec3 id = a1 + a2 + a3;
    infixOp: function (node, context, op) {
        var id = context.symbolTable.get(node)[0];
        var typeDecl = GlslGen.typeDecl(node.outputTypes[0]);

        var castInputs = [];
        for (var i=0; i<node.connections.length; ++i) {
            var c = node.connections[i];
            if (c) {
                castInputs.push(GlslGen.cast(c.type, c.node.outputTypes[c.output], context.symbolTable.get(c.node)[c.output]))
            }
        }

        context.emit(typeDecl + " " + id + " = " + castInputs.join(op) + ";");
        context.symbolTable.set(node, [ id ]);
    },

    add: function (node, context) {
        GlslHandlers.infixOp(node, context, " + ");
    },

    mul: function (node, context) {
        GlslHandlers.infixOp(node, context, " * ");
    },

    graph: function (node, context) {
        // get the function id
        var funcId = context.symbolTable.get(node.data.graph);
        var inputIds = node.connections.map(function (c) {
            var outputIds = c ? context.symbolTable.get(c.node) : null;
            return outputIds ? outputIds[c.output] : null;
        });
        var outputIds = context.symbolTable.get(node);
        // emit output variables
        outputIds.forEach(function (o, i) {
            context.emit(GlslGen.typeDecl(node.outputTypes[i]) + " " + o + ";");
        });
        context.emit(GlslGen.functionCall(funcId, inputIds, outputIds));
    },

    input: function (node, context) {

    },

    output: function (node, context) {
        var outputIds = context.symbolTable.get(node);
        outputIds.forEach(function (o, i) {
            var c = node.connections[i];
            if (c) {
                context.emit(o + " = " + context.symbolTable.get(c.node)[c.output] + ";");
            }
        });
    }
};

var GlslEvalContext = function () {
    this.symbolTable = new Map();
    this.nextId = 0;
    this.output = [];
    this.indentation = 0;
};

Object.assign(GlslEvalContext.prototype, {
    identifier: function () {
        return "" + this.nextId++;
    },

    // generate a unique identifier
    emit: function (code) {
        this.output.push(" ".repeat(this.indentation * 4) + code);
    }
});

var GlslEvalGraph = function (graph, context) {
    // generate ids for node outputs
    graph.walkOutputs(function (node) {
        context.symbolTable.set(node, node.outputTypes ? node.outputTypes.map(function (o) {
            return node.type.name + '_' + context.identifier();
        }) : null);
    });

    // get the graph's input and output nodes
    var input = graph.nodesByType['input'];
    var inputTypes = null;
    var inputIds = null;
    if (input && input.length) {
        inputTypes = input[0].outputTypes;
        inputIds = context.symbolTable.get(input[0]);
    }

    var output = graph.nodesByType['output'];
    var outputTypes = null;
    var outputIds = null;
    if (output && output.length) {
        outputTypes = output[0].outputTypes;
        outputIds = context.symbolTable.get(output[0]);
    }

    // wrap the graph in a function call
    var id = 'func_' + context.identifier();

    // start function definition
    context.emit(GlslGen.functionDecl.call(context, id, inputTypes, inputIds, outputTypes, outputIds));
    context.indentation++;

    // generate the function internals
    graph.walkOutputs(function (node) {
        var handler = GlslHandlers[node.type.name];
        if (handler) {
            handler.call(graph, node, context);
        }
    });

    // end function definition
    context.indentation--;
    context.emit("}");
    context.symbolTable.set(graph, [ id ]);
};

var GlslEval = function (graph) {
    // construct an evaluation context
    var context = new GlslEvalContext();

    // evaluate any sub graphs first. these will be translated to callable functions
    // and must be output before this graph code.
    graph.walkOutputs(function (node) {
        if (node.type.name === 'graph') {
            GlslEvalGraph(node.data.graph, context);
        }
    });

    GlslEvalGraph(graph, context);

    return context.output.join("\n");
};
