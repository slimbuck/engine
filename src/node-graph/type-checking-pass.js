
// Walk the graph checking that automatic conversions (i.e. check
// that automatic conversions between upstream types and input types
// are valid).
// At this point it is assumed types have been propagated throughout
// the graph.
class TypeCheckingPass extends Visitor {
    visit(node) {
        // run through node connections checking upstream vs input type
        if (node.connections) {
            for (var i=0; i<node.connections.length; ++i) {
                var c = node.connections[i];

                var srcType = c.node.outputTypes[c.output];
                if (!srcType) {
                    console.log('node is missing output type' +
                                ' graph=' + this.id +
                                ' node=' + this.nodes.indexOf(c.node) +
                                ' output=' + c.output);
                } else {
                    var dstType = c.type;
                    if (!dstType) {
                        console.log('node is missing input type' +
                                    ' graph=' + this.id +
                                    ' node=' + this.nodes.indexOf(node) +
                                    ' input=' + i);
                    } else {
                        if (!TypeSystem.isValidTypeConversion(dstType, srcType)) {
                            console.log('invalid type conversion' +
                                        ' graph=' + this.id +
                                        ' node=' + this.nodes.indexOf(node) +
                                        ' dst=' + dstType.name +
                                        ' src=' + srcType.name);
                        }
                    }
                }
            }
        }
    }
}
