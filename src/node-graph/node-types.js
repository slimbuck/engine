
// implementations of the supported node types

class ValueNode extends Node {
    constructor(id, json) {
        super(id, {
            name: json.name,
            static: !!json.static,
            value: new Value(Types[json.type], json.data)
        });
    }
}

class IdentifierNode extends Node {
    constructor(id, json) {
        super(id, {
            name: json.name,
            static: !!json.static
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
