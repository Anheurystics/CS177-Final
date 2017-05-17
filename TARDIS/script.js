
var gl, ctx,
    defaultProgram, gouraudProgram,
    camera, transform = mat4(),
    usePerspective = false,
    matrixStack = [],
    modelOutlines = false,
    cx = 0, cy = 0, cz = -8,
    cameraLookAt = lookAt([cx, cy, -cz], [0, 0, 0], [0, 1, 0]);

var tardisExterior, tardisExteriorStencil, tardisInterior, tardisInteriorV2;

var pitch = 0;
var yaw = 180;
var lastUpdate = 0;
var cachedFPS = 0;
var fpsCount = 0;
var smooth = false;
var gouraud = false;
var blinn = true;
var lightEnabled = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
var tardisExteriorMaterial, tardisInteriorMaterial, defaultMaterial;
var tardisInteriorV2Material;

var preloader = new Preloader(init);
preloader.addText("tardis_exterior.obj");
preloader.addText("tardis_exterior.mtl");
preloader.addText("tardis_exterior_stencil.obj");
preloader.addText("tardis_interior.obj");
preloader.addText("tardis_interior.mtl");
preloader.addText("tardis-interior-v2.obj");
preloader.addText("tardis-interior-v2.mtl");
preloader.preload();

function loadMTL(mtlSource) {
    var materials = [];
    var current = null;
    var lines = mtlSource.split("\n");
    for (var i = 0; i < lines.length; i++) {
        var tokens = lines[i].split(" ");
        if (tokens[0] == "newmtl") {
            current = materials[tokens[1]] = new Material();
        } else if (tokens[0] == "Ns") {
            current.Ns = parseFloat(tokens[1]);
        } else if (tokens[0] == "Ka") {
            current.Ka = [
                parseFloat(tokens[1]),
                parseFloat(tokens[2]),
                parseFloat(tokens[3])
            ];
        } else if (tokens[0] == "Kd") {
            current.Kd = [
                parseFloat(tokens[1]),
                parseFloat(tokens[2]),
                parseFloat(tokens[3])
            ]
        } else if (tokens[0] == "Ks") {
            current.Ks = [
                parseFloat(tokens[1]),
                parseFloat(tokens[2]),
                parseFloat(tokens[3])
            ]
        } else if (tokens[0] == "map_Kd") {
            current.map_Kd = tokens[1];
            current.loadTexture();
        }
    }

    return materials;
}

class Material {
    constructor(Ka, Kd, Ks, Ns, map_Kd) {
        this.Ka = Ka;
        this.Kd = Kd;
        this.Ks = Ks;
        this.Ns = Ns;
        this.map_Kd = map_Kd;
    }

    loadTexture() {
        if (this.map_Kd != undefined) {
            this.texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, preloader.getImage(this.map_Kd));
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.bindTexture(gl.TEXTURE_2D, null);
        }
    }

    bind(program) {
        gl.uniform3fv(gl.getUniformLocation(program, "Ka"), this.Ka);
        gl.uniform3fv(gl.getUniformLocation(program, "Kd"), this.Kd);
        gl.uniform3fv(gl.getUniformLocation(program, "Ks"), this.Ks);
        gl.uniform1f(gl.getUniformLocation(program, "Ns"), this.Ns);
        gl.uniform1f(gl.getUniformLocation(program, "useTexture"), this.texture != undefined);
        if (this.texture != undefined) {
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
        }
    }
}

class Model {
    constructor(shape) {
        this.shape = shape;
        this.buffer = gl.createBuffer();
        this.normalBuffer = gl.createBuffer();
        this.smoothNormalBuffer = gl.createBuffer();

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, flatten(this.shape.vertices), gl.STATIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, flatten(this.shape.normals), gl.STATIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.smoothNormalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, flatten(this.shape.smoothNormals), gl.STATIC_DRAW);

