
// implementations of the supported node types

var ValueNode = {
    name: 'value',

    createData: function (data) {
        return {
            name: data.name,
            static: !!data.static,
            value: new Value(Types[data.type], data.data)
        };
    },

    deduceTypes: function (node) {
        node.outputTypes = [ node.data.value.type ];
    }
};

var IdentifierNode = {
    name: 'identifier',

    createData: function (data) {
        return {
            name: data.name,
            static: !!data.static
        }
    },

    deduceTypes: function (node) {
        node.outputTypes = [ Identifiers[node.data.name].type ];
    }
};

var AddNode = {
    name: 'add',

    createData: function (data) {
        return null;
    },

    deduceTypes: function (node) {
        if (node.connections) {
            // get the upstream types
            var upstreamTypes = TypeSystem.getUpstreamTypes(node);
            // calculate the containing type
            var containerType = TypeSystem.determineContainingType(upstreamTypes);
            if (containerType && containerType.dataType === DataType.vec) {
                // use the container type for input and output types
                node.outputTypes = [ containerType ];
                node.connections.forEach(function (c) {
                    c.type = containerType;
                });
            } else {
                // input type error
            }
        }
    }
};

var MulNode = {
    name: 'mul',

    createData: function (data) {
        return null;
    },

    deduceTypes: function (node) {
        if (node.connections) {
            // get the upstream types
            var upstreamTypes = TypeSystem.getUpstreamTypes(node);
            // calculate the containing type
            var containerType = TypeSystem.determineContainingType(upstreamTypes);
            if (containerType && containerType.dataType === DataType.vec) {
                // use the container type for input and output types
                node.outputTypes = [ containerType ];
                node.connections.forEach(function (c) {
                    c.type = containerType;
                });
            } else {
                // type error
            }
        }
    }
};

var GraphNode = {
    name: 'graph',

    createData: function (data) {
        return {
            graphId: data.graphId,
            graph: null                 // graph instance
        };
    },

    deduceTypes: function (node) {
        var data = node.data;

        // get upstream connected types
        var upstreamTypes = TypeSystem.getUpstreamTypes(node);

        // instantiate the graph based on upstream types
        var graph = this.system.instantiateGraph(data.graphId, upstreamTypes);

        // populate types from the graph instance types
        var graphInputNode = graph.nodesByType['input'];
        if (graphInputNode) {
            node.connections.forEach(function (c, i) {
                if (c) {
                    c.type = graphInputNode[0].outputTypes[i];
                }
            });
        }

        // populate output types
        var graphOutputNode = graph.nodesByType['output'];
        if (graphOutputNode) {
            node.outputTypes = graphOutputNode[0].connections.map(function (c) {
                return c ? c.type : null;
            });
        }

        // store the instance
        data.graph = graph;
    }
};

var InputNode = {
    name: 'input',

    createData: function (data) {
        return null;
    },

    deduceTypes: function (node) {
        var graphInputTypes = this.inputTypes;
        if (graphInputTypes) {
            // the graph was given input connection types, use those
            node.outputTypes = graphInputTypes.slice();
        }
    }
};

var OutputNode = {
    name: 'output',

    createData: function (data) {
        return null;
    },

    deduceTypes: function (node) {
        // output types mirror input types
        node.connections.forEach(function (c) {
            if (c) {
                c.type = c.node.outputTypes[c.output];
            }
        });
        node.outputTypes = node.connections.map(function (c) {
            return c ? c.type : null;
        });
    }
};

var NodeTypes = {
    value: ValueNode,
    identifier: IdentifierNode,
    add: AddNode,
    mul: MulNode,
    graph: GraphNode,
    input: InputNode,
    output: OutputNode
};
