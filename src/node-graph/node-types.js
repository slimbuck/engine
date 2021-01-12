
// implementations of the supported node types

var ValueNode = {
    createData: function (data) {
        return {
            name: data.name,
            static: !!data.static,
            value: new Value(data.type, data.data)
        };
    },

    deduceTypes: function (node) {
        node.outputTypes = [ node.data.value.type ];
    }
};

var IdentifierNode = {
    createData: function (data) {
        return {
            name: data.name
        }
    },

    deduceTypes: function (node) {
        node.outputTypes = [ Identifiers[node.data.name].type ];
    }
};

var AddNode = {
    createData: function (data) {
        return null;
    },

    deduceTypes: function (node) {
        if (node.connections) {
            // get the upstream types
            var upstreamTypes = TypeSystem.getUpstreamTypes(node);
            // calculate the containing type
            var containerType = TypeSystem.determineContainingType(upstreamTypes);
            if (containerType && containerType.dataType === DataType.Vec) {
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
    createData: function (data) {
        return null;
    },

    deduceTypes: function (node) {
        if (node.connections) {
            // get the upstream types
            var upstreamTypes = TypeSystem.getUpstreamTypes(node);
            // calculate the containing type
            var containerType = TypeSystem.determineContainingType(upstreamTypes);
            if (containerType && containerType.dataType === DataType.Vec) {
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
    createData: function (data) {
        return {
            graphId: data.graphId,
            graphInstance: null
        };
    },

    deduceTypes: function (node) {
        var data = node.data;

        // get upstream connected types
        var upstreamTypes = TypeSystem.getUpstreamTypes(node);

        // instantiate the graph based on upstream types
        var graphInstance = node.graph.system.instantiateGraph(data.graphId, upstreamTypes);

        // populate types from the graph instance types
        node.inputTypes = graphInstance.inputs.map(function (i) {
            var c = i ? i.node.connections[i.output] : null
            return c ? c.type : null;
        });
        node.outputTypes = graphInstance.outputs.map(function (o) {
            return o ? o.node.outputTypes[o.output] : null;
        });

        data.graphInstance = graphInstance;
    }
};

var NodeTypes = {
    'value': ValueNode,
    'identifier': IdentifierNode,
    'add': AddNode,
    'mul': MulNode,
    'graph': GraphNode
};
