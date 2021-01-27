
// implementations of the supported node types

class ValueNode extends Node {
    constructor(id, json, graph) {
        var value;

        if (json.name) {
            // named constant
            value = new Value(Types[json.type], graph.system.platformConstants[json.name]);
        } else {
            // inline constant
            value = new Value(Types[json.type], json.data);
        }

        super(id, { value: value });
    }
}

class IdentifierNode extends Node {
    constructor(id, json) {
        super(id, {
            symbol: new Symbol(Types[json.type], json.name)
        });
    }
}

class AddNode extends Node {
    constructor(id, json) {
        super(id, null);
    }
}

class MulNode extends Node {
    constructor(id, json) {
        super(id, null);
    }
}

class GraphNode extends Node {
    constructor (id, json) {
        super(id, {
            graphId: json.graphId,
            graph: null                 // graph instance
        });
    }
}

class InputNode extends Node {
    constructor(id, json) {
        super(id, json);
    }
}

class OutputNode extends Node {
    constructor(id, json) {
        super(id, null);
    }
}

RegisterNode('value', ValueNode);
RegisterNode('identifier', IdentifierNode);
RegisterNode('add', AddNode);
RegisterNode('mul', MulNode);
RegisterNode('graph', GraphNode);
RegisterNode('input', InputNode);
RegisterNode('output', OutputNode);
