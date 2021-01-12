
// data value contains a value type and associated data
var Value = function (typeString, data) {
    this.type = Types[typeString];
    this.data = data;
};
