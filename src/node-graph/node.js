
// node
class Node {
    constructor(type, data, id) {
        // node type object, one of see NodeTypes.***
        this.type = type;

        // node data struct
        this.data = data;

        // graph-wide node id (index)
        this.id = id;

        // array of input connections - not always required so
        // container array will be allocated on demand.
        this.connections = null;

        // The node's output types. In some cases these will be
        // deduced by the type system
        this.outputTypes = null;
    }
}
