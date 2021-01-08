
// graph data for a 'doubler'
var doublerGraphData = {
    id: 0,
    nodes: [
        { type: 'value', data: { name: 'two', static: true, type: 'Float', data: [2] } },
        { type: 'mul' },
    ],
    connections: [
        { node: 1, input: 0, srcNode: 0, srcOutput: 0 }
    ],
    inputs: [
        { node: 1, input: 1 }
    ],
    outputs: [
        { node: 1, output: 0 }
    ]
};

// graph data example using subgraph
var testGraphData = {
    id: 1,
    nodes: [
        { type: 'value', data: { name: 'my vec 2', static: true, type: 'Vec2', data: [0, 1] } },
        { type: 'value', data: { name: 'my vec 3', static: true, type: 'Vec3', data: [1, 2, 3] } },
        { type: 'value', data: { name: 'my vec 4', static: true, type: 'Vec4', data: [4, 5, 6, 7] } },
        { type: 'identifier', data: { name: 'time' } },
        { type: 'add' },
        { type: 'graph', data: { graphId: 0 } },
        { type: 'graph', data: { graphId: 0 } }
    ],
    connections: [
        { node: 4, input: 0, srcNode: 0, srcOutput: 0 },
        { node: 4, input: 1, srcNode: 1, srcOutput: 0 },
        { node: 4, input: 2, srcNode: 2, srcOutput: 0 },
        { node: 4, input: 3, srcNode: 3, srcOutput: 0 },
        { node: 5, input: 0, srcNode: 4, srcOutput: 0 },
        { node: 6, input: 0, srcNode: 5, srcOutput: 0 }
    ],
    inputs: [
        
    ],
    outputs: [
        { node: 6, output: 0 }
    ]
};

// generate a test graph
var graph = new Graph(testGraphData);
// print it
graph.debugPrint();
// perform type checking - this should fail as we haven't run the 'deduceNodeTypes' yet
graph.performTypeChecking();
console.log('generating types...............................');
// deduce node types
graph.deduceNodeTypes();
// graph should now have more info
graph.debugPrint();
// type checking should now succeed
graph.performTypeChecking();

/*
// contruct a shader graph from subgraphs
var shaderGraph = new ShaderGraph();
shaderGraph.addGraph(new Graph(doublerGraphData));
shaderGraph.addGraph(new Graph(testGraphData));
*/