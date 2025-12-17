//variable declaration section
var physicsWorld, rigidBodies=[];
const STATE = { DISABLE_DEACTIVATION : 4 }
const FLAGS = { CF_KINEMATIC_OBJECT: 2 }
var moveDirection = { left: 0, right: 0, forward: 0, back: 0 }
var rotateDirection = { left: 0, right: 0, forward: 0, back: 0 }
var blockQuaternion = null;
var ammoTransform = null, ammoPosition = null, ammoQuaternion = null; 
let acc = 0;
const FIXED_DT = 1 / 240;      // physics tick
const MAX_STEPS = 8;           // cap per frame to avoid spiral-of-death

// reuse temp vectors (no Ammo heap spam)
let tmpLinVel = null;
let tmpAngVel = null;

// Texture System Globals
var finishLineObj = null; // Stores the decal object
var texturePipeline = null;
var textureBindGroup = null;
var textureUniformBuffer = null;

// Track the exact angle of the board (in radians)
// 0.35 radians is approx 20 degrees.
const MAX_TILT = 0.35; 
var currentTilt = { x: 0, z: 0 };

// Grid Coordinates
var START_GRID = { x: 5, y: 0 };
var END_GRID   = { x: 6, y: 0 };

// Game State
var gameWon = false;
var currentLevelIndex = 0;
var unlockedLevelIndex = 0;
var currentBallTexture = 'tennis'; // 'tennis' or 'jabulani'

// Level Definitions
const levels = [
    {
        // Level 1: Simple
        start: { x: 0, y: 0 },
        end: { x: 7, y: 7 },
        walls: [
            { type: 'vertical', x: 2, y: [0, 4] },
            { type: 'horizontal', x: [2, 3], y: 4 },
            { type: 'horizontal', x: [4, 6], y: 4 },
            { type: 'vertical', x: 5, y: [4, 8] },
            { type: 'vertical', x: 7, y: [0, 1] }
        ]
    },
    {
        // Level 2: Moderate
        start: { x: 0, y: 0 },
        end: { x: 7, y: 0 },
        walls: [
            { type: 'vertical', x: 2, y: [1, 6] },
            { type: 'vertical', x: 4, y: [2, 6] },
            { type: 'vertical', x: 4, y: [7, 8] },
            { type: 'vertical', x: 6, y: [0, 6] },
            { type: 'horizontal', x: [0, 2], y: 4 },
            { type: 'horizontal', x: [4, 6], y: 4 }
        ]
    },
    {
        // Level 3: Harder
        start: { x: 4, y: 4 },
        end: { x: 0, y: 0 },
        walls: [
            { type: 'vertical', x: 2, y: [2, 3] },
            { type: 'vertical', x: 2, y: [4, 6] },
            { type: 'vertical', x: 6, y: [2, 6] },
            { type: 'horizontal', x: [0, 6], y: 2 },
            { type: 'horizontal', x: [2, 6], y: 6 },
            { type: 'horizontal', x: [5, 8], y: 7 },
            { type: 'vertical', x: 4, y: [1, 3] },
            { type: 'vertical', x: 4, y: [4, 7] },

        ]
    },
    {
        // Level 4: Complex
        start: { x: 0, y: 7 },
        end: { x: 7, y: 0 },
        walls: [
            { type: 'vertical', x: 1, y: [1, 7] },
            { type: 'vertical', x: 3, y: [0, 6] },
            { type: 'vertical', x: 5, y: [2, 8] },
            { type: 'vertical', x: 7, y: [0, 6] },
            { type: 'horizontal', x: [1, 3], y: 1 },
            { type: 'horizontal', x: [3, 5], y: 7 },
            { type: 'horizontal', x: [5, 7], y: 1 }
        ]
    },
    {
        // Level 5: The Original Maze (Hardest)
        start: { x: 5, y: 0 },
        end: { x: 6, y: 0 },
        walls: [
            { type: 'vertical', x: 2, y: [2, 7] },
            { type: 'vertical', x: 3, y: [2, 5] },
            { type: 'vertical', x: 3, y: [6, 8] },
            { type: 'vertical', x: 5, y: [5, 7] },
            { type: 'vertical', x: 6, y: [0, 2] },
            { type: 'vertical', x: 6, y: [7, 8] },
            { type: 'vertical', x: 7, y: [0, 2] },
            { type: 'horizontal', x: [0, 1], y: 2 },
            { type: 'horizontal', x: [2, 6], y: 2 },
            { type: 'horizontal', x: [1, 2], y: 3 },
            { type: 'horizontal', x: [3, 4], y: 3 },
            { type: 'horizontal', x: [0, 1], y: 4 },
            { type: 'horizontal', x: [5, 8], y: 4 },
            { type: 'horizontal', x: [3, 7], y: 5 },
            { type: 'horizontal', x: [1, 2], y: 6 }
        ]
    }
];

// --- NEW: store border refs so we can update them with the floor ---
var borders = [];
var borderLocalOffsets = [];
var ballTexture = null;

//Ammojs Initialization
Ammo().then(start)

