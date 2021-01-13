
// node
var Node = function (graph, type, data) {
    // tmp?
    this.graph = graph;

    // node type (ValueNode, AddNode, MulNode, GraphNode...)
    this.type = type;

    // node data struct
    this.data = data;

    // array of input connections - not always required so
    // container array will be allocated on demand.
    this.connections = null;

    // The node's output types. In some cases these will be
    // deduced by the type system
    this.outputTypes = null;
};
