
// data types
var DataType = {
    Vec: 'Vec',
    Mat: 'Mat',
    Texture: 'Texture'
};

// a type consists of a data type and dimension
var Type = function (name, dataType, dimension) {
    this.name = name;
    this.dataType = dataType;
    this.dimension = (dataType == DataType.Texture) ? 0 : dimension;
};

// supported types
var Types = {
    Float: new Type('Float', DataType.Vec, 1),
    Vec2: new Type('Vec2', DataType.Vec, 2),
    Vec3: new Type('Vec3', DataType.Vec, 3),
    Vec4: new Type('Vec4', DataType.Vec, 4),
    Mat2: new Type('Mat2', DataType.Mat, 2),
    Mat3: new Type('Mat3', DataType.Mat, 3),
    Mat4: new Type('Mat4', DataType.Mat, 4),
    Texture: new Type('Texture', DataType.Texture, 0)
};

var Value = function (typeString, data) {
    this.type = Types[typeString];
    this.data = data;
};
