
// create graph
var graph = new Graph();
graph.createNode(0, 'constant', { types: [ Vec2Type ], name: 'vec2Value' } );
graph.createNode(1, 'constant', { types: [ Vec4Type ], name: 'vec4Value' } );
graph.createNode(2, 'constant', { types: [ Vec3Type ], name: 'vec3Value' } );
graph.createNode(3, 'add', null);
graph.createNode(4, 'null', null);

// create connections
graph.createConnection(0, 3, 0, 0);
graph.createConnection(1, 3, 0, 1);
graph.createConnection(2, 3, 0, 2);
graph.createConnection(3, 4, 0, 0);

// create node parameters (map of nodeId -> params)
var graphParams = {
    0: [ 1, 2 ],
    1: [ 3, 4, 5, 6 ],
    2: [ 7, 8, 9 ]
};

var jsEvaluator = new JsEvaluator();
jsEvaluator.evaluate(4, graph, graphParams);

var glslEvaluator = new GlslEvaluator();
glslEvaluator.evaluate(4, graph, graphParams);

console.log(glslEvaluator.result.join("\n"));

/*
var graphFragment = {
    id: 0,
    dependentIds: [1, 2, 3 ],
    nodes: {
        0: {
            id: 0,
            type: 'constant',
            settings: { }
        }
    }
}
*/
