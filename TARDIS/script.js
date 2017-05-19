
var gl, ctx,
    defaultProgram, gouraudProgram,
    camera, transform = mat4(),
    usePerspective = false,
    matrixStack = [],
    modelOutlines = false,
    cx = 0, cy = 2, cz = -8,
    orthoCam = ortho(-1, 1, -1, 1, 0.1, 100);

var pitch = 0;
var yaw = 0;
function getCamera() {
    return lookAt([cx, cy, cz], [cx + Math.sin(Math.PI / 180 * yaw), cy + Math.sin(Math.PI / 180 * pitch), cz + Math.cos(Math.PI / 180 * yaw)], [0, 1, 0]);
}

var cameraLookAt = getCamera();

var tardisExterior, tardisExteriorStencil, tardisInterior, tardisPanel, tardisInterior, tardisDoorLeft, tardisDoorRight, tardisPanel;
var bg;

var bgMaterial;

var lastUpdate = 0;
var cachedFPS = 0;
var fpsCount = 0;
var smooth = false;
var gouraud = false;
var blinn = true;
var lightEnabled = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
var doorOpenAngle = 75;
var doorCloseAngle = 0;
var doorAngle = 0;
var doorDir = 0;

var insideTrigger = false;
var insideTardis = false;
var tardisFade = 0;
var tardisFadeDir = 1;
var tardisFadeMax = 1.821;
var tardisAngle = 0;
var tardisAngleSpin = 0;
var startX = 0, startY = 0;
var endX = 0, endY = 0;
var seqT = 0;
function tardisFadeFunc(t) {
    return Math.abs(Math.sin(t * 8)) * 0.15 + (t * 0.5);
}

var playingSequence = false;
var sequencePart = 0;
function playSequence() {
    playingSequence = true;
    sequencePart = 1;
    tardisFade = 0;
    tardisFadeDir = 1;
}

var preloader = new Preloader(init);
preloader.addImage("police.png");
preloader.addImage("stjohn.png");
preloader.addImage("space.jpg");
preloader.addImage("BaseTexture.png");
preloader.addText("tardis_exterior.obj");
preloader.addText("tardis_exterior.mtl");
preloader.addText("tardis_exterior_stencil.obj");
preloader.addText("tardis_exterior_stencil.mtl");
preloader.addText("tardis_door_left.obj");
preloader.addText("tardis_door_left.mtl");
preloader.addText("tardis_door_right.obj");
preloader.addText("tardis_door_right.mtl");
preloader.addText("tardis-interior-v3.obj");
preloader.addText("tardis-interior-v3.mtl");
preloader.addText("tardis_panel.obj");
preloader.addText("tardis_panel.mtl");
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

