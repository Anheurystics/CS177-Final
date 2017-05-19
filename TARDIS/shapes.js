function getNormal(v0, v1, v2) {
    var t1 = subtract(v1, v0);
    var t2 = subtract(v2, v1);
    return vec3(cross(t1, t2));
}

class Shape {
    constructor() {
        this.vertices = [];
        this.normals = [];
        this.smoothNormals = [];
        this.uvs = [];

        this.vertexList = [];
        this.normalList = [];
        this.uvList = [];

        this.scratch = [];
        this.smoothNormalIndices = [];
    }

    addPosition(x, y, z) {
        this.vertexList.push(vec3(x, y, z));
        this.scratch.push([]);
    }

    addNormal(x, y, z) {
        this.normalList.push(vec3(x, y, z));
    }

    addUV(s, t) {
        this.uvList.push(vec2(s, t));
    }

    addTriangle(vIndices, nIndices, tIndices) {
        var v1 = this.vertexList[vIndices[0]];
        var v2 = this.vertexList[vIndices[1]];
        var v3 = this.vertexList[vIndices[2]];
        this.vertices.push(v1, v2, v3);

        var n1, n2, n3;
        if (nIndices == undefined) {
            n1 = n2 = n3 = getNormal(v1, v2, v3);
            this.normals.push(n1, n2, n3);
        } else {
            n1 = this.normalList[nIndices[0]];
            n2 = this.normalList[nIndices[1]];
            n3 = this.normalList[nIndices[2]];
            this.normals.push(n1, n2, n3);
        }

        if (tIndices != undefined) {
            var t1 = this.uvList[tIndices[0]];
            var t2 = this.uvList[tIndices[1]];
            var t3 = this.uvList[tIndices[2]];
            this.uvs.push(t1, t2, t3);
        }

        //TODO: Add proper smooth normals
        // this.smoothNormals.push(normalize(vec3(v1)), normalize(vec3(v2)), normalize(vec3(v3)));

        this.scratch[vIndices[0]].push(n1);
        this.scratch[vIndices[1]].push(n2);
        this.scratch[vIndices[2]].push(n3);
        this.smoothNormalIndices.push(vIndices[0], vIndices[1], vIndices[2]);
    }

    buildSmoothNormals() {
        var scratchNormals = [];
        for (var i in this.scratch) {
            var average = vec3();
            for (var j in this.scratch[i]) {
                average = add(average, this.scratch[i][j]);
            }

            average[0] /= this.scratch.length;
            average[1] /= this.scratch.length;
            average[2] /= this.scratch.length;

            scratchNormals[i] = normalize(average);
        }

        for (var j in this.smoothNormalIndices) {
            this.smoothNormals[j] = scratchNormals[this.smoothNormalIndices[j]];
        }
    }

    render(program, outlines = false) {
        gl.drawArrays(gl.TRIANGLES, 0, this.vertices.length);
        if (outlines) {
            gl.uniform3f(gl.getUniformLocation(program, "color"), 0, 0, 0);
            gl.drawArrays(gl.LINES, 0, this.vertices.length);
        }
    }
}

class Trapezoid extends Shape {
    constructor(tw, tl, bw, bl, h) {
        super();

        this.addUV(1, 0);
        this.addUV(1, 1);
        this.addUV(0, 0);
        this.addUV(0, 1);

        for (var y = -0.5; y <= 0.5; y += 1) {
            for (var x = -0.5; x <= 0.5; x += 1) {
                for (var z = -0.5; z <= 0.5; z += 1) {
                    var w = (y < 0) ? bw : tw;
                    var l = (y < 0) ? bl : tl;
                    this.addPosition(x * w, y * h, z * l);
                }
            }
        }

        var indices = [2, 1, 0, 3, 1, 2, 3, 5, 1, 7, 5, 3, 7, 4, 5, 6, 4, 7, 6, 0, 4, 2, 0, 6, 2, 7, 3, 6, 7, 2, 1, 4, 0, 5, 4, 1];
        for (var i = 0; i < indices.length - 2; i += 3) {
            this.addTriangle([indices[i], indices[i + 1], indices[i + 2]], undefined, i % 2 == 0 ? [2, 1, 0] : [3, 1, 2]);
        }
    }
}

class Cube extends Trapezoid {
    constructor(s) {
        super(s, s, s, s, s);
    }
}

class Rectangle extends Trapezoid {
    constructor(w, l, h) {
        super(w, l, w, l, h);
    }
}

class Pyramid extends Trapezoid {
    constructor(b, h) {
        super(0, 0, b, b, h);
    }
}

