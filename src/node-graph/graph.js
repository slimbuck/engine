
// graph
var Graph = function (graphData, system) {
    this.system = system;
    this.id = null;
    this.nodes = [ ];
    this.inputs = [ ];
    this.outputs = [ ];

    if (graphData) {
        this.load(graphData);
    }
};

Object.assign(Graph.prototype, {
    createNode: function (typeString, data) {
        // get the node type object
        var type = NodeTypes[typeString];
        if (!type) {
            return null;                    // invalid node type
        }

        // allow node types to process and validate construction data
        var nodeData = type.createData ? type.createData(data) : data;

        // construct the node instance
        var node = new Node(this, type, nodeData);

        // store it
        this.nodes.push(node);

        // and return
        return node;
    },

    createConnection: function (node, input, srcNode, srcOutput) {
        // get the node
        var n = this.nodes[node];
        if (!n) {
            return null;                    // invalid connection
        }

        // get the upstream node
        var sn = this.nodes[srcNode];
        if (!sn) {
            return null;                    // invalid connection
        }

        // might be the node's first connection
        if (n.connections === null) {
            n.connections = [ ];
        }

        // create the connection instance
        var connection = new Connection(sn, srcOutput);

        // store it
        n.connections[input || 0] = connection;

        // and return
        return connection;
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

    // walk the graph in execution order starting at node. update
    // seen structure with nodes we've already seen and skip those present.
    // node - the starting node to walk
    // callback - function takes a single parameter, the node
    // seen - a Set() storing the nodes already seen
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
            node.deduceTypes();
        });
    },

    // Walk the graph checking that automatic conversions (i.e. check
    // that automatic conversions between upstream types and input types
    // are valid).
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