async function start()
{
    blockQuaternion = new Quaternion();
    ammoTransform = new Ammo.btTransform();
    ammoPosition = new Ammo.btVector3();
    ammoQuaternion = new Ammo.btQuaternion();
    tmpLinVel = new Ammo.btVector3(0,0,0);
    tmpAngVel = new Ammo.btVector3(0,0,0);


    setupPhysicsWorld();

    // Setup WebGPU
    const msaaCount = 4;

    const gpu = navigator.gpu;
    const adapter = await gpu.requestAdapter();
    const device = await adapter.requestDevice();
    const canvas = document.getElementById('webgpu-canvas');
    const context = canvas.getContext('gpupresent') || canvas.getContext('webgpu');
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat,
    });

    // --- Load Grass Texture ---
    const grassImg = await loadImageBitmap('grass.jpg');
    const grassTexture = device.createTexture({
        size: [grassImg.width, grassImg.height, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });
    device.queue.copyExternalImageToTexture(
        { source: grassImg },
        { texture: grassTexture },
        [grassImg.width, grassImg.height]
    );

    const grassSampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'repeat', // Repeat horizontally
        addressModeV: 'repeat', // Repeat vertically
    });

    // --- Load Wood Texture ---
    const woodImg = await loadImageBitmap('wood.jpg');
    const woodTexture = device.createTexture({
        size: [woodImg.width, woodImg.height, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });
    device.queue.copyExternalImageToTexture(
        { source: woodImg },
        { texture: woodTexture },
        [woodImg.width, woodImg.height]
    );

    const woodSampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'repeat',
        addressModeV: 'repeat',
    });

    // --- Load Ball Texture (Cubemap) ---
    const cubemapUrls = [
        'tennis/px.png', // +X
        'tennis/nx.png', // -X
        'tennis/py.png', // +Y
        'tennis/ny.png', // -Y
        'tennis/pz.png', // +Z
        'tennis/nz.png', // -Z
    ];
    ballTexture = await loadCubemap(device, cubemapUrls);

    const ballSampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        addressModeW: 'clamp-to-edge',
    });
    // ---------------------------

    // Temporary ball for layout
    var tempBall = new Object();
    createBall(device, tempBall);
    setupEventHandlers();

    const wgsl = device.createShaderModule({
        code: document.getElementById('wgsl').text
    });

    // --- Shadow Map Setup ---
    const shadowDepthTextureSize = 2048;
    const shadowDepthTexture = device.createTexture({
        size: [shadowDepthTextureSize, shadowDepthTextureSize, 1],
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        format: 'depth32float',
    });
    const shadowDepthView = shadowDepthTexture.createView();

    const shadowSampler = device.createSampler({
        compare: 'less',
        magFilter: 'linear',
        minFilter: 'linear',
    });

    const shadowPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: wgsl,
            entryPoint: 'shadow_vs',
            buffers: [tempBall.positionBufferLayout, tempBall.normalBufferLayout],
        },
        primitive: {
            topology: 'triangle-list',
            frontFace: "ccw",
            cullMode: "back",
        },
        depthStencil: {
            depthWriteEnabled: true,
            depthCompare: 'less',
            format: 'depth32float',
        },
    });
    // ------------------------

    // Goal/decal rendering needs access to the shadow map too
    await setupTextureSystem(device, canvasFormat, shadowDepthView, shadowSampler);

    var uniformBuffers = [];
    var bindGroups = [];
    var shadowBindGroups = [];
    var block = null;

    // Create a bind group layout that includes the grass texture
    const bindGroupLayout = device.createBindGroupLayout({
        entries: [
            { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
            { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
            { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: {} }, // Grass Texture
            { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: {} }, // Grass Sampler
            { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: {} }, // Wood Texture
            { binding: 6, visibility: GPUShaderStage.FRAGMENT, sampler: {} }, // Wood Sampler
            { binding: 7, visibility: GPUShaderStage.FRAGMENT, texture: { viewDimension: 'cube' } }, // Ball Texture
            { binding: 8, visibility: GPUShaderStage.FRAGMENT, sampler: {} }, // Ball Sampler
        ]
    });

    // Update pipeline to use this layout
    const pipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }), // Use explicit layout
        vertex: {
            module: wgsl,
            entryPoint: 'main_vs',
            buffers: [tempBall.positionBufferLayout, tempBall.normalBufferLayout],
        },
        fragment: {
            module: wgsl,
            entryPoint: 'main_fs',
            targets: [{ format: canvasFormat }],
        },
        primitive: {
            topology: 'triangle-list',
            frontFace: "ccw",
            cullMode: "back",
        },
        multisample: { count: msaaCount },
        depthStencil: {
            depthWriteEnabled: true,
            depthCompare: 'less',
            format: 'depth24plus'
        },
    });

    const msaaTexture = device.createTexture({
      size: { width: canvas.width, height: canvas.height },
      format: canvasFormat,
      sampleCount: msaaCount,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const depthTexture = device.createTexture({
        size: { width: canvas.width, height: canvas.height },
        format: 'depth24plus',
        sampleCount: msaaCount,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    // Initialize model, view, and projection matrices
    let M = mat4();
    let N = mat4();
    let eye = vec3(0.0, 100.0, 20.0); 
    let at = vec3(0.0, 0.0, 0.0);     // Look at the center of the board
    let up = vec3(0.0, 1.0, 0.0);     // Standard "Up" vector

    let V = lookAt(eye, at, up);
    let P = perspective(60.0, canvas.width/canvas.height, 0.2, 500.0);
    let M_st = mat4();
    M_st[2][2] = M_st[2][3] = 0.5;

    // Light Matrix Calculation
    let lightDir = normalize(vec3(-1.0, 1.75, 1.0));
    let lightEye = scale(100, lightDir);
    let lightView = lookAt(lightEye, vec3(0,0,0), vec3(0,1,0));
    let lightProj = ortho(-60, 60, -60, 60, 1, 200); 
    lightProj = mult(M_st, lightProj); // Apply WebGPU Z-correction
    let lightViewProj = mult(lightProj, lightView);

    // --- FUNCTIONS ---

    window.loadLevel = async function(index) {
        if (index < 0 || index >= levels.length) return;
        if (index > unlockedLevelIndex) return;

        currentLevelIndex = index;
        gameWon = false;
        document.getElementById('victory-message').style.display = 'none';
        
        // Update UI
        for(let i=0; i<5; i++) {
            let btn = document.getElementById('lvl-btn-' + i);
            if(btn) {
                btn.classList.remove('current');
                btn.classList.remove('locked');
                if (i === currentLevelIndex) btn.classList.add('current');
                if (i > unlockedLevelIndex) btn.classList.add('locked');
            }
        }

        // Cleanup
        for(let b of rigidBodies) {
            physicsWorld.removeRigidBody(b.physicsBody);
        }
        rigidBodies = [];
        borders = [];
        borderLocalOffsets = [];
        uniformBuffers = [];
        bindGroups = [];
        shadowBindGroups = [];

        // Recreate Floor
        block = new Object();
        createBlock(device, block);

        // Reset board transform/tilt on every level load
        currentTilt.x = 0;
        currentTilt.z = 0;
        block.position = vec3(0, 0, 0);
        block.quaternion = new Quaternion([0, 0, 0, 1]);
        syncKinematicToAmmo(block);

        // Recreate Borders
        const floorHalfX = 75 * 0.5;
        const floorHalfZ = 75 * 0.5;
        const floorHalfY = 2 * 0.5;
        const t = 2; const h = 8; const yBorder = floorHalfY + h * 0.5;

        for (let i = 0; i < 4; ++i) {
            let border = new Object();
            let local = vec3(0, yBorder, 0);
            let scale = { x: 79, y: h, z: t };
            if (i === 0) { local = vec3(0, yBorder, +(floorHalfZ + t * 0.5)); scale = { x: 79, y: h, z: t }; }
            else if (i === 1) { local = vec3(0, yBorder, -(floorHalfZ + t * 0.5)); scale = { x: 79, y: h, z: t }; }
            else if (i === 2) { local = vec3(+(floorHalfX + t * 0.5), yBorder, 0); scale = { x: t, y: h, z: 79 }; }
            else if (i === 3) { local = vec3(-(floorHalfX + t * 0.5), yBorder, 0); scale = { x: t, y: h, z: 79 }; }

            createKinematicBox(device, border, { pos: { x: 0, y: 0, z: 0 }, scale, quat: { x: 0, y: 0, z: 0, w: 1 } });
            borders.push(border);
            borderLocalOffsets.push(local);
        }

        // Create Maze
        let level = levels[currentLevelIndex];
        START_GRID = level.start;
        END_GRID = level.end;
        createMaze(device, level.walls);

        // Update Finish Line Decal
        createFinishDecal(device);

        // Create Ball
        var ball = new Object();
        createBall(device, ball);

        // Rebuild Buffers
        for(let i = 0; i < rigidBodies.length; ++i)
        {
            uniformBuffers.push(device.createBuffer({ size: 5*sizeof['mat4'] + 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
            
            bindGroups.push(device.createBindGroup({
                layout: bindGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: uniformBuffers[i] } },
                    { binding: 1, resource: shadowDepthView },
                    { binding: 2, resource: shadowSampler },
                    { binding: 3, resource: grassTexture.createView() },
                    { binding: 4, resource: grassSampler },
                    { binding: 5, resource: woodTexture.createView() },
                    { binding: 6, resource: woodSampler },
                    { binding: 7, resource: ballTexture.createView({ dimension: 'cube' }) },
                    { binding: 8, resource: ballSampler },
                ],
            }));

            shadowBindGroups.push(device.createBindGroup({
                layout: shadowPipeline.getBindGroupLayout(0),
                entries: [ { binding: 0, resource: { buffer: uniformBuffers[i] } } ],
            }));

            device.queue.writeBuffer(uniformBuffers[i], 0, flatten(mult(M_st, P)));
            device.queue.writeBuffer(uniformBuffers[i], sizeof['mat4'], flatten(V));
            device.queue.writeBuffer(uniformBuffers[i], 2*sizeof['mat4'], flatten(M));
            device.queue.writeBuffer(uniformBuffers[i], 3*sizeof['mat4'], flatten(N));
            device.queue.writeBuffer(uniformBuffers[i], 4*sizeof['mat4'], flatten(lightViewProj));
            
            let params = vec4(0, 0, 0, 0);
            if (i === 0) params = vec4(1, 0, 0, 0); // Floor
            else if (i === rigidBodies.length - 1) params = vec4(3, 0, 0, 0); // Ball
            else params = vec4(2, 0, 0, 0); // Walls
            device.queue.writeBuffer(uniformBuffers[i], 5*sizeof['mat4'], flatten(params));
        }
    };

    window.changeBallTexture = async function(name) {
        currentBallTexture = name;
        document.getElementById('skin-tennis').classList.remove('active');
        document.getElementById('skin-jabulani').classList.remove('active');
        document.getElementById('skin-telstar').classList.remove('active');
        document.getElementById('skin-basketball').classList.remove('active');
        document.getElementById('skin-' + name).classList.add('active');

        const cubemapUrls = [
            name + '/px.png', name + '/nx.png',
            name + '/py.png', name + '/ny.png',
            name + '/pz.png', name + '/nz.png',
        ];
        ballTexture = await loadCubemap(device, cubemapUrls);
        
        // Update Ball BindGroup (Last Object)
        let ballIndex = rigidBodies.length - 1;
        bindGroups[ballIndex] = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: uniformBuffers[ballIndex] } },
                { binding: 1, resource: shadowDepthView },
                { binding: 2, resource: shadowSampler },
                { binding: 3, resource: grassTexture.createView() },
                { binding: 4, resource: grassSampler },
                { binding: 5, resource: woodTexture.createView() },
                { binding: 6, resource: woodSampler },
                { binding: 7, resource: ballTexture.createView({ dimension: 'cube' }) },
                { binding: 8, resource: ballSampler },
            ],
        });
    };

    window.nextLevel = async function() {
        if (currentLevelIndex < levels.length - 1) {
            unlockedLevelIndex = Math.max(unlockedLevelIndex, currentLevelIndex + 1);
            await loadLevel(currentLevelIndex + 1);
        }
    };

    window.resetGame = function() {
        window.location.reload();
    };

    window.resetLevel = async function() {
        await loadLevel(currentLevelIndex);
    };

    setupEventHandlers();
    
    // Initial Load
    await loadLevel(0);

    // Use time-stamped animation
    var first = true;
    var time0;

    function animate(time)
    {
        if(!time)
        {
            requestAnimationFrame(animate);
            return;
        }
        if(first)
        {
            time0 = time;
            first = false;
        }
        var rawDelta = (time - time0)/1000;
        time0 = time;
        var deltaTime = Math.min(rawDelta, 0.03);

        // Get Ball (Last Object)
        if (rigidBodies.length === 0) {
            requestAnimationFrame(animate);
            return;
        }
        let ball = rigidBodies[rigidBodies.length - 1];

        moveBall(ball);
        moveKinematic(block, deltaTime);          // updates floor motion state
        syncKinematicToAmmo(block);     
        updateBordersFromFloor(block); 
        updatePhysics(deltaTime);

        if (!gameWon) {
            // 1. Get where the finish tile is in the world
            const winPos = getGridWorldPos(END_GRID.x, END_GRID.y);
            
            // 2. Calculate distance between Ball and Win Center
            // (We ignore Y because the ball might be bouncing slightly)
            const dx = ball.position[0] - winPos.x;
            const dz = ball.position[2] - winPos.z;
            
            // Distance formula: a^2 + b^2 = c^2
            const dist = Math.sqrt(dx*dx + dz*dz);
            
            // 3. Threshold check
            // Cell size is ~9.3. If we are within 4 units, we are basically in the center.
            if (dist < 4.0) {
                gameWon = true;
                document.getElementById('victory-message').style.display = 'block';
                
                // Show/Hide Next Level Button
                let nextBtn = document.getElementById('next-level-btn');
                if (currentLevelIndex >= levels.length - 1) {
                    nextBtn.style.display = 'none';
                } else {
                    nextBtn.style.display = 'block';
                }
            }
        }

        for (let i = 0; i < rigidBodies.length; ++i) {
          const obj = rigidBodies[i];

          let M = scalem(obj.scale[0], obj.scale[1], obj.scale[2]);
          M = mult(obj.quaternion.get_mat4(), M);
          M = mult(translate(obj.position[0], obj.position[1], obj.position[2]), M);
          let N = normalMatrix(M, false);

          device.queue.writeBuffer(uniformBuffers[i], 2*sizeof['mat4'], flatten(M));
          device.queue.writeBuffer(uniformBuffers[i], 3*sizeof['mat4'], flatten(N));
        }

        if (finishLineObj && block) {
            // 1. Create the Floor's Transform (Position + Rotation)
            let floorM = translate(block.position[0], block.position[1], block.position[2]);
            floorM = mult(floorM, block.quaternion.get_mat4());

            // 2. Create the Decal's Relative Offset (Local Position)
            // We move it to the specific grid square relative to the floor center
            let decalM = translate(finishLineObj.offset[0], finishLineObj.offset[1], finishLineObj.offset[2]);

            // 3. Combine them: Parent * Child
            // This makes the decal "stick" to the floor as it tilts
            finishLineObj.modelMatrix = mult(floorM, decalM);
        }

        render();
        requestAnimationFrame(animate);
    }

    function render()
    {
        const encoder = device.createCommandEncoder();

        // --- Shadow Pass ---
        const shadowPass = encoder.beginRenderPass({
            colorAttachments: [],
            depthStencilAttachment: {
                view: shadowDepthView,
                depthLoadOp: "clear",
                depthClearValue: 1.0,
                depthStoreOp: "store",
            }
        });
        shadowPass.setPipeline(shadowPipeline);
        for (let i = 0; i < rigidBodies.length; ++i) {
          const obj = rigidBodies[i];
          shadowPass.setVertexBuffer(0, obj.positionBuffer);
          shadowPass.setVertexBuffer(1, obj.normalBuffer);
          shadowPass.setIndexBuffer(obj.indexBuffer, 'uint32');
          shadowPass.setBindGroup(0, shadowBindGroups[i]);
          shadowPass.drawIndexed(obj.no_of_verts);
        }
        shadowPass.end();
        // -------------------

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: msaaTexture.createView(),
                resolveTarget: context.getCurrentTexture().createView(),
                loadOp: 'clear',
                storeOp: 'store',
                clearValue: { r: 191/255, g: 209/255, b: 229/255, a: 1.0 },
            }],
            depthStencilAttachment: {
                view: depthTexture.createView(),
                depthLoadOp: "clear",
                depthClearValue: 1.0,
                depthStoreOp: "store",
            }
        });

        pass.setPipeline(pipeline);

        for (let i = 0; i < rigidBodies.length; ++i) {
          const obj = rigidBodies[i];
          pass.setVertexBuffer(0, obj.positionBuffer);
          pass.setVertexBuffer(1, obj.normalBuffer);
          pass.setIndexBuffer(obj.indexBuffer, 'uint32');
          pass.setBindGroup(0, bindGroups[i]);
          pass.drawIndexed(obj.no_of_verts);
        }

        if (texturePipeline && finishLineObj) {
            pass.setPipeline(texturePipeline);
            pass.setBindGroup(0, textureBindGroup);
            
            pass.setVertexBuffer(0, finishLineObj.posBuffer);
            pass.setVertexBuffer(1, finishLineObj.uvBuffer);
            
            // Calculate MVP for the Decal.
            // IMPORTANT: the main scene uses the WebGPU depth correction matrix (M_st * P),
            // so the decal must use the same corrected projection or depth testing will be wrong.
            const correctedP = mult(M_st, P);
            let mvp = mult(correctedP, mult(V, finishLineObj.modelMatrix));

            // Shadow-space MVP for the decal
            let lightMvp = mult(lightViewProj, finishLineObj.modelMatrix);
            
            // Upload Matrices
            device.queue.writeBuffer(textureUniformBuffer, 0, flatten(mvp));
            device.queue.writeBuffer(textureUniformBuffer, 64, flatten(lightMvp));
            
            pass.draw(6);
        }

        pass.end();
        device.queue.submit([encoder.finish()]);
    }

    animate();
}

