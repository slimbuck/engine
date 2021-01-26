
class DebugPrintPass extends Visitor {
    constructor(graph) {
        super();
        // store the graph so we can determine node indices etc
        this.graph = graph;
        console.log("graph=" + graph.id + ":");
    }

    visit(node) {
        // node basics
        console.log("    node " + this.graph.nodes.indexOf(node) + " " + node.typeName);

        // node data
        if (node.data) {
            if (node.constructor === GraphNode) {
                console.log("        data={graphId=" + node.data.graphId + "}");
            } else {
                console.log("        data=" + JSON.stringify(node.data));
            }
        }

        // node connections
        if (node.connections) {
            var i;
            for (i=0; i<node.connections.length; ++i) {
                var c = node.connections[i];
                console.log("        connection" +
                            " node=" + this.graph.nodes.indexOf(c.node) +
                            " output=" + c.output +
                            " type=" + (c.type ? c.type.name : "null"));
            }
        }

        // output types
        console.log("        outputTypes=" + (node.outputTypes ? JSON.stringify(node.outputTypes.map(function (t) {
            return t.name;
        })) : null));
    }
}
