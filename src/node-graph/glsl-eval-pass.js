
// glsl source generator helper functions
class GlslGen {
    // generate a number
    static number(n) {
        return "" + n;
    }

    // generate a type declaration
    static typeDecl(type) {
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
    }

    static identifierDecl(identifier) {
        return GlslGen.typeDecl(identifier.type) + " " + identifier.name;
    }

    static valueDecl(value) {
        return GlslGen.constDecl(value.type, value.data);
    }

    // generate a constant declaration
    // eg: 'vec3(0.0, 1.0, 2.0)'
    static constDecl(type, data) {
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
    }

    // generate type cast given source and destination identifiers
    static cast(dst, src) {
        var dstType = dst.type;
        var srcType = src.type;
        if (dstType.dataType !== srcType.dataType) {
            // error: can't cast between float, mat, texture
            return null;
        }

        if (dstType === srcType) {
            // no cast needed, types match
            return src.name;
        } else {
            var i;
            switch (dstType.dataType) {
                case DataType.vec:
                    if (dstType.dimension < srcType.dimension) {
                        // contracting cast
                        return src.name + '.' + ['x', 'xy', 'xyz', 'xyzw'][dstType.dimension];
                    } else {
                        // expanding cast
                        var data = [];
                        for (i=0; i<dstType.dimension; ++i) {
                            if (dstType.dimension === 1) {
                                data[i] = src.name;
                            } else if (i < srcType.dimension) {
                                data[i] = src.name + '.' + ['x', 'y', 'z', 'w'][i];
                            } else {
                                data[i] = '0';
                            }
                        }
                        return GlslGen.constDecl(dstType, data);
                    }
                case DataType.mat:
                    // TODO:
                    return null;
                case DataType.texture:
                    // TODO:
                    return null;
            }
        }
        return null;
    }

    // generate a function header given the function name and list of inputs and
    // outputs.
    static functionDecl(funcName, inputs, outputs) {
        var params = inputs.map(function (i) {
            return "in " + GlslGen.identifierDecl(i);
        }).concat(outputs.map(function (o) {
            return "out " + GlslGen.identifierDecl(o);
        }));
        return "void " + funcName + "(" + params.join(",") + ") {";
    }

    // code to invoke a function
    static functionCall(funcName, inputs, outputs) {
        return funcName + "(" + (inputs.map(function (i) {
            return i.name;
        }).concat(outputs.map(function (o) {
            return o.name;
        }))).join(",") + ");";
    }
};

// context holds globals which apply to all graph instances
class GlslContext {
    constructor() {
        this.nextFuncId = 0;
        this.graphNames = new Map();
        this.glsl = [];                             // resulting code
        this.identifiers = { };                     // map of name->identifier
    }

    genIdentifier() {
        return "func_" + this.nextFuncId++;
    }

    emit(code) {
        this.glsl.push(code);
    }
}

// passes the graph and generates glsl code
class GlslEvalPass extends Visitor {
    constructor (graph, context) {
        super();
        this.graph = graph;
        this.context = context;
        this.nextId = 0;
        this.outputs = [];                          // per-node output identifiers
        this.body = [];                             // function body glsl
        this.inputs = null;
    }

    visit(node) {
        var connections = node.connections;

        // collect the node's input connection results (and cast them to the expected type if neccessary)
        var inputs = connections ? connections.map(function (c) {
            if (!c) {
                return null;
            }

            // get the input identifier
            var inp = this.outputs[c.node.id][c.output];
            var identifier;

            if (c.type !== inp.type) {
                // cast the input to the required type
                identifier = this.genIdentifier(c.type);
                this.emit(GlslGen.identifierDecl(identifier) + " = " + GlslGen.cast(identifier, inp) + ";");
            } else {
                // no cast required
                identifier = inp;
            }

            return identifier;
        }, this) : null;

        // invoke node handler which will return a fragment per output
        var handler = GlslEvalPass.functionTable[node.type.name];
        if (!handler) {
            // warning, error, fatal, cry
            return;
        }

        // invoke node handler
        this.outputs[node.id] = handler.call(this, node, inputs);
    }

    genIdentifier(type) {
        return new Identifier(type, "id_" + this.nextId++);
    }

    // emit function code
    emit(code) {
        this.body.push(code);
    }

    static functionTable = {
        value: function (node, inputs) {
            var value = node.data.value;
            var id = this.genIdentifier(value.type);
            this.emit(GlslGen.identifierDecl(id) + " = " + GlslGen.valueDecl(value));
            return [id];
        },

        identifier: function (node, inputs) {
            return [this.context.identifiers[node.data.name]];
        },

        // implement an infix operator which just applies the operator
        // to the list of inputs, for example add:
        // vec3 id = a1 + a2 + a3;
        infixOp: function (node, inputs, op) {
            var id = this.genIdentifier(node.outputTypes[0]);
            this.emit(GlslGen.identifierDecl(id) + " = " + inputs.map(function (i) {
                return i.name;
            }).join(op) + ";");
            return [id];
        },

        add: function (node, inputs) {
            return GlslEvalPass.functionTable.infixOp.call(this, node, inputs, " + ");
        },

        mul: function (node, inputs) {
            return GlslEvalPass.functionTable.infixOp.call(this, node, inputs, " * ");
        },

        graph: function (node, inputs) {
            var subGraph = node.data.graph;

            var funcName = this.context.graphNames.get(subGraph);
            if (!funcName) {
                // recursively evaluate subgraph
                subGraph.visit(new GlslEvalPass(subGraph, this.context));

                // retrieve the function name
                funcName = this.context.graphNames.get(node.data.graph);
            }

            // generate an identifier for each graph result
            var outputs = node.outputTypes.map(function (t) {
                var id = this.genIdentifier(t);
                this.emit(GlslGen.identifierDecl(id) + ";");
                return id;
            }, this);

            // invoke subgraph/function call
            this.emit(GlslGen.functionCall(funcName, inputs || [], outputs));

            return outputs;
        },

        input: function (node, inputs) {
            // generate identifiers for each graph inputs
            this.inputs = node.outputTypes.map(function (t) {
                return this.genIdentifier(t);
            }, this);
            return this.inputs;
        },

        output: function (node, inputs) {
            var connections = node.connections;

            // generate output identifiers
            var outputs = node.outputTypes.map(function (t, i) {
                var id = this.genIdentifier(t);
                var c = connections[i];
                this.emit(id.name + " = " + this.outputs[c.node.id][c.output].name + ";");
                return id;
            }, this);

            // generate a function identifier
            var funcName = this.context.genIdentifier();

            // emit function declaration
            this.context.emit(GlslGen.functionDecl(funcName, this.inputs || [], outputs || []));

            // emit function body
            this.body.forEach(function (l) {
                this.context.emit("    " + l);
            }, this);

            // end function definition
            this.context.emit("}");

            // store the function name for peeps who need to invoke
            this.context.graphNames.set(this.graph, funcName);

            return outputs;
        }
    }
};
