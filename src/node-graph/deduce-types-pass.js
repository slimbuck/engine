
class DeduceTypesPass extends TypedVisitor {
    constructor (graphSystem, inputTypes) {
        super();
        this.graphSystem = graphSystem;
        this.inputTypes = inputTypes;
    }

    // visitor functions per node type
    static functionTable = {
        value: function (node) {
            node.outputTypes = [ node.data.value.type ];
        },

        identifier: function (node) {
            node.outputTypes = [ Identifiers[node.data.name].type ];
        },

        add: function (node) {
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
        },

        mul: function (node) {
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
        },

        graph: function (node) {
            var data = node.data;

            // get upstream connected types
            var upstreamTypes = TypeSystem.getUpstreamTypes(node);

            // instantiate the graph based on upstream types
            var graph = this.graphSystem.instantiateGraph(data.graphId, upstreamTypes);

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
        },

        input: function (node) {
            var graphInputTypes = this.inputTypes;
            if (graphInputTypes) {
                // the graph was given input connection types, use those
                node.outputTypes = graphInputTypes.slice();
            }
        },

        output: function (node) {
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
    }
}
