
// 'doubler' graph definition
var doublerGraphDef = {
    id: 0,
    nodes: [
        { type: 'input' },
        { type: 'value', data: { type: 'float', data: [2] } },
        { type: 'mul' },
        { type: 'output' }
    ],
    connections: [
        { node: 2, inputs: [ { node: 0 }, { node: 1} ] },
        { node: 3, inputs: [ { node: 2 } ] }
    ]
};

// 'test' graph definition
var testGraphDef = {
    id: 1,
    nodes: [
        // { type: 'identifier', data: { type: 'float', name: 'time' } },
        // { type: 'identifier', data: { type: 'float', name: 'glsl_uv0' } },
        //{ type: 'identifier', data: { type: 'vec3', name: 'mat_diffuseColor' } },
        { type: 'value', data: { type: 'float', name: 'platform' } },
        //{ type: 'value', data: { type: 'vec2', data: [0, 1] } },
        { type: 'value', data: { type: 'vec3', data: [1, 2, 3] } },
        { type: 'add' },
        { type: 'graph', data: { graphId: 0 } },
        { type: 'value', data: { type: 'vec4', data: [4, 5, 6, 7] } },
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

// material definition
var material0Def = {
    graphId: 1,
    params: {
        mat_diffuseColor: [0, 1, 2]
    }
};

var material1Def = {
    graphId: 1,
    params: {
        mat_diffuseColor: [3, 4, 5]
    }
};

// list of platform constants which are referenced in the graph by 'value' nodes and
// get baked into the graph at load time
var platformConstants = {
    platform: [1]
};

// create the graph system and register the two definition
var graphSystem = new GraphSystem(platformConstants);
graphSystem.add(doublerGraphDef);
graphSystem.add(testGraphDef);

var g = graphSystem.instantiateGraph(1, null);

// evaluate glsl
var c = new GlslContext();
g.visit(new GlslEvalPass(g, c));
console.log(c.glsl.join("\n"));

// memory eval
g.visit(new MemEvalPass([]));