
// graph registry
var GraphSystem = function () {
    // map of id:JSON
    this.graphData = { };
    // map of graph mangled name -> graph instance
    this.graphInstances = { };
};

Object.assign(GraphSystem.prototype, {
    add: function (graphData) {
        this.graphData[graphData.id] = graphData;
    },

    instantiateGraph: function (id, inputTypes) {
        // generate mangled name based on graph id and its input types
        var mangledName = this.generateMangledName(id, inputTypes);

        // check graph instances, may already exist
        var graph = this.graphInstances[mangledName];
        if (!graph) {
            // otherwise, generate graph instance
            var graphData = this.graphData[id];
            if (!graphData) {
                // invalid graph id
                return null;
            }

            var graph = new Graph(graphData, this, inputTypes);

            // deduce and propagate node types through the graph instance
            // graph.deduceNodeTypes();
            graph.visit(new DeduceTypesPass(this, inputTypes));

            // validate that all types check out
            graph.visit(new TypeCheckingPass());

            // print result
            graph.visit(new DebugPrintPass(graph));

            // store graph
            this.graphInstances[mangledName] = graph;
        }

        return graph;
    },

    // generate a unique name for a graph with given id and set of input types
    generateMangledName: function (id, inputTypes) {
        return "" + id + "(" + (inputTypes || []).map(function (t) {
            return t.name;
        }).join(',') + ")";
    }
});
