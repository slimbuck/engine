
// platform identifiers
var Identifiers = {
    time: { static: false, type: Types.Float, value: [0] },
    platform: { static: true, type: Types.Float, value: [0] }
};

// type system implements type validation and deduction
var TypeSystem = {
    // Deduce a node's input and output types. At this point all upstream
    // node types have already been deduced.
    deduceNodeTypes: function (node) {
        switch (node.type) {
            case 'value':
                // output type just matches the type of the contained value
                node.outputTypes = [ node.data.value.type ];
                break;
            case 'identifier':
                // identifier type is provided by the system
                node.outputTypes = [ Identifiers[node.data.name].type ];
                break;
            case 'add':
            case 'mul':
                if (node.connections) {
                    // get the upstream types
                    var upstreamTypes = TypeSystem.getUpstreamTypes(node);
                    // calculate the containing type
                    var containerType = TypeSystem.determineContainingType(upstreamTypes);
                    if (containerType) {
                        // use the container type for input and output types
                        node.outputTypes = [ containerType ];
                        node.connections.forEach(function (c) {
                            c.type = containerType;
                        });
                    } else {
                        // type error
                    }
                }
                break;
            case 'graph':
                // TODO
                break;
        }
    },

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

// graph
var Graph = function (graphData) {
    this.id = null;
    this.nodes = [ ];
    this.inputs = [ ];
    this.outputs = [ ];

    if (graphData) {
        this.load(graphData);
    }
};

Object.assign(Graph.prototype, {
    createNode: function (type, data) {
        // construct node data
        var nodeData;
        switch (type) {
            case 'value':
                nodeData = {
                    name: data.name,
                    static: data.static,
                    value: new Value(data.type, data.data)
                };
                break;
            default:
                nodeData = data;
                break;
        }
        this.nodes.push({
            type: type,
            data: nodeData,
            connections: null,              // array of input connections - not always required and will be allocated on demand
            outputTypes: [],                // output types, sometimes deduced after graph construction
        });
    },

    createConnection: function (node, input, srcNode, srcOutput) {
        var n = this.nodes[node];
        if (n.connections === null) {
            n.connections = [ ];
        }
        n.connections[input || 0] = {
            node: this.nodes[srcNode],      // input node
            output: srcOutput || 0,         // input node output
            type: null                      // we'll convert the input data to this type
        };
    },

    createInput: function (node, input) {
        this.inputs.push({ node: this.nodes[node], input: input || 0 });
    },

    createOutput: function (node, output) {
        this.outputs.push({ node: this.nodes[node], output: output || 0 });
    },

    // load graph data
    load: function (graphData) {
        var i;
        var nodes = graphData.nodes;
        var connections = graphData.connections;
        var inputs = graphData.inputs;
        var outputs = graphData.outputs;

        // id
        this.id = graphData.id;

        // nodes
        for (i=0; i<nodes.length; ++i) {
            var n = nodes[i];
            this.createNode(n.type, n.data || null);
        }

        // connections
        for (i=0; i<connections.length; ++i) {
            var c = connections[i];
            this.createConnection(c.node, c.input, c.srcNode, c.srcOutput);
        }

        // inputs
        if (inputs) {
            for (i=0; i<inputs.length; ++i) {
                var i = inputs[i];
                this.createInput(i.node, i.input);
            }
        }

        // outputs
        if (outputs) {
            for (i=0; i<outputs.length; ++i) {
                var o = outputs[i];
                this.createOutput(o.node, o.output);
            }
        }
    },

    // walk the graph nodes in execution order while skipping duplicates
    // seen is a Set() storing the nodes already seen
    // callback takes a single parameter, the node
    walk: function (node, callback, seen) {
        function recurse(node) {
            if (seen.has(node)) {
                return;
            }

            // flag node as seen
            seen.add(node);

            // depth first search, follow inputs first
            var connections = node.connections;
            if (connections) {
                for (var i=0; i<connections.length; ++i) {
                    var c = connections[i];
                    recurse.call(this, c.node);
                }
            }

            // inputs are done, raise node callback
            callback.call(this, node);
        }

        recurse.call(this, node);
    },

    // Perform a depth first walk of the graph starting at the 
    // output nodes of the graph
    walkOutputNodes: function (callback) {
        var seen = new Set();

        // walk all nodes flagged as outputs
        for (var i=0; i<this.outputs.length; ++i) {
            var output = this.outputs[i];
            this.walk(output.node, callback, seen);
        }
    },

    // Propagate input and output types around the graph. At load time
    // generally only the core value nodes and identifiers have types.
    deduceNodeTypes: function () {
        this.walkOutputNodes(function (node) {
            TypeSystem.deduceNodeTypes(node);
        });
    },

    // Walk the graph checking that automatic conversions (i.e. that
    // conversions between upstream types and input types are valid).
    // At this point it is assumed types have been propagated throughout
    // the graph.
    performTypeChecking: function () {
        this.walkOutputNodes(function (node) {
            // run through node connections checking upstream vs input type
            if (node.connections) {
                for (var i=0; i<node.connections.length; ++i) {
                    var c = node.connections[i];
                    
                    var srcType = c.node.outputTypes[c.output];
                    if (!srcType) {
                        console.log('node is missing output type' +
                                    ' graph=' + this.id +
                                    ' node=' + this.nodes.indexOf(c.node) +
                                    ' output=' + c.output);
                    } else {
                        var dstType = c.type;
                        if (!dstType) {
                            console.log('node is missing input type' +
                                        ' graph=' + this.id +
                                        ' node=' + this.nodes.indexOf(node) +
                                        ' input=' + i);
                        } else {
                            if (!TypeSystem.isValidTypeConversion(dstType, srcType)) {
                                console.log('invalid type conversion' +
                                            ' graph=' + this.id +
                                            ' node=' + this.nodes.indexOf(node) +
                                            ' dst=' + dstType.name +
                                            ' src=' + srcType.name);
                            }
                        }
                    }
                }
            }
        });
    },

    // extract the values from the shader
    extractValues: function () {

    },

    // Print the graph structure to the console
    debugPrint: function () {
        this.walkOutputNodes(function (node) {
            // node basics
            console.log("node " + this.nodes.indexOf(node) + " " + node.type);
            // node data
            console.log("    data=" + JSON.stringify(node.data));
            // node connections
            if (node.connections) {
                var i;
                for (i=0; i<node.connections.length; ++i) {
                    var c = node.connections[i];
                    console.log("    connection" +
                                " node=" + this.nodes.indexOf(c.node) +
                                " output=" + c.output +
                                " type=" + (c.type ? c.type.name : "null"));
                }
            }
            // output types
            console.log("    outputTypes=" + JSON.stringify(node.outputTypes.map(function (t) {
                return t.name;
            })));
        });
    }
});

// shader graph
var ShaderGraph = function () {
    this.graphsById = { };
};

Object.assign(ShaderGraph.prototype, {
    addGraph: function (graph) {
        this.graphsById[graph.id] = graph;
    }
});
