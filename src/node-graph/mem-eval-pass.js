
class MemEvalPass extends Visitor {
    constructor (inputs) {
        super();
        this.inputs = inputs;
        this.symbolTable = new Map();
        this.result = null;             // output nodes will store resulting value here
    }

    visit(node) {
        var connections = node.connections;

        // prepare inputs to this node in the correct types
        var inputs = connections ? connections.map(function (c) {
            if (!c) {
                return null;
            }
            var v = new Value(c.type);
            v.castFrom(this.symbolTable.get(c.node)[c.output]);
            return v;
        }, this) : null;

        var handler = MemEvalPass.functionTable[node.type.name];
        var outputs = handler ? handler.call(this, node, inputs) : null;
        this.symbolTable.set(node, outputs);

        console.log(node.type.name + '=' + (outputs ? outputs.map(function (o) {
            return JSON.stringify(o.data);
        }).join(",") : null));

        return outputs;
    }

    static functionTable = {
        value: function (node, inputs) {
            return [ node.data.value ];
        },

        identifier: function (node, inputs) {
            
        },

        add: function (node, inputs) {
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

        mul: function (node, inputs) {
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

        graph: function (node, inputs) {
            var subpass = new MemEvalPass(inputs);
            node.data.graph.visit(subpass);
            return subpass.result;
        },

        input: function (node, inputs) {
            return this.inputs;
        },

        output: function (node, inputs) {
            // store result on the instance
            this.result = inputs;
            return inputs;
        }
    };
}
