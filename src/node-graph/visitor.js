
// base class for visitors (empty interface type class)
class Visitor {
    constructor() {

    }

    visit(node) {
        // nothing to do
    }
}

// typed visitor base class
// this base class uses a table of functions keyed on node type which implement the
// visitor per node type
class TypedVisitor extends Visitor {
    constructor() {
        super();
        this.functionTable = this.constructor.functionTable || {};
    }

    visit(node) {
        // call the per-type visitor function
        var func = this.functionTable[node.type.name];
        return func ? func.call(this, node) : null;
    }
}
