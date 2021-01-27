
class SymbolStack {
    constructor() {
        this.stack = [];
    }

    push(symbolTable) {
        this.stack.push(symbolTable);
    }

    pop() {
        this.stack.pop();
    }

    resolve(identifier) {
        var stack = this.stack;
        for (var i=stack.length-1; i>=0; --i) {
            var symbolTable = stack[i];
            var value = symbolTable[identifier];
            if (value) {
                return value;
            }
        }
        return null;
    }
}
