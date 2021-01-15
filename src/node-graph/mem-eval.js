
var MemHandlers = {
    value: function (node, context, inputs) {
        return [ node.data.value ];
    },

    identifier: function (node, context, inputs) {

    },

    add: function (node, context, inputs) {
        // create output value
        var result = new Value(node.outputTypes[0]);

        if (inputs.length > 0) {
            // sum inputs
            var dst = result.data;
            var len = dst.length;

            for (var i=0; i<inputs.length; ++i) {
                var input = inputs[i];
                if (input) {
                    var src = input.data;
                    for (var j=0; j<len; ++j) {
                        dst[j] += src[j];
                    }
                }
            }
        }

        return [result];
    },

    mul: function (node, context, inputs) {
        // create output value
        var result = new Value(node.outputTypes[0], [1, 1, 1, 1]);

        if (inputs.length > 0) {
            // sum inputs
            var dst = result.data;
            var len = dst.length;

            for (var i=0; i<inputs.length; ++i) {
                var input = inputs[i];
                if (input) {
                    var src = input.data;
                    for (var j=0; j<len; ++j) {
                        dst[j] *= src[j];
                    }
                }
            }
        }

        return [result];
    },

    graph: function (node, context, inputs) {
        // store graph inputs
        var context = new MemContext();
        context.inputs.push(inputs);
        return MemEvalGraph(node.data.graph, context);
    },

    input: function (node, context, inputs) {
        return context.inputs[context.inputs.length - 1];
    },

    output: function (node, context, inputs) {
        return inputs;
    }
};

var MemContext = function () {
    this.symbolTable = new Map();
    this.inputs = [];
};

var MemEvalGraph = function (graph, context) {
    graph.walkOutputs(function (node) {
        // prepare inputs to this node in the correct types
        var inputs = node.connections ? node.connections.map(function (c) {
            if (!c) {
                return null;
            }
            var v = new Value(c.type);
            v.castFrom(context.symbolTable.get(c.node)[c.output]);
            return v;
        }) : null;

        var handler = MemHandlers[node.type.name];
        if (handler) {
            var outputs = handler.call(graph, node, context, inputs);
            context.symbolTable.set(node, outputs);
            console.log(node.type.name + '=' + JSON.stringify(outputs));
        }
    });

    var outputs = graph.nodesByType['output'];
    return (outputs && outputs.length) ? context.symbolTable.get(outputs[0]) : [];
};

var MemEval = function (graph) {
    var context = new MemContext();
    context.inputs.push([]);
    MemEvalGraph(graph, context);
};