        if (this.shape.uvs.length > 0) {
            this.uvBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, flatten(this.shape.uvs), gl.STATIC_DRAW);
        }
    }

    bind(program, smooth) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
        var vPosition = gl.getAttribLocation(program, "vPosition");
        gl.vertexAttribPointer(vPosition, 3, gl.FLOAT, false, 12, 0);
        gl.enableVertexAttribArray(vPosition);

        gl.bindBuffer(gl.ARRAY_BUFFER, smooth ? this.smoothNormalBuffer : this.normalBuffer);
        var vNormal = gl.getAttribLocation(program, "vNormal");
        gl.vertexAttribPointer(vNormal, 3, gl.FLOAT, false, 12, 0);
        gl.enableVertexAttribArray(vNormal);

        if (this.uvBuffer != undefined) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuffer);
            var vUV = gl.getAttribLocation(program, "vUV");
            gl.vertexAttribPointer(vUV, 2, gl.FLOAT, false, 8, 0);
            gl.enableVertexAttribArray(vUV);
        } else {
            gl.disableVertexAttribArray(gl.getAttribLocation(program, "vUV"));
        }
    }

    render(program, transform, color = [.8, .8, .8]) {
        gl.uniform3fv(gl.getUniformLocation(program, "color"), color);
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "model"), false, flatten(transform));

        var normalMatrix = transpose(inverse4(transform));
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "normalMatrix"), false, flatten(normalMatrix));

        this.shape.render(program);
    }
}

function init() {
    var canvas = document.getElementById("gl-canvas");
    ctx = document.getElementById("overlay").getContext("2d");
    window.onkeydown = function (e) {
        var degsPerSecond = 60 / 60;
        var moveSpeed = 0.5;
        if (e.code == "KeyW") {
            cz += moveSpeed;
        }
        if (e.code == "KeyS") {
            cz -= moveSpeed;
        }
        if (e.code == "KeyA") {
            cx -= moveSpeed;
        }
        if (e.code == "KeyD") {
            cx += moveSpeed;
        }
        cameraLookAt = lookAt([cx, cy, -cz], [0, 0, 0], [0, 1, 0]);

        if (e.code == "ArrowDown") {
            pitch += degsPerSecond;
        }
        if (e.code == "ArrowUp") {
            pitch -= degsPerSecond;
        }
        if (e.code == "ArrowLeft") {
            yaw -= degsPerSecond
        }
        if (e.code == "ArrowRight") {
            yaw += degsPerSecond;
        }

        if (e.code == "KeyO") {
            modelOutlines = !modelOutlines;
        }
        if (e.code == "KeyP") {
            usePerspective = !usePerspective;
        }

        if (e.code == "KeyF") {
            smooth = !smooth;
        }
        if (e.code == "KeyB") {
            blinn = !blinn;
        }
        if (e.code == "KeyG") {
            gouraud = !gouraud;
        }

        if (parseInt(e.key) >= 1 && parseInt(e.key) <= 7) {
            var index = parseInt(e.key) - 1;
            lightEnabled[index] = !lightEnabled[index];
        }
    }

    gl = WebGLUtils.setupWebGL(canvas, { stencil: true });

    if (!gl) { alert("WebGL isn't available"); }

    tardisExteriorMaterial = loadMTL(preloader.getText("tardis_exterior.mtl"));
    tardisInteriorMaterial = loadMTL(preloader.getText("tardis_interior.mtl"));
    tardisInteriorV2Material = loadMTL(preloader.getText("tardis-interior-v2.mtl"));
    defaultMaterial = new Material([0.8, 0.8, 0.8], [0.8, 0.8, 0.8], [1.0, 1.0, 1.0], 50);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.3, 0.3, 0.3, 1.0);

    defaultProgram = initShaders(gl, "vertex-shader", "fragment-shader");
    gouraudProgram = initShaders(gl, "gouraud-vertex-shader", "gouraud-fragment-shader");

    tardisExterior = new Model(new OBJ(preloader.getText("tardis_exterior.obj"), tardisExteriorMaterial));
    tardisExteriorStencil = new Model(new OBJ(preloader.getText("tardis_exterior_stencil.obj"), tardisExteriorMaterial));
    tardisInterior = new Model(new OBJ(preloader.getText("tardis_interior.obj"), tardisInteriorMaterial));
    tardisInteriorV2 = new Model(new OBJ(preloader.getText("tardis-interior-v2.obj"), tardisInteriorV2Material));

    window.requestAnimFrame(render);
};