function getGridWorldPos(gridX, gridY) {
    const gridSize = 8;
    const floorSize = 75;
    const cellSize = floorSize / gridSize; // 9.375

    // Top-Left Origin Logic
    // X grows Left -> Right
    // Z grows Top -> Bottom
    const worldX = ((gridX + 0.5) * cellSize) - (floorSize / 2);
    const worldZ = ((gridY + 0.5) * cellSize) - (floorSize / 2);

    return { x: worldX, y: 10, z: worldZ };
}

function updatePhysics(deltaTime)
{
    physicsWorld.stepSimulation(deltaTime, 10, 1/240);

    for(let i = 0; i < rigidBodies.length; ++i)
    {
        let objThree = rigidBodies[i];
        if (!objThree.isDynamic) continue; 

        let objAmmo = objThree.physicsBody;
        let ms = objAmmo.getMotionState();
        if(ms)
        {
            ms.getWorldTransform(ammoTransform);
            let p = ammoTransform.getOrigin();
            let q = ammoTransform.getRotation();

            // --- NEW: MAX SPEED CLAMP ---
            let velocity = objAmmo.getLinearVelocity();
            let speed = velocity.length();
            const MAX_SPEED = 50.0; // Adjust this limit (30-50 is usually good)

            if(speed > MAX_SPEED) {
                // Scale the velocity vector down to the limit
                // Formula: (Velocity / CurrentSpeed) * MaxSpeed
                velocity.op_mul(MAX_SPEED / speed);
                objAmmo.setLinearVelocity(velocity);
            }
            // ----------------------------

            // --- KEEP: Vertical Jump Guard (Optional but recommended) ---
            // If you still have issues with vertical popping, keep this too
            if (velocity.y() > 5.0) { 
                velocity.setY(5.0);
                objAmmo.setLinearVelocity(velocity);
            }
            // -----------------------------------------------------------

            objThree.position = vec3(p.x(), p.y(), p.z());
            objThree.quaternion.set([q.x(), q.y(), q.z(), q.w()]);
        }
    }
}