function loadModelWithMaterial(name) {
    var m = loadMTL(preloader.getText(name + ".mtl"));

    return {
        material: m,
        model: new Model(new OBJ(preloader.getText(name + ".obj"), m))
    }
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
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, preloader.getImage(this.map_Kd.trim()));
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
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
        } else {
            gl.bindTexture(gl.TEXTURE_2D, null);
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

        this.shape.buildSmoothNormals();

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
    window.onkeyup = function (e) {
        if (e.code == "KeyT") {
            if (doorAngle == doorCloseAngle) {
                doorDir = 1;
            }
            if (doorAngle == doorOpenAngle) {
                doorDir = -1;
            }
        }

        if (e.code == "KeyU") {
            if (!playingSequence) {
                playSequence();
            }
        }
    }
    window.onkeydown = function (e) {
        var degsPerSecond = 180 / 60;
        var moveSpeed = 0.5;

        if (e.code == "KeyY") {
            if (!insideTardis) {
                if (doorAngle != doorCloseAngle) {
                    doorDir = -1;
                } else {
                    tardisFade += 0.01 * tardisFadeDir;
                    tardisFade = Math.max(0.0, Math.min(tardisFade, tardisFadeMax));
                }
            }
        }

        if (e.code == "KeyW") {
            cz += moveSpeed * Math.cos(Math.PI / 180 * yaw);
            cx += moveSpeed * Math.sin(Math.PI / 180 * yaw);
        }
        if (e.code == "KeyS") {
            cz -= moveSpeed * Math.cos(Math.PI / 180 * yaw);
            cx -= moveSpeed * Math.sin(Math.PI / 180 * yaw);
        }
        if (e.code == "KeyA") {
            cz += moveSpeed * Math.cos(Math.PI / 180 * (yaw + 90));
            cx += moveSpeed * Math.sin(Math.PI / 180 * (yaw + 90));
        }
        if (e.code == "KeyD") {
            cz -= moveSpeed * Math.cos(Math.PI / 180 * (yaw + 90));
            cx -= moveSpeed * Math.sin(Math.PI / 180 * (yaw + 90));
        }

        if (insideTardis) {
            var centerX = 0;
            var centerZ = 7;

            var dz = cz - centerZ;
            var dx = cx - centerX;

            var dist = Math.sqrt(dx * dx + dz * dz);
            if (cz <= 1.0) {
                cx = Math.min(0.5, Math.max(-0.5, cx));
            }
            if (dist >= 7.5) {
                var angle = Math.atan2(dx, dz);

                if (cz >= 0.0 || Math.abs(cx) >= 0.5) {
                    cz = centerZ + Math.cos(angle) * 7.5;
                    cx = centerX + Math.sin(angle) * 7.5;
                }
            }
        } else {
            if ((Math.abs(cz) < 1.5 || Math.abs(cx) < 1.5) && Math.abs(cz) < Math.abs(cx)) {
                if (cx > 0 && cx < 1.5) {
                    cx = 1.5;
                }
                if (cx < 0 && cx > -1.5) {
                    cx = -1.5;
                }
            } else {
                if (cz > 0 && cz < 1.5) {
                    cz = 1.5;
                }
                if (doorAngle == 0 && cz < 0 && cz > -1.5) {
                    cz = -1.5;
                }
            }
        }

        if (e.code == "ArrowDown") {
            pitch -= degsPerSecond;
        }
        if (e.code == "ArrowUp") {
            pitch += degsPerSecond;
        }
        if (e.code == "ArrowLeft") {
            yaw += degsPerSecond
        }
        if (e.code == "ArrowRight") {
            yaw -= degsPerSecond;
        }

        cameraLookAt = getCamera();

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

    defaultMaterial = new Material([0.8, 0.8, 0.8], [0.8, 0.8, 0.8], [1.0, 1.0, 1.0], 50);
    bgMaterial = new Material([1.0, 1.0, 1.0], [0.0, 0.0, 0.0], [0.0, 0.0, 0.0], 0.0, "space.jpg");
    bgMaterial.loadTexture();

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.3, 0.3, 0.3, 1.0);

    defaultProgram = initShaders(gl, "vertex-shader", "fragment-shader");
    gouraudProgram = initShaders(gl, "gouraud-vertex-shader", "gouraud-fragment-shader");

    tardisExterior = loadModelWithMaterial("tardis_exterior").model;
    tardisExteriorStencil = loadModelWithMaterial("tardis_exterior_stencil").model;
    tardisInterior = loadModelWithMaterial("tardis-interior-v3").model;
    tardisDoorLeft = loadModelWithMaterial("tardis_door_left").model;
    tardisDoorRight = loadModelWithMaterial("tardis_door_right").model;
    tardisPanel = loadModelWithMaterial("tardis_panel").model;
    bg = new Model(new Rectangle(10, 1, 10));

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

    var tardisExteriorModel = mult(translate(0, 0, 0), mult(scalem(1, 1, 1), rotateY(tardisAngle)));
    var tardisInteriorModel = mat4();
    tardisInteriorModel = mult(tardisInteriorModel, rotateY(tardisAngle + 180));
    tardisInteriorModel = mult(tardisInteriorModel, translate(0, -3, -7));
    tardisInteriorModel = mult(tardisInteriorModel, scalem(1.5, 1.5, 1.5));

    var tardisPanelModel = mat4();
    tardisPanelModel = mult(tardisPanelModel, rotateY(tardisAngle));
    tardisPanelModel = mult(tardisPanelModel, translate(0, 0, 7));
    tardisPanelModel = mult(tardisPanelModel, scalem(0.5, 0.5, 0.5));

    var tardisDoorRightModel = mult(translate(0.75, 0, -1), rotateY(-doorAngle));
    var tardisDoorLeftModel = mult(translate(-0.75, 0, -1), rotateY(doorAngle));

    var tardisFadeSpeed = 0.02;
    if (!insideTardis && playingSequence) {
        if (sequencePart == 1) {
            if (doorAngle != doorCloseAngle) {
                doorDir = -1;
            } else {
                tardisFade += tardisFadeSpeed;
                tardisFade = Math.max(0.0, Math.min(tardisFade, tardisFadeMax));

                if (tardisFade == tardisFadeMax) {
                    sequencePart = 2;
                    seqT = 0.0;

                    startX = -5;
                    startY = Math.random() * -5 + 5;

                    endX = 5;
                    endY = Math.random() * -5 + 5;

                    tardisFade = 0;

                    tardisAngleSpin = 60;
                }
            }
        } else if (sequencePart == 2) {
            seqT += delta * 0.25;
            tardisExteriorModel = mult(translate(startX + ((endX - startX) * seqT), startY + ((endY - startY) * seqT), 0), mult(scalem(0.25, 0.25, 0.25), rotateY(tardisAngle)));
            if (seqT >= 1.0) {
                sequencePart = 3;
                tardisFadeDir = -1;
                tardisFade = tardisFadeMax;
                tardisAngleSpin = 0;
                tardisAngle = 0;
            }
        } else if (sequencePart == 3) {
            if (doorAngle != doorCloseAngle) {
                doorDir = -1;
            } else {
                tardisFade -= tardisFadeSpeed;
                tardisFade = Math.max(0.0, Math.min(tardisFade, tardisFadeMax));

                if (tardisFade == 0) {
                    sequencePart = 0;
                    tardisFadeDir = 0;
                    playingSequence = false;

                }
            }
        }
    }

    if (doorDir == 1) {
        doorAngle += delta * 180;
        if (doorAngle >= doorOpenAngle) {
            doorAngle = doorOpenAngle;
            doorDir = 0;
        }
    }

    if (doorDir == -1) {
        doorAngle -= delta * 180;
        if (doorAngle <= doorCloseAngle) {
            doorAngle = doorCloseAngle;
            doorDir = 0;
        }
    }

    tardisAngle += delta * tardisAngleSpin;

    var program = gouraud ? gouraudProgram : defaultProgram;

    fpsCount++;

    gl.useProgram(program);
    gl.uniform1f(gl.getUniformLocation(program, "useTexture"), false);

    gl.uniform4f(gl.getUniformLocation(program, "lights[0].position"), -2.0, 2.0, -2.0, 0.0);
    gl.uniform3f(gl.getUniformLocation(program, "lights[0].color"), 1.0, 1.0, 1.0);
    gl.uniform3f(gl.getUniformLocation(program, "lights[0].attenuation"), 3.0, 0.1, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[0].intensity"), 10.0);
    gl.uniform3f(gl.getUniformLocation(program, "lights[0].direction"), 0.0, 0.0, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[0].angle"), 0.0);

    gl.uniform4f(gl.getUniformLocation(program, "lights[1].position"), 2.0, 2.0, 2.0, 0.0);
    gl.uniform3f(gl.getUniformLocation(program, "lights[1].color"), 1.0, 1.0, 1.0);
    gl.uniform3f(gl.getUniformLocation(program, "lights[1].attenuation"), 3.0, 0.1, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[1].intensity"), 10.0);
    gl.uniform3f(gl.getUniformLocation(program, "lights[1].direction"), 0.0, 0.0, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[1].angle"), 0.0);

    gl.uniform4f(gl.getUniformLocation(program, "lights[2].position"), 0.0, 5.0, 7.0, 1.0);
    gl.uniform3f(gl.getUniformLocation(program, "lights[2].color"), 1.0, 1.0, 1.0);
    gl.uniform3f(gl.getUniformLocation(program, "lights[2].attenuation"), 1.0, 0.0, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[2].intensity"), 0.5);
    gl.uniform3f(gl.getUniformLocation(program, "lights[2].direction"), 0.0, 0.0, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[2].angle"), 0.0);

    gl.uniform4f(gl.getUniformLocation(program, "lights[3].position"), 0.0, 1.0, 7.0, 1.0);
    gl.uniform3f(gl.getUniformLocation(program, "lights[3].color"), 1.0, 1.0, 1.0);
    gl.uniform3f(gl.getUniformLocation(program, "lights[3].attenuation"), 1.0, 0.0, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[3].intensity"), 0.5);
    gl.uniform3f(gl.getUniformLocation(program, "lights[3].direction"), 0.0, 0.0, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[3].angle"), 0.0);

    gl.uniform4f(gl.getUniformLocation(program, "lights[4].position"), 0.0, 3.0, 9.0, 1.0);
    gl.uniform3f(gl.getUniformLocation(program, "lights[4].color"), 1.0, 1.0, 1.0);
    gl.uniform3f(gl.getUniformLocation(program, "lights[4].attenuation"), 1.0, 0.0, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[4].intensity"), 0.0);
    gl.uniform3f(gl.getUniformLocation(program, "lights[4].direction"), 0.0, 0.0, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[4].angle"), 0.0);

    gl.uniform4f(gl.getUniformLocation(program, "lights[5].position"), 0.0, 3.0, 5.0, 1.0);
    gl.uniform3f(gl.getUniformLocation(program, "lights[5].color"), 1.0, 1.0, 1.0);
    gl.uniform3f(gl.getUniformLocation(program, "lights[5].attenuation"), 1.0, 0.0, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[5].intensity"), 0.5);
    gl.uniform3f(gl.getUniformLocation(program, "lights[5].direction"), 0.0, 0.0, 0.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[5].angle"), 0.0);

    gl.uniform1f(gl.getUniformLocation(program, "blinn"), blinn ? 0.0 : 1.0);
    gl.uniform3f(gl.getUniformLocation(program, "cameraPosition"), cx, cy, cz);

    ctx.clearRect(0, 0, 800, 800);
    ctx.fillStyle = "#000000";
    ctx.font = "16pt monospace";
    ctx.fillText("fps: " + cachedFPS + " pitch: " + pitch + " yaw: " + yaw, 10, 24);
    ctx.fillText((smooth ? "smooth" : "flat") + " shading (F), " + (gouraud ? "gouraud (G)" : (blinn ? "blinn-phong (B)" : "phong (B)")), 10, 48);

    defaultMaterial.bind(program);

    if (Math.abs(cz + 1) < 0.05 && Math.abs(cx) <= 0.5) {
        insideTrigger = true;
    } else {
        if (insideTrigger) {
            insideTrigger = false;
            if (cz > -1.0) {
                insideTardis = true;
            } else {
                insideTardis = false;
            }
        }
    }

    ctx.fillText("Inside TARDIS? " + insideTardis, 10, 72);
    ctx.fillText("cx: " + cx + " cz: " + cz, 10, 96);

    gl.uniform1f(gl.getUniformLocation(program, "alpha"), 1.0);
    gl.uniform1f(gl.getUniformLocation(program, "lights[0].enabled"), false);
    gl.uniform1f(gl.getUniformLocation(program, "lights[1].enabled"), false);
    gl.uniform1f(gl.getUniformLocation(program, "lights[2].enabled"), false);
    gl.uniform1f(gl.getUniformLocation(program, "lights[3].enabled"), false);
    gl.uniform1f(gl.getUniformLocation(program, "lights[4].enabled"), false);
    gl.uniform1f(gl.getUniformLocation(program, "lights[5].enabled"), false);

    gl.uniformMatrix4fv(gl.getUniformLocation(program, "view"), false, flatten(lookAt([0, 2, -8], [0, 2, -7], [0, 1, 0])));
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "projection"), false, flatten(orthoCam));

    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.disable(gl.STENCIL_TEST);

    var bgMatrix = mult(mult(rotateY(180), translate(0, 2.0, 0)), scalem(0.5, 0.25, 0.25));
    bgMaterial.bind(program);
    bg.bind(program, false);
    bg.render(program, bgMatrix);

    gl.clear(gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.STENCIL_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);

    gl.uniformMatrix4fv(gl.getUniformLocation(program, "view"), false, flatten(cameraLookAt));
    gl.uniformMatrix4fv(gl.getUniformLocation(program, "projection"), false, flatten(usePerspective? perspective(60, 1, 0.1, 100.0) : ortho(-5, 5, -5, 5, 0.1, 100.0)));

    if (!insideTardis) {
        // Draw the inner walls of the tardis walls, setting 1 on the stencil buffer for each fragment drawn
        // Only draw the parts of the inner walls not occluded by the outer walls

        gl.colorMask(false, false, false, false);

        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.FRONT);
        gl.stencilFunc(gl.ALWAYS, 1, 1);
        gl.stencilMask(1);
        tardisExteriorStencil.bind(program, smooth);
        tardisExteriorStencil.render(program, tardisExteriorModel);

        // Draw inner walls where stencil bit #1 is not 1, set stencil bit #2 to 1
        gl.disable(gl.CULL_FACE);
        gl.stencilFunc(gl.NOTEQUAL, 3, 1);
        gl.stencilMask(2);
        tardisExteriorStencil.bind(program, smooth);
        tardisExteriorStencil.render(program, tardisExteriorModel);
    }

    gl.colorMask(true, true, true, true);

    gl.uniform1f(gl.getUniformLocation(program, "lights[0].enabled"), false);
    gl.uniform1f(gl.getUniformLocation(program, "lights[1].enabled"), false);
    gl.uniform1f(gl.getUniformLocation(program, "lights[2].enabled"), true);
    gl.uniform1f(gl.getUniformLocation(program, "lights[3].enabled"), true);
    gl.uniform1f(gl.getUniformLocation(program, "lights[4].enabled"), true);
    gl.uniform1f(gl.getUniformLocation(program, "lights[5].enabled"), true);

    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    !insideTardis && gl.stencilFunc(gl.EQUAL, 3, 2);
    // Draw the interior only on the parts where the inner walls were drawn
    if ((sequencePart != 2) && tardisFadeFunc(tardisFade) == 0.0) {
        tardisInterior.bind(program, smooth);
        tardisInterior.render(program, tardisInteriorModel);
        tardisPanel.bind(program, smooth);
        tardisPanel.render(program, tardisPanelModel);
    }

    gl.uniform1f(gl.getUniformLocation(program, "lights[0].enabled"), true);
    gl.uniform1f(gl.getUniformLocation(program, "lights[1].enabled"), true);
    gl.uniform1f(gl.getUniformLocation(program, "lights[3].enabled"), false);
    gl.uniform1f(gl.getUniformLocation(program, "lights[4].enabled"), false);
    gl.uniform1f(gl.getUniformLocation(program, "lights[5].enabled"), false);
    gl.uniform1f(gl.getUniformLocation(program, "alpha"), 1.0 - tardisFadeFunc(tardisFade));

    gl.stencilFunc(gl.NOTEQUAL, 2, 2);
    gl.stencilMask(0);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    if (!insideTardis) {
        // Draw outer walls, cover unnecessary surfaces
        tardisExterior.bind(program, smooth);
        tardisExterior.render(program, tardisExteriorModel);
    }

    gl.disable(gl.STENCIL_TEST);
    tardisDoorLeft.bind(program, smooth);
    tardisDoorLeft.render(program, mult(tardisExteriorModel, tardisDoorRightModel));
    tardisDoorRight.bind(program, smooth);
    tardisDoorRight.render(program, mult(tardisExteriorModel, tardisDoorLeftModel));
}