
// node
class Node {
    constructor(id, data) {
        // graph-wide node id (index)
        this.id = id;

        // node data struct
        this.data = data;

        // array of input connections - not always required so
        // container array will be allocated on demand.
        this.connections = null;

        // The node's output types. In some cases these will be
        // deduced by the type system
        this.outputTypes = null;
    }

    get typeName() {
        return this.constructor.typeName;
    }
}

// node registry
const NodeTypes = { };

function RegisterNode(typeName, cls) {
    NodeTypes[typeName] = cls;
    cls.typeName = typeName;
}