function moveBall(obj) {
  const scalingFactor = 2;

  const moveX = (moveDirection.right - moveDirection.left) * scalingFactor;
  const moveZ = (moveDirection.back  - moveDirection.forward) * scalingFactor;

  if (moveX === 0 && moveZ === 0) return;

  tmpVel.setValue(moveX, 0, moveZ);
  obj.physicsBody.setLinearVelocity(tmpVel);
}


function syncKinematicToAmmo(obj) {
  const p = obj.position;
  const q = obj.quaternion.elements;

  ammoPosition.setValue(p[0], p[1], p[2]);
  ammoQuaternion.setValue(q[0], q[1], q[2], q[3]);

  ammoTransform.setIdentity();
  ammoTransform.setOrigin(ammoPosition);
  ammoTransform.setRotation(ammoQuaternion);

  const body = obj.physicsBody;
  const ms = body.getMotionState();
  if (ms) ms.setWorldTransform(ammoTransform);

  // IMPORTANT: also update the body itself (not just motion state)
  body.setWorldTransform(ammoTransform);
  body.activate();
}


function updateBordersFromFloor(floorObj) {
  for (let i = 0; i < borders.length; ++i) {
    const b = borders[i];
    const local = borderLocalOffsets[i];

    // rotate the local offset by the floor quaternion
    const rotatedOffset = floorObj.quaternion.apply(local);

    // world position = floor position + rotated offset
    b.position = add(floorObj.position, rotatedOffset);

    // world orientation = floor orientation (walls rotate with table)
    b.quaternion.set(floorObj.quaternion);

    // push to ammo
    syncKinematicToAmmo(b);
  }
}

