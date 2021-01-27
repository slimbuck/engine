
// graph registry
class GraphSystem {
    constructor(platformConstants) {
        // store map of platform constants
        this.platformConstants = platformConstants;
        // stores a map of graphId->graphDef
        this.graphDef = { };
        // map of graph mangled name -> graph instance
        this.graphInstances = { };
    }

    add(graphDef) {
        this.graphDef[graphDef.id] = graphDef;
    }

    instantiateGraph(id, inputTypes) {
        // generate mangled name based on graph id and its input types
        var mangledName = this.generateMangledName(id, inputTypes);

        // check graph instances, may already exist
        var graph = this.graphInstances[mangledName];
        if (!graph) {
            // otherwise, generate graph instance
            var graphDef = this.graphDef[id];
            if (!graphDef) {
                // invalid graph id
                return null;
            }

            var graph = new Graph(graphDef, this);

            // deduce and propagate node types through the graph instance
            graph.visit(new DeduceTypesPass(this, inputTypes));

            // validate that all types check out
            graph.visit(new TypeCheckingPass());

            // print result
            graph.visit(new DebugPrintPass(graph));

            // store graph
            this.graphInstances[mangledName] = graph;
        }

        return graph;
    }

    // generate a unique name for a graph with given id and set of input types
    generateMangledName(id, inputTypes) {
        return "" + id + "(" + (inputTypes || []).map(function (t) {
            return t.name;
        }).join(',') + ")";
    }
}
