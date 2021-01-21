
// wrap a node's upstream connection details
class Connection {
    constructor(node, output) {
        this.node = node;                       // the input node
        this.output = output || 0;              // the specific output we are connected to
        this.type = null;                       // the type we want the upstream value to be converted to
    }
}