function moveKinematic(obj, deltaTime) {
    // 1. Define Speed (Radians per second)
    // Lower this if the ball still jumps (e.g., try 0.5)
    const tiltSpeed = 1.0 * deltaTime; 

    // 2. Update the Tilt Value based on keys
    // We update the numbers directly, not the physics object yet.
    if (rotateDirection.back)    currentTilt.x += tiltSpeed;
    if (rotateDirection.forward) currentTilt.x -= tiltSpeed;
    if (rotateDirection.left)    currentTilt.z += tiltSpeed;
    if (rotateDirection.right)   currentTilt.z -= tiltSpeed;

    // 3. CLAMP (The "Anti-Drift" Fix)
    // This forces the angle to stay within -20 to +20 degrees.
    // It is impossible for the board to flip over or get stuck.
    currentTilt.x = Math.max(-MAX_TILT, Math.min(MAX_TILT, currentTilt.x));
    currentTilt.z = Math.max(-MAX_TILT, Math.min(MAX_TILT, currentTilt.z));

    // 4. Reconstruct Quaternion from Scratch
    // We create a fresh rotation based on the clamped values.
    // This eliminates "ghosting" or "accumulated math errors".
    
    let qx = new Quaternion();
    qx.make_rot_angle_axis(currentTilt.x, vec3(1, 0, 0)); // Tilt forward/back

    let qz = new Quaternion();
    qz.make_rot_angle_axis(currentTilt.z, vec3(0, 0, 1)); // Tilt left/right

    // Combine them (Multiply X rotation by Z rotation)
    qx.multiply(qz);

    // 5. Apply to Object
    obj.quaternion = qx;

    // 6. Sync to Physics Engine
    syncKinematicToAmmo(obj);
}

function setupPhysicsWorld()
{
  let collisionConfiguration = new Ammo.btDefaultCollisionConfiguration(),
      dispatcher = new Ammo.btCollisionDispatcher(collisionConfiguration),
      overlappingPairCache = new Ammo.btDbvtBroadphase(),
      solver = new Ammo.btSequentialImpulseConstraintSolver();

  physicsWorld = new Ammo.btDiscreteDynamicsWorld(dispatcher, overlappingPairCache, solver, collisionConfiguration);
  physicsWorld.setGravity(new Ammo.btVector3(0, -100, 0));

  // --- stability tweaks ---
  const info = physicsWorld.getSolverInfo();
  info.set_m_numIterations(20);      // try 10..40
  info.set_m_splitImpulse(true);     // IMPORTANT: reduces “pop” from penetration correction
}

function setupEventHandlers()
{
  window.addEventListener("keydown", function(event) {
    switch (event.key) {
    case "Down":
    case "ArrowDown":
      rotateDirection.back = 1;
      break;
    case "Up":
    case "ArrowUp":
      rotateDirection.forward = 1;
      break;
    case "Left":
    case "ArrowLeft":
      rotateDirection.left = 1;
      break;
    case "Right":
    case "ArrowRight":
      rotateDirection.right = 1;
      break;
    }
  });

  window.addEventListener("keyup", function (event) {
    switch (event.key) {
    case "Down":
    case "ArrowDown":
      rotateDirection.back = 0;
      break;
    case "Up":
    case "ArrowUp":
      rotateDirection.forward = 0;
      break;
    case "Left":
    case "ArrowLeft":
      rotateDirection.left = 0;
      break;
    case "Right":
    case "ArrowRight":
      rotateDirection.right = 0;
      break;
    }
  });
}

