
// deduce the types flowing around the node graph.
class DeduceTypesPass extends Visitor {
    constructor (graphSystem, inputTypes) {
        super();
        this.graphSystem = graphSystem;
        this.inputTypes = inputTypes;
    }

    visit(node) {
        var connections = node.connections;

        // make a list of this node's upstream types
        var inputTypes = connections ? connections.map(function (c) {
            return c.node.outputTypes[c.output];
        }) : null;

        var func = DeduceTypesPass.functionTable[node.typeName];
        func.call(this, node, inputTypes);
    }

    // visitor functions per node type
    static functionTable = {
        value: function (node, inputTypes) {
            node.outputTypes = [ node.data.value.type ];
        },

        identifier: function (node, inputTypes) {
            node.outputTypes = [ Identifiers[node.data.name].type ];
        },

        add: function (node, inputTypes) {
            if (inputTypes) {
                // calculate the containing type
                var containerType = TypeSystem.determineContainingType(inputTypes);
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

        mul: function (node, inputTypes) {
            if (inputTypes) {
                // calculate the containing type
                var containerType = TypeSystem.determineContainingType(inputTypes);
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

        graph: function (node, inputTypes) {
            var data = node.data;

            // instantiate the graph based on upstream types
            var graph = this.graphSystem.instantiateGraph(data.graphId, inputTypes);

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

        input: function (node, inputTypes) {
            var graphInputTypes = this.inputTypes;
            if (graphInputTypes) {
                // the graph was given input connection types, use those
                node.outputTypes = graphInputTypes.slice();
            }
        },

        output: function (node, inputTypes) {
            // output types mirror input types
            node.connections.forEach(function (c, i) {
                if (c) {
                    c.type = inputTypes[i];
                }
            });
            node.outputTypes = inputTypes;
        }
    }
}
