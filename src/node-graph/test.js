
// graph data for a 'doubler'
var doublerGraphData = {
    id: 0,
    nodes: [
        { type: 'input' },
        { type: 'value', data: { name: 'two', static: true, type: 'float', data: [2] } },
        { type: 'mul' },
        { type: 'output' }
    ],
    connections: [
        { node: 2, inputs: [ { node: 0 }, { node: 1} ] },
        { node: 3, inputs: [ { node: 2 } ] }
    ]
};

// graph data example using subgraph
var testGraphData = {
    id: 1,
    nodes: [
        { type: 'value', data: { name: 'a vec 2', static: true, type: 'vec2', data: [0, 1] } },
        { type: 'value', data: { name: 'a vec 3', static: true, type: 'vec3', data: [1, 2, 3] } },
        { type: 'add' },
        { type: 'graph', data: { graphId: 0 } },
        { type: 'value', data: { name: 'a vec 4', static: true, type: 'vec4', data: [4, 5, 6, 7] } },
        { type: 'mul' },
        { type: 'graph', data: { graphId: 0 } },
        { type: 'output' }
    ],
    connections: [
        { node: 2, inputs: [ { node: 0 }, { node: 1 } ] },
        { node: 3, inputs: [ { node: 2 } ] },
        { node: 5, inputs: [ { node: 3 }, { node: 4 } ] },
        { node: 6, inputs: [ { node: 5 } ] },
        { node: 7, inputs: [ { node: 6 } ] }
    ]
};

// create the graph registry and register graph data
var graphSystem = new GraphSystem();
graphSystem.add(doublerGraphData);
graphSystem.add(testGraphData);

var g = graphSystem.instantiateGraph(1);

// evaluate glsl
console.log("glsl:\n" + GlslEval(g));

MemEval(g);