// --- CHANGED: createBlock now supports custom pos/scale/quat AND mass=0 (kinematic) ---
function createBlock(device, block, {
    pos = { x: 0, y: 0, z: 0 },
    scale = { x: 75, y: 2, z: 75 },
    quat = { x: 0, y: 0, z: 0, w: 1 },
    friction = 1.0,
    rollingFriction = 0.2
} = {})
{
    block.position = vec3(pos.x, pos.y, pos.z);
    block.quaternion = new Quaternion([quat.x, quat.y, quat.z, quat.w]);
    block.scale = vec3(scale.x, scale.y, scale.z);
    initBlock(device, block);

    //Ammojs Section
    let transform = new Ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z));
    transform.setRotation(new Ammo.btQuaternion(quat.x, quat.y, quat.z, quat.w));
    let motionState = new Ammo.btDefaultMotionState(transform);

    let colShape = new Ammo.btBoxShape(new Ammo.btVector3(scale.x*0.5, scale.y*0.5, scale.z*0.5));
    colShape.setMargin(0.05);

    let mass = 0;
    let localInertia = new Ammo.btVector3(0, 0, 0);

    let rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, colShape, localInertia);
    let body = new Ammo.btRigidBody(rbInfo);

    body.setFriction(friction);
    body.setRollingFriction(rollingFriction);

    body.setActivationState( STATE.DISABLE_DEACTIVATION );
    body.setCollisionFlags( body.getCollisionFlags() | FLAGS.CF_KINEMATIC_OBJECT );
    body.setRestitution(0.0);

    physicsWorld.addRigidBody(body);
    block.physicsBody = body;

    rigidBodies.push(block);
    block.isDynamic = false;

    return block;
}


function createBall(device, obj)
{

    const startPos = getGridWorldPos(START_GRID.x, START_GRID.y);
    let pos = { x: startPos.x, y: startPos.y, z: startPos.z };

    // --- GRID CALCULATION END ---

    let radius = 2.5;
    let quat = { x: 0, y: 0, z: 0, w: 1 };
    let mass = 1;
    let subdivs = 6;

    obj.position = vec3(pos.x, pos.y, pos.z);
    obj.quaternion = new Quaternion([quat.x, quat.y, quat.z, quat.w]);
    obj.scale = vec3(radius, radius, radius);
    initVertexBuffers(device, obj, subdivs);

    //Ammojs Section
    let transform=new Ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z));
    transform.setRotation(new Ammo.btQuaternion(quat.x, quat.y, quat.z, quat.w));
    let motionState=new Ammo.btDefaultMotionState(transform);

    let colShape=new Ammo.btSphereShape(radius);
    colShape.setMargin(0.05);

    let localInertia=new Ammo.btVector3(0, 0, 0);
    colShape.calculateLocalInertia(mass, localInertia);

    let rbInfo=new Ammo.btRigidBodyConstructionInfo(mass, motionState, colShape, localInertia);
    let body=new Ammo.btRigidBody(rbInfo);

    body.setFriction(1.0);
    body.setRollingFriction(0.2);
    body.setActivationState( STATE.DISABLE_DEACTIVATION );
    
    // CCD Setup (Anti-Tunneling)
    body.setCcdMotionThreshold(radius * 0.5); 
    body.setCcdSweptSphereRadius(radius * 0.4); 
    body.setRestitution(0.0); // No bounce

    physicsWorld.addRigidBody(body);

    obj.physicsBody = body;
    rigidBodies.push(obj);
    obj.isDynamic = true;
}