class Cylinder extends Shape {
    constructor(tr, br, h, detail) {
        super();
        this.detail = detail;

        var positions = [];
        this.addPosition(0, h / 2, 0);
        this.addUV(0.0, 0.0);
        for (var i = 0; i < 360; i += 360 / detail) {
            var rad = i * Math.PI / 180;
            this.addPosition(Math.cos(rad) * tr, h / 2, Math.sin(rad) * tr);
            this.addUV(i / 360.0, 0.0);
        }

        this.addPosition(0, -h / 2, 0);
        this.addUV(0.0, 0.0);
        for (var i = 0; i < 360; i += 360 / detail) {
            var rad = i * Math.PI / 180;
            this.addPosition(Math.cos(rad) * br, -h / 2, Math.sin(rad) * br);
            this.addUV(i / 360.0, 1.0);
        }

        for (var i = 1; i < detail; i++) {
            this.addTriangle([i, 0, i + 1], undefined, [i, 0, i + 1]);
        }
        this.addTriangle([detail, 0, 1], undefined, [detail, 0, 1]);

        for (var i = detail + 2; i < detail * 2 + 1; i++) {
            this.addTriangle([i + 1, detail + 1, i], undefined, [i + 1, detail + 1, i]);
        }
        this.addTriangle([detail + 2, detail + 1, detail * 2 + 1], undefined, [detail + 2, detail + 1, detail * 2 + 1]);

        var vertices = [];
        var c = 1;
        for (var i = 0; i < detail; i++) {
            vertices.push(c);
            c += detail + 1;

            vertices.push(c);
            c -= detail;
        }

        for (var i = 0; i < vertices.length - 2; i += 2) {
            this.addTriangle([vertices[i + 2], vertices[i + 1], vertices[i]], undefined, [vertices[i + 2], vertices[i + 1], vertices[i]]);
            this.addTriangle([vertices[i + 3], vertices[i + 1], vertices[i + 2]], undefined, [vertices[i + 3], vertices[i + 1], vertices[i + 2]]);
        }

        this.addTriangle([1, detail * 2 + 1, detail], undefined, [1, detail * 2 + 1, detail]);
        this.addTriangle([detail + 2, detail * 2 + 1, 1], undefined, [detail + 2, detail * 2 + 1, 1]);
    }
}

class Cone extends Cylinder {
    constructor(br, h, detail) {
        super(0, br, h, detail);
    }
}

class OBJ extends Shape {
    constructor(source, material) {
        super();

        this.material = material;

        this.materialGroups = [];

        var currentMaterial, currentRange;
        var lines = source.split("\n");
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var split = line.split(" ");
            if (split[0] == "usemtl") {
                if (currentMaterial != undefined) {
                    currentRange.end = this.vertices.length;
                }
                
                if (this.materialGroups[split[1]] == undefined) {
                    this.materialGroups[split[1]] = [];
                }

                currentRange = { start: 0, end: 0 };
                this.materialGroups[split[1]].push(currentRange);
                currentRange.start = this.vertices.length;
                currentMaterial = split[1];
            }
            if (split[0] == "v") {
                this.addPosition(parseFloat(split[1]), parseFloat(split[2]), parseFloat(split[3]));
            }
            if (split[0] == "vn") {
                this.addNormal(parseFloat(split[1]), parseFloat(split[2]), parseFloat(split[3]));
            }
            if (split[0] == "vt") {
                this.addUV(parseFloat(split[1]), parseFloat(split[2]));
            }
            if (split[0] == "f") {
                var v1 = split[1].split("/").map(function (v) { return parseInt(v) - 1; });
                var v2 = split[2].split("/").map(function (v) { return parseInt(v) - 1; });
                var v3 = split[3].split("/").map(function (v) { return parseInt(v) - 1; });

                var positionList = [v1[0], v2[0], v3[0]];
                var uvList;
                if (!isNaN(v1[1]))
                    uvList = [v1[1], v2[1], v3[1]];

                var normalList;
                if (!isNaN(v1[2]))
                    normalList = [v1[2], v2[2], v3[2]];

                this.addTriangle(positionList, normalList, uvList);
            }
        }
        if (currentMaterial) {
            this.materialGroups[currentMaterial][Object.keys(this.materialGroups[currentMaterial]).length - 1].end = this.vertices.length - 1;
        }
    }

    render(program, outlines = false) {
        if (Object.keys(this.materialGroups).length == 0) {
            gl.uniform3f(gl.getUniformLocation(program, "Ka"), 0.3, 0.3, 0.3);
            gl.uniform3f(gl.getUniformLocation(program, "Kd"), 0.3, 0.3, 0.3);
            gl.uniform3f(gl.getUniformLocation(program, "Ks"), 1.0, 1.0, 1.0);
            gl.uniform1f(gl.getUniformLocation(program, "Ns"), 50.0);
            super.render(program, outlines);
        } else {
            gl.uniform3f(gl.getUniformLocation(program, "color"), 0.4, 0.4, 0.4);
            for (var key in this.materialGroups) {
                var group = this.materialGroups[key];
                this.material[key].bind(program);

                for (var i in group) {
                    var range = group[i];
                    gl.drawArrays(gl.TRIANGLES, range.start, range.end - range.start + 1);
                }
            }
        }
    }
}