
// implementations of the supported node types

var ValueNode = {
    name: 'value',

    createData: function (data) {
        return {
            name: data.name,
            static: !!data.static,
            value: new Value(Types[data.type], data.data)
        };
    }
};

var IdentifierNode = {
    name: 'identifier',

    createData: function (data) {
        return {
            name: data.name,
            static: !!data.static
        }
    }
};

var AddNode = {
    name: 'add',

    createData: function (data) {
        return null;
    }
};

var MulNode = {
    name: 'mul',

    createData: function (data) {
        return null;
    }
};

var GraphNode = {
    name: 'graph',

    createData: function (data) {
        return {
            graphId: data.graphId,
            graph: null                 // graph instance
        };
    }
};

var InputNode = {
    name: 'input',

    createData: function (data) {
        return null;
    }
};

var OutputNode = {
    name: 'output',

    createData: function (data) {
        return null;
    }
};

var NodeTypes = {
    value: ValueNode,
    identifier: IdentifierNode,
    add: AddNode,
    mul: MulNode,
    graph: GraphNode,
    input: InputNode,
    output: OutputNode
};