function initBlock(device, obj)
{
    obj.positions = [
        vec3(-0.5, -0.5, 0.5), vec3(-0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(0.5, -0.5, 0.5),     // front
        vec3(0.5, 0.5, 0.5), vec3(0.5, -0.5, 0.5), vec3(0.5, 0.5, -0.5), vec3(0.5, -0.5, -0.5),     // right
        vec3(-0.5, -0.5, 0.5), vec3(0.5, -0.5, 0.5), vec3(-0.5, -0.5, -0.5), vec3(0.5, -0.5, -0.5), // bottom
        vec3(-0.5, 0.5, 0.5), vec3(0.5, 0.5, 0.5), vec3(-0.5, 0.5, -0.5), vec3(0.5, 0.5, -0.5),     // top
        vec3(-0.5, -0.5, -0.5), vec3(-0.5, 0.5, -0.5), vec3(0.5, 0.5, -0.5), vec3(0.5, -0.5, -0.5), // back
        vec3(-0.5, -0.5, 0.5), vec3(-0.5, 0.5, 0.5), vec3(-0.5, -0.5, -0.5), vec3(-0.5, 0.5, -0.5)  // left
    ];
    obj.normals = [
        vec4(0, 0, 1, 0), vec4(0, 0, 1, 0), vec4(0, 0, 1, 0), vec4(0, 0, 1, 0),     // front
        vec4(1, 0, 0, 0), vec4(1, 0, 0, 0), vec4(1, 0, 0, 0), vec4(1, 0, 0, 0),     // right
        vec4(0, -1, 0, 0), vec4(0, -1, 0, 0), vec4(0, -1, 0, 0), vec4(0, -1, 0, 0), // bottom
        vec4(0, 1, 0, 0), vec4(0, 1, 0, 0), vec4(0, 1, 0, 0), vec4(0, 1, 0, 0),     // top
        vec4(0, 0, -1, 0), vec4(0, 0, -1, 0), vec4(0, 0, -1, 0), vec4(0, 0, -1, 0), // back
        vec4(-1, 0, 0, 0), vec4(-1, 0, 0, 0), vec4(-1, 0, 0, 0), vec4(-1, 0, 0, 0)  // left
    ];
    obj.indices = [
        1, 0, 3, 3, 2, 1,       // front
        4, 5, 7, 7, 6, 4,       // right
        9, 8, 10, 10, 11, 9,    // bottom
        15, 14, 12, 12, 13, 15, // top
        16, 17, 18, 18, 19, 16, // back
        23, 22, 20, 20, 21, 23  // left
    ];
  
    let positions = flatten(obj.positions);
    obj.positionBuffer = device.createBuffer({
        size: positions.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    obj.positionBufferLayout = {
        arrayStride: sizeof['vec3'],
        attributes: [{
            format: 'float32x3',
            offset: 0,
            shaderLocation: 0,
        }],
    };
    device.queue.writeBuffer(obj.positionBuffer, 0, positions);

    let normals = flatten(obj.normals);
    obj.normalBuffer = device.createBuffer({
        size: normals.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    obj.normalBufferLayout = {
        arrayStride: sizeof['vec4'],
        attributes: [{
            format: 'float32x4',
            offset: 0,
            shaderLocation: 1,
        }],
    };
    device.queue.writeBuffer(obj.normalBuffer, 0, normals);

    let indices = new Uint32Array(obj.indices);
    obj.indexBuffer = device.createBuffer({
        size: indices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(obj.indexBuffer, 0, indices);
    obj.no_of_verts = obj.indices.length;
}

function initVertexBuffers(device, obj, subdivs)
{
    const M_SQRT2 = Math.sqrt(2.0);
    const M_SQRT6 = Math.sqrt(6.0);
    obj.positions = [
        vec3(0.0, 0.0, 1.0),
        vec3(0.0, 2.0*M_SQRT2/3.0, -1.0/3.0),
        vec3(-M_SQRT6/3.0, -M_SQRT2/3.0, -1.0/3.0),
        vec3(M_SQRT6/3.0, -M_SQRT2/3.0, -1.0/3.0),
    ];
    obj.normals = [
        vec4(0.0, 0.0, 1.0, 0.0),
        vec4(0.0, 2.0*M_SQRT2/3.0, -1.0/3.0, 0.0),
        vec4(-M_SQRT6/3.0, -M_SQRT2/3.0, -1.0/3.0, 0.0),
        vec4(M_SQRT6/3.0, -M_SQRT2/3.0, -1.0/3.0, 0.0),
    ];
    obj.indices = [
        0, 1, 2,
        0, 3, 1,
        1, 3, 2,
        0, 2, 3
    ];

    for(let i = 0; i < subdivs; ++i)
        subdivide_sphere(obj);
    
    let positions = flatten(obj.positions);
    obj.positionBuffer = device.createBuffer({
        size: positions.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    obj.positionBufferLayout = {
        arrayStride: sizeof['vec3'],
        attributes: [{
            format: 'float32x3',
            offset: 0,
            shaderLocation: 0,
        }],
    };
    device.queue.writeBuffer(obj.positionBuffer, 0, positions);

    let normals = flatten(obj.normals);
    obj.normalBuffer = device.createBuffer({
        size: normals.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    obj.normalBufferLayout = {
        arrayStride: sizeof['vec4'],
        attributes: [{
            format: 'float32x4',
            offset: 0,
            shaderLocation: 1,
        }],
    };
    device.queue.writeBuffer(obj.normalBuffer, 0, normals);

    let indices = new Uint32Array(obj.indices);
    obj.indexBuffer = device.createBuffer({
        size: indices.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(obj.indexBuffer, 0, indices);
    obj.subdivs = subdivs;
    obj.no_of_verts = obj.indices.length;
    return obj;
}

function subdivide_sphere(obj)
{
    let no_of_triangles = obj.indices.length/3;
    let idx = no_of_triangles;
    let indices = [];
    for(let j = 0; j < no_of_triangles; ++j)
    {
        let i0 = obj.indices[3*j + 0];
        let i1 = obj.indices[3*j + 1];
        let i2 = obj.indices[3*j + 2];
        let v0 = obj.positions[i0];
        let v1 = obj.positions[i1];
        let v2 = obj.positions[i2];
        let c01 = idx;
        let c12 = idx + 1;
        let c20 = idx + 2;
        idx += 3;
        if(idx > obj.positions.length)
        {
            obj.positions.push(normalize(add(v0, v1)));
            obj.positions.push(normalize(add(v1, v2)));
            obj.positions.push(normalize(add(v2, v0)));
            obj.normals.push(vec4(...obj.positions[c01], 0.0));
            obj.normals.push(vec4(...obj.positions[c12], 0.0));
            obj.normals.push(vec4(...obj.positions[c20], 0.0));
        }
        indices.push(i0, c01, c20, c20, c01, c12, c12, c01, i1, c20, c12, i2);
    }
    obj.indices = indices;
}

function createKinematicBox(device, obj, { 
  pos = { x: 0, y: 0, z: 0 }, 
  scale = { x: 10, y: 1, z: 10 }, 
  quat = { x: 0, y: 0, z: 0, w: 1 }, 
  friction = 0.9, 
  rollingFriction = 0.0, 
  margin = 0.05, } = {}) 
{
  // --- Render-side data --- 
  obj.position = vec3(pos.x, pos.y, pos.z); 
  obj.quaternion = new Quaternion([quat.x, quat.y, quat.z, quat.w]); 
  obj.scale = vec3(scale.x, scale.y, scale.z); initBlock(device, obj); 
  // --- Ammo side ---
  const transform = new Ammo.btTransform(); 
  transform.setIdentity(); 
  transform.setOrigin(new Ammo.btVector3(pos.x, pos.y, pos.z)); 
  transform.setRotation(new Ammo.btQuaternion(quat.x, quat.y, quat.z, quat.w)); 
  const motionState = new Ammo.btDefaultMotionState(transform); 
  const colShape = new Ammo.btBoxShape(new Ammo.btVector3(scale.x * 0.5, scale.y * 0.5, scale.z * 0.5)); 
  colShape.setMargin(margin); 
  const mass = 0; 
  // kinematic bodies should be mass=0 
  const localInertia = new Ammo.btVector3(0, 0, 0); 
  const rbInfo = new Ammo.btRigidBodyConstructionInfo(mass, motionState, colShape, localInertia); 
  const body = new Ammo.btRigidBody(rbInfo); 
  body.setFriction(friction); 
  body.setRollingFriction(rollingFriction); 
  body.setActivationState(STATE.DISABLE_DEACTIVATION); 
  body.setCollisionFlags(body.getCollisionFlags() | FLAGS.CF_KINEMATIC_OBJECT); 
  body.setRestitution(0.0);

  physicsWorld.addRigidBody(body); 
  obj.physicsBody = body; 
  rigidBodies.push(obj); 
  obj.isDynamic = false; 
}


// --- NEW MAZE HELPER FUNCTION ---
function createMaze(device, wallDefinitions) {
    const gridSize = 8;
    const floorSize = 75;
    const cellSize = floorSize / gridSize; // 9.375
    const wallHeight = 8;
    const wallThickness = 2;
    
    // Calculate Y height relative to floor center (sitting on top)
    // Floor is 2 units thick (half=1). Wall is 8 units high (half=4). Total offset = 5.
    const yOffset = 1 + (wallHeight / 2); 

    wallDefinitions.forEach(def => {
        let length, centerX, centerZ, scaleX, scaleZ;

        // Note: In 3D, "y" on your grid is actually "z" in world space.
        
        if (def.type === 'vertical') {
            // Vertical: Fixed X, Z spans a range
            // range[1] - range[0] is the number of grid cells long
            const gridLen = def.y[1] - def.y[0]; 
            const midGridZ = def.y[0] + (gridLen / 2);

            length = gridLen * cellSize;
            
            // Map grid (0..8) to world (-37.5 .. 37.5)
            centerX = (def.x * cellSize) - (floorSize / 2);
            centerZ = (midGridZ * cellSize) - (floorSize / 2);

            // Add thickness so corners overlap nicely
            scaleX = wallThickness;
            scaleZ = length + wallThickness; 

        } else {
            // Horizontal: Fixed Z (your Y), X spans a range
            const gridLen = def.x[1] - def.x[0];
            const midGridX = def.x[0] + (gridLen / 2);

            length = gridLen * cellSize;

            centerX = (midGridX * cellSize) - (floorSize / 2);
            centerZ = (def.y * cellSize) - (floorSize / 2);

            scaleX = length + wallThickness;
            scaleZ = wallThickness;
        }

        // 1. Create the Object
        let wall = new Object();
        
        // 2. Define the local offset (Crucial for tilting!)
        let localPos = vec3(centerX, yOffset, centerZ);
        
        // 3. Create Physics Body
        // We initialize it at 0,0,0, but the 'updateBordersFromFloor' will 
        // immediately move it to the correct spot on the first frame.
        createKinematicBox(device, wall, {
            pos: { x: centerX, y: 20, z: centerZ }, // Temp pos
            scale: { x: scaleX, y: wallHeight, z: scaleZ },
            quat: { x: 0, y: 0, z: 0, w: 1 }
        });

        // 4. Register with your existing border system
        borders.push(wall);
        borderLocalOffsets.push(localPos);
    });
}

function createFinishDecal(device) {
    // 1. Calculate Position relative to center
    // We want it at Grid (7,0)
    // Since Floor is at (0,0), getGridWorldPos returns the relative offset directly.
    const pos = getGridWorldPos(END_GRID.x, END_GRID.y);
    
    // Adjust Height: Place it very slightly above the floor top (y=1.0) so it doesn't Z-fight.
    // Keeping this tiny prevents the goal from visually floating.
    const relativeOffset = vec3(pos.x, 1.01, pos.z);

    finishLineObj = {
        offset: relativeOffset, // Store offset to apply rotation later
        modelMatrix: mat4(),    // Will be updated every frame
        vertexCount: 6
    };

    // 2. Geometry (A flat square on the XZ plane)
    const s = 7.5 / 2; // Half size of a grid cell
    const positions = new Float32Array([
        -s, 0, -s,   s, 0, -s,   s, 0,  s, // Triangle 1
        -s, 0, -s,   s, 0,  s,  -s, 0,  s  // Triangle 2
    ]);

    const texCoords = new Float32Array([
        0, 0,   1, 0,   1, 1,
        0, 0,   1, 1,   0, 1
    ]);

    // 3. Buffers
    finishLineObj.posBuffer = device.createBuffer({ size: positions.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(finishLineObj.posBuffer, 0, positions);

    finishLineObj.uvBuffer = device.createBuffer({ size: texCoords.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(finishLineObj.uvBuffer, 0, texCoords);
}

async function loadImageBitmap(url) {
    const res = await fetch(url);
    const blob = await res.blob();
    return await createImageBitmap(blob, { colorSpaceConversion: 'none' });
}

async function loadCubemap(device, urls) {
    const promises = urls.map(url => loadImageBitmap(url));
    const images = await Promise.all(promises);
    
    const width = images[0].width;
    const height = images[0].height;

    const texture = device.createTexture({
        dimension: '2d',
        size: [width, height, 6],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });

    for (let i = 0; i < 6; ++i) {
        device.queue.copyExternalImageToTexture(
            { source: images[i] },
            { texture: texture, origin: [0, 0, i] },
            [width, height]
        );
    }

    return texture;
}

async function setupTextureSystem(device, canvasFormat, shadowDepthView, shadowSampler) {
    const url = 'goal.png'; 
    const img = await loadImageBitmap(url);

    // 2. Create Texture
    const texture = device.createTexture({
        size: [img.width, img.height, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        mipLevelCount: 1
    });

    device.queue.copyExternalImageToTexture(
        { source: img, flipY: false },
        { texture: texture },
        { width: img.width, height: img.height }
    );

    // 3. Create Sampler
    const sampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        mipmapFilter: 'linear', 
        addressModeU: 'repeat',
        addressModeV: 'repeat'
    });

    // --- 4. YOUR FETCH LOGIC HERE ---
    const wgslFile = document.getElementById("texture-wgsl").src;
    const wgslCode = await fetch(wgslFile, {cache:"reload"}).then(r => r.text());
    
    const shaderModule = device.createShaderModule({
        code: wgslCode
    });
    // --------------------------------

    // 5. Create Pipeline
    texturePipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: shaderModule,
            entryPoint: 'main_vs',
            buffers: [
                { arrayStride: 12, attributes: [{ format: 'float32x3', offset: 0, shaderLocation: 0 }] }, // Pos
                { arrayStride: 8,  attributes: [{ format: 'float32x2', offset: 0, shaderLocation: 1 }] }  // UV
            ]
        },
        fragment: {
            module: shaderModule,
            entryPoint: 'main_fs',
            targets: [{ 
                format: canvasFormat,
                blend: { // Transparency settings
                    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add'},
                    alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add'}
                }
            }]
        },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: {
            depthWriteEnabled: false,
            depthCompare: 'less',
            format: 'depth24plus'
        },
        multisample: { count: 4 }
    });

    // 6. Create Uniform Buffer & Bind Group
    const textureUniformBufferSize = 128; // 2 * mat4x4f (mvp + lightMvp)
    textureUniformBuffer = device.createBuffer({
        label: 'finish-decal-uniform-buffer',
        size: textureUniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    textureBindGroup = device.createBindGroup({
        layout: texturePipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: textureUniformBuffer, offset: 0, size: textureUniformBufferSize } },
            { binding: 1, resource: sampler },
            { binding: 2, resource: texture.createView() },
            { binding: 3, resource: shadowDepthView },
            { binding: 4, resource: shadowSampler }
        ]
    });
    
    // Auto-create the decal geometry now that the system is ready
    createFinishDecal(device);
}