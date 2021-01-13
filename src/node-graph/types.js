
// data types
var DataType = {
    vec: 'vec',
    mat: 'mat',
    texture: 'texture'
};

// a type consists of a data type and dimension
var Type = function (name, dataType, dimension) {
    this.name = name;
    this.dataType = dataType;
    this.dimension = (dataType == DataType.texture) ? 0 : dimension;
};

// enumerate supported types
var Types = {
    float: new Type('float', DataType.vec, 1),
    vec2: new Type('vec2', DataType.vec, 2),
    vec3: new Type('vec3', DataType.vec, 3),
    vec4: new Type('vec4', DataType.vec, 4),
    mat2: new Type('mat2', DataType.mat, 2),
    mat3: new Type('mat3', DataType.mat, 3),
    mat4: new Type('mat4', DataType.mat, 4),
    texture: new Type('texture', DataType.texture, 0)
};
