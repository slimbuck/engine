
// graph
class Graph {
    constructor(graphDef, system) {
        this.id = null;
        this.nodes = [ ];
        this.nodesByType = { };
        this.system = system;

        if (graphDef) {
            this.load(graphDef);
        }
    }

    createNode(typeName, data) {
        // get the node type object
        var type = NodeTypes[typeName];
        if (!type) {
            // invalid/unrecognized node type
            return null;
        }

        // construct the node instance
        var node = new type(this.nodes.length, data, this);

        // store the node by id
        this.nodes.push(node);

        // store the node by type
        var byType = this.nodesByType[typeName];
        if (byType) {
            byType.push(node);
        } else {
            this.nodesByType[typeName] = [node];
        }

        // and return
        return node;
    }

    createConnection(node, input, srcNode, srcOutput) {
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
    }

    // load graph data
    load(graphDef) {
        var i, j;
        var nodes = graphDef.nodes;
        var connections = graphDef.connections;

        // id
        this.id = graphDef.id;

        // nodes
        for (i=0; i<nodes.length; ++i) {
            var n = nodes[i];
            this.createNode(n.type, n.data || null);
        }

        // connections
        for (i=0; i<connections.length; ++i) {
            var c = connections[i];
            for (j=0; j<c.inputs.length; ++j) {
                var input = c.inputs[j];
                this.createConnection(c.node, j, input.node, input.output);
            }
        }
    }

    // walk the graph in execution order starting at node. update
    // seen structure with nodes we've already seen and skip those present.
    // node - the starting node to walk
    // callback - function takes a single parameter, the node
    // seen - a Set() storing the nodes already seen
    walk(node, callback, seen) {
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
    }

    // Perform a depth first walk of the graph starting at the 
    // output nodes of the graph
    walkOutputs(callback) {
        var rootNode = this.nodesByType[OutputNode.typeName];
        if (rootNode) {
            var seen = new Set();
            this.walk(rootNode[0], callback, seen);
        }
    }

    // visit the tree with the provided visitor
    visit(visitor) {
        this.walkOutputs(function (node) {
            visitor.visit.call(visitor, node);
        });
    }
}