function push() {
    for (var i in arguments) {
        var mat = arguments[i];
        transform = mult(transform, mat);
        matrixStack.push(inverse(mat));
    }
}

function undo(n = 1) {
    for (var i = 0; i < n; i++) {
        var tail = matrixStack[matrixStack.length - 1];
        transform = mult(transform, inverse(tail));
    }
}

function pop(n = 1) {
    for (var i = 0; i < n; i++) {
        transform = mult(transform, matrixStack.pop());
    }
}

function identityMatrix() {
    transform = mat4();
    matrixStack.length = 0;
}

function rgbf(r, g, b) {
    return [r / 255.0, g / 255.0, b / 255.0];
}

function render() {
    window.requestAnimFrame(render);

    var delta = (Date.now() - lastUpdate) / 1000.0;
    lastUpdate = Date.now();

    if (fpsCount % 15 == 0) {
        cachedFPS = Math.floor(1 / delta);
    }

    var program = gouraud ? gouraudProgram : defaultProgram;

    fpsCount++;

    gl.useProgram(program);
    gl.uniform1f(gl.getUniformLocation(program, "useTexture"), false);

    gl.uniform1f(gl.getUniformLocation(program, "lights[0].enabled"), lightEnabled[0]);
    gl.uniform4f(gl.getUniformLocation(program, "lights[0].position"), 0, 5.5, -5.0, 1.0);
    gl.uniform3f(gl.getUniformLocation(program, "lights[0].color"), 1.0, 1.0, 0.7);
    gl.uniform3f(gl.getUniformLocation(program, "lights[0].attenuation"), 3.0, 0.1, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[0].intensity"), 0.4);
    gl.uniform3f(gl.getUniformLocation(program, "lights[0].direction"), 0.0, -1.0, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[0].angle"), 50.0);

    gl.uniform1f(gl.getUniformLocation(program, "lights[1].enabled"), lightEnabled[1]);
    gl.uniform4f(gl.getUniformLocation(program, "lights[1].position"), 2.5, 5.5, -5.0, 1.0);
    gl.uniform3f(gl.getUniformLocation(program, "lights[1].color"), 1.0, 1.0, 0.7);
    gl.uniform3f(gl.getUniformLocation(program, "lights[1].attenuation"), 3.0, 0.1, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[1].intensity"), 0.4);
    gl.uniform3f(gl.getUniformLocation(program, "lights[1].direction"), 0.0, -1.0, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[1].angle"), 50.0);

    gl.uniform1f(gl.getUniformLocation(program, "lights[2].enabled"), lightEnabled[2]);
    gl.uniform4f(gl.getUniformLocation(program, "lights[2].position"), -2.5, 5.5, -5.0, 1.0);
    gl.uniform3f(gl.getUniformLocation(program, "lights[2].color"), 1.0, 1.0, 0.7);
    gl.uniform3f(gl.getUniformLocation(program, "lights[2].attenuation"), 3.0, 0.1, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[2].intensity"), 0.4);
    gl.uniform3f(gl.getUniformLocation(program, "lights[2].direction"), 0.0, -1.0, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[2].angle"), 50.0);

    gl.uniform1f(gl.getUniformLocation(program, "lights[3].enabled"), lightEnabled[3]);
    gl.uniform4f(gl.getUniformLocation(program, "lights[3].position"), 0, 5.5, 5.0, 1.0);
    gl.uniform3f(gl.getUniformLocation(program, "lights[3].color"), 1.0, 1.0, 0.7);
    gl.uniform3f(gl.getUniformLocation(program, "lights[3].attenuation"), 3.0, 0.1, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[3].intensity"), 0.4);
    gl.uniform3f(gl.getUniformLocation(program, "lights[3].direction"), 0.0, -1.0, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[3].angle"), 50.0);

    gl.uniform1f(gl.getUniformLocation(program, "lights[4].enabled"), lightEnabled[4]);
    gl.uniform4f(gl.getUniformLocation(program, "lights[4].position"), 2.5, 5.5, 5.0, 1.0);
    gl.uniform3f(gl.getUniformLocation(program, "lights[4].color"), 1.0, 1.0, 0.7);
    gl.uniform3f(gl.getUniformLocation(program, "lights[4].attenuation"), 3.0, 0.1, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[4].intensity"), 0.4);
    gl.uniform3f(gl.getUniformLocation(program, "lights[4].direction"), 0.0, -1.0, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[4].angle"), 50.0);

    gl.uniform1f(gl.getUniformLocation(program, "lights[5].enabled"), lightEnabled[5]);
    gl.uniform4f(gl.getUniformLocation(program, "lights[5].position"), -2.5, 5.5, 5.0, 1.0);
    gl.uniform3f(gl.getUniformLocation(program, "lights[5].color"), 1.0, 1.0, 0.7);
    gl.uniform3f(gl.getUniformLocation(program, "lights[5].attenuation"), 3.0, 0.1, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[5].intensity"), 0.4);
    gl.uniform3f(gl.getUniformLocation(program, "lights[5].direction"), 0.0, -1.0, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[5].angle"), 50.0);

    gl.uniform1f(gl.getUniformLocation(program, "lights[6].enabled"), lightEnabled[6]);
    gl.uniform4f(gl.getUniformLocation(program, "lights[6].position"), 5.0, 5.0, 0.0, 0.0);
    gl.uniform3f(gl.getUniformLocation(program, "lights[6].color"), 1.0, 1.0, 1.0);
    gl.uniform3f(gl.getUniformLocation(program, "lights[6].attenuation"), 3.0, 0.1, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[6].intensity"), 0.4);
    gl.uniform3f(gl.getUniformLocation(program, "lights[6].direction"), 0.0, -1.0, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[6].angle"), 50.0);

    gl.uniform1f(gl.getUniformLocation(program, "blinn"), blinn ? 0.0 : 1.0);

    var transformedView = mult(cameraLookAt, mult(rotateX(pitch), rotateY(yaw)));
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "view"), false, flatten(transformedView));
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "projection"), false, flatten(perspective(60, 1, 0.1, 100.0)));

    var cx = transformedView[2][0] * -transformedView[2][3];
    var cy = transformedView[2][1] * -transformedView[2][3];
    var cz = transformedView[2][2] * -transformedView[2][3];

    gl.uniform3f(gl.getUniformLocation(program, "cameraPosition"), cx, cy, cz);

    ctx.clearRect(0, 0, 800, 800);
    ctx.fillStyle = "#000000";
    ctx.font = "16pt monospace";
    ctx.fillText("fps: " + cachedFPS + " pitch: " + pitch + " yaw: " + yaw, 10, 24);
    ctx.fillText((smooth ? "smooth" : "flat") + " shading (F), " + (gouraud ? "gouraud (G)" : (blinn ? "blinn-phong (B)" : "phong (B)")), 10, 48);

    defaultMaterial.bind(program);

    var tardisExteriorModel = mult(translate(0, 0, 0), scalem(1, 1, 1));
    var tardisInteriorModel = mult(translate(0, -3, 7), mult(scalem(1.5, 1.5, 1.5), rotateY(180)));

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.STENCIL_TEST);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);

    // Draw the inner walls of the tardis walls, setting 1 on the stencil buffer for each fragment drawn
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);
    gl.stencilFunc(gl.ALWAYS, 1, 1);
    gl.stencilMask(1);
    tardisExteriorStencil.bind(program, false);
    tardisExteriorStencil.render(program, tardisExteriorModel);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.disable(gl.CULL_FACE);
    gl.stencilFunc(gl.NOTEQUAL, 3, 1);
    gl.stencilMask(2);
    tardisExteriorStencil.bind(program, false);
    tardisExteriorStencil.render(program, tardisExteriorModel);

    // Draw the interior only on the parts where the inner walls were drawn
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.stencilFunc(gl.EQUAL, 3, 2);
    tardisInteriorV2.bind(program, false);
    tardisInteriorV2.render(program, tardisInteriorModel);

    // Draw outer walls, cover unnecessary surfaces
    gl.stencilFunc(gl.NOTEQUAL, 2, 2);
    gl.stencilMask(0);
    tardisExterior.bind(program, false);
    tardisExterior.render(program, tardisExteriorModel);
}