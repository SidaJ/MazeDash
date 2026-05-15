  /*
         * TREASURE MAZE DASH
         * A top-down arcade maze game with 5 progressively difficult levels.
         * Collect dollar signs and treasure chests while racing against the clock.
         * Features procedurally generated mazes using depth-first search algorithm.
         */

        async function run(mode) {
            const gameWorld = document.getElementById('game-world');
            const canvas = document.getElementById('game-canvas');
            const ctx = canvas.getContext('2d');

            // DOM Elements
            const hud = document.getElementById('hud');
            const hudLevel = document.getElementById('hud-level');
            const hudTimer = document.getElementById('hud-timer');
            const hudScore = document.getElementById('hud-score');
            const startScreen = document.getElementById('start-screen');
            const startBtn = document.getElementById('start-btn');
            const instructionsEl = document.getElementById('instructions');
            const gameoverScreen = document.getElementById('gameover-screen');
            const gameoverLevel = document.getElementById('gameover-level');
            const gameoverScore = document.getElementById('gameover-score');
            const restartBtn = document.getElementById('restart-btn');
            const victoryScreen = document.getElementById('victory-screen');
            const victoryScore = document.getElementById('victory-score');
            const victoryRestartBtn = document.getElementById('victory-restart-btn');
            const bonusContainer = document.getElementById('bonus-container');
            const leaderboardContainer = document.getElementById('leaderboard-container');
            const leaderboardEntries = document.getElementById('leaderboard-entries');
            const yourRank = document.getElementById('your-rank');
            const levelTransition = document.getElementById('level-transition');
            const levelTransitionText = document.getElementById('level-transition-text');
            const joystickArea = document.getElementById('joystick-area');
            const joystickBase = document.getElementById('joystick-base');
            const joystickStick = document.getElementById('joystick-stick');
            const editInfo = document.getElementById('edit-info');

            // Canvas setup
            function resizeCanvas() {
                canvas.width = gameWorld.clientWidth;
                canvas.height = gameWorld.clientHeight;
            }
            resizeCanvas();
            window.addEventListener('resize', resizeCanvas);

            // Asset cache
            const imageCache = {};
            const audioCache = {};
            let audioContext = null;

            // Detect touch device
            const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

            // Asset preloading
            async function preloadAssets() {
                const imageAssets = ['player_character', 'dollar_sign', 'treasure_chest', 'exit_portal'];
                const audioAssets = ['coin_collect_sound', 'treasure_collect_sound', 'level_complete_sound', 'game_over_sound', 'background_music'];

                // Preload images
                const imagePromises = imageAssets.map(id => {
                    return new Promise((resolve) => {
                        const assetInfo = lib.getAsset(id);
                        if (assetInfo && assetInfo.url) {
                            const img = new Image();
                            img.onload = () => {
                                imageCache[id] = img;
                                resolve();
                            };
                            img.onerror = () => {
                                lib.log(`Failed to load image: ${id}`);
                                resolve();
                            };
                            img.src = assetInfo.url;
                        } else {
                            resolve();
                        }
                    });
                });

                // Initialize audio context
                try {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                } catch (e) {
                    lib.log('Web Audio API not supported');
                }

                // Preload audio
                const audioPromises = audioAssets.map(id => {
                    return new Promise((resolve) => {
                        const assetInfo = lib.getAsset(id);
                        if (assetInfo && assetInfo.url && audioContext) {
                            fetch(assetInfo.url)
                                .then(response => response.arrayBuffer())
                                .then(buffer => audioContext.decodeAudioData(buffer))
                                .then(audioBuffer => {
                                    audioCache[id] = {
                                        buffer: audioBuffer,
                                        loop: assetInfo.loop === 'true' || assetInfo.loop === true
                                    };
                                    resolve();
                                })
                                .catch(() => {
                                    lib.log(`Failed to load audio: ${id}`);
                                    resolve();
                                });
                        } else {
                            resolve();
                        }
                    });
                });

                await Promise.all([...imagePromises, ...audioPromises]);
            }

            // Audio playback
            let bgMusicSource = null;
            let bgMusicGain = null;

            function playSound(id, volume = 1.0) {
                if (!audioContext || !audioCache[id]) return null;
                
                if (audioContext.state === 'suspended') {
                    audioContext.resume();
                }

                const source = audioContext.createBufferSource();
                const gainNode = audioContext.createGain();
                
                source.buffer = audioCache[id].buffer;
                source.loop = audioCache[id].loop;
                gainNode.gain.value = volume;
                
                source.connect(gainNode);
                gainNode.connect(audioContext.destination);
                source.start(0);

                return { source, gainNode };
            }

            function playBackgroundMusic() {
                if (bgMusicSource) {
                    bgMusicSource.stop();
                }
                const result = playSound('background_music', 0.3);
                if (result) {
                    bgMusicSource = result.source;
                    bgMusicGain = result.gainNode;
                }
            }

            function stopBackgroundMusic() {
                if (bgMusicSource) {
                    try {
                        bgMusicSource.stop();
                    } catch (e) {}
                    bgMusicSource = null;
                }
            }

            // Game configuration from gameConfig
            const config = window.gameConfig;
            config.visuals = config.visuals || {};

            // Runtime state
            let gameState = 'start'; // start, playing, paused, gameover, victory, transition
            let currentLevel = 1;
            let score = 0;
            let timeRemaining = 0;
            let lastTimestamp = 0;
            
            // Time tracking for bonuses
            let totalGameTime = 0; // Total time elapsed across all levels
            let currentLevelStartTime = 0; // Time when current level started
            let levelCompletionTimes = []; // Array of completion times for each level
            let bonusesEarned = []; // Array of bonus notifications to display

            // Maze state
            let maze = [];
            let mazeWidth = 0;
            let mazeHeight = 0;
            let tileSize = 48;

            // Player state
            let player = {
                x: 0,
                y: 0,
                targetX: 0,
                targetY: 0,
                moving: false,
                moveProgress: 0,
                direction: 'down'
            };

            // Collectibles
            let dollars = [];
            let treasures = [];
            let holes = [];
            let levelStartPos = { x: 0, y: 0 };
            let routePath = [];
            let routeTiles = new Set();
            let exitPos = { x: 0, y: 0 };

            // Camera
            let camera = { x: 0, y: 0 };

            // Input state
            let keys = {};
            let joystickInput = { x: 0, y: 0, active: false };
            let joystickTouchId = null;

            // Animation state
            let portalRotation = 0;
            let collectAnimations = [];

            // ==================== MAZE GENERATION ====================

            function generateMaze(width, height) {
                // Initialize maze with all walls
                const maze = [];
                for (let y = 0; y < height; y++) {
                    maze[y] = [];
                    for (let x = 0; x < width; x++) {
                        maze[y][x] = 1; // 1 = wall
                    }
                }

                // Depth-first search maze generation
                function carve(x, y) {
                    maze[y][x] = 0; // 0 = floor

                    const directions = [
                        { dx: 0, dy: -2 },
                        { dx: 0, dy: 2 },
                        { dx: -2, dy: 0 },
                        { dx: 2, dy: 0 }
                    ];

                    // Shuffle directions
                    for (let i = directions.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [directions[i], directions[j]] = [directions[j], directions[i]];
                    }

                    for (const dir of directions) {
                        const nx = x + dir.dx;
                        const ny = y + dir.dy;

                        if (nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1 && maze[ny][nx] === 1) {
                            maze[y + dir.dy / 2][x + dir.dx / 2] = 0;
                            carve(nx, ny);
                        }
                    }
                }

                // Start from position (1, 1)
                carve(1, 1);

                return maze;
            }

            function findFloorTiles(maze) {
                const floors = [];
                for (let y = 0; y < maze.length; y++) {
                    for (let x = 0; x < maze[y].length; x++) {
                        if (maze[y][x] === 0) {
                            floors.push({ x, y });
                        }
                    }
                }
                return floors;
            }

            function findDeadEnds(maze) {
                const deadEnds = [];
                for (let y = 1; y < maze.length - 1; y++) {
                    for (let x = 1; x < maze[y].length - 1; x++) {
                        if (maze[y][x] === 0) {
                            let wallCount = 0;
                            if (maze[y - 1][x] === 1) wallCount++;
                            if (maze[y + 1][x] === 1) wallCount++;
                            if (maze[y][x - 1] === 1) wallCount++;
                            if (maze[y][x + 1] === 1) wallCount++;
                            if (wallCount >= 3) {
                                deadEnds.push({ x, y });
                            }
                        }
                    }
                }
                return deadEnds;
            }

            function findReachableTiles(maze, start) {
                if (!start || maze[start.y]?.[start.x] !== 0) return [];

                const reachable = [];
                const visited = new Set([`${start.x},${start.y}`]);
                const queue = [start];
                const directions = [
                    { dx: 0, dy: -1 },
                    { dx: 0, dy: 1 },
                    { dx: -1, dy: 0 },
                    { dx: 1, dy: 0 }
                ];

                while (queue.length > 0) {
                    const current = queue.shift();
                    reachable.push(current);

                    for (const dir of directions) {
                        const next = { x: current.x + dir.dx, y: current.y + dir.dy };
                        const key = `${next.x},${next.y}`;

                        if (
                            !visited.has(key) &&
                            next.y >= 0 &&
                            next.y < maze.length &&
                            next.x >= 0 &&
                            next.x < maze[next.y].length &&
                            maze[next.y][next.x] === 0
                        ) {
                            visited.add(key);
                            queue.push(next);
                        }
                    }
                }

                return reachable;
            }

            function findPath(maze, start, end) {
                if (!start || !end || maze[start.y]?.[start.x] !== 0 || maze[end.y]?.[end.x] !== 0) return [];

                const visited = new Set([`${start.x},${start.y}`]);
                const queue = [{ ...start, path: [start] }];
                const directions = [
                    { dx: 0, dy: -1 },
                    { dx: 0, dy: 1 },
                    { dx: -1, dy: 0 },
                    { dx: 1, dy: 0 }
                ];

                while (queue.length > 0) {
                    const current = queue.shift();

                    if (current.x === end.x && current.y === end.y) {
                        return current.path;
                    }

                    for (const dir of directions) {
                        const next = { x: current.x + dir.dx, y: current.y + dir.dy };
                        const key = `${next.x},${next.y}`;

                        if (
                            !visited.has(key) &&
                            next.y >= 0 &&
                            next.y < maze.length &&
                            next.x >= 0 &&
                            next.x < maze[next.y].length &&
                            maze[next.y][next.x] === 0
                        ) {
                            visited.add(key);
                            queue.push({ ...next, path: [...current.path, next] });
                        }
                    }
                }

                return [];
            }

            function distance(a, b) {
                return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
            }

            // ==================== LEVEL SETUP ====================

            function getLevelConfig(level) {
                const levelKey = `level${level}`;
                return config.levels[levelKey];
            }

            function setupLevel(level) {
                const levelConfig = getLevelConfig(level);
                
                mazeWidth = levelConfig.mazeSize;
                mazeHeight = levelConfig.mazeSize;
                tileSize = config.settings.tileSize;

                // Generate maze
                maze = generateMaze(mazeWidth, mazeHeight);

                // Find floor tiles
                const floors = findFloorTiles(maze);
                const deadEnds = findDeadEnds(maze);

                // Place player at start (top-left area)
                const startCandidates = floors.filter(f => f.x < mazeWidth / 3 && f.y < mazeHeight / 3);
                const startPos = startCandidates.length > 0 ? startCandidates[Math.floor(Math.random() * startCandidates.length)] : floors[0];
                levelStartPos = startPos;
                
                player.x = startPos.x;
                player.y = startPos.y;
                player.targetX = startPos.x;
                player.targetY = startPos.y;
                player.moving = false;
                player.moveProgress = 0;

                // Place exit at far corner (bottom-right area)
                const reachableFloors = findReachableTiles(maze, startPos);
                const exitCandidates = reachableFloors.filter(f => f.x > mazeWidth * 2 / 3 && f.y > mazeHeight * 2 / 3);
                const fallbackExitCandidates = reachableFloors.filter(f => !(f.x === startPos.x && f.y === startPos.y));
                exitPos =
                    exitCandidates.length > 0
                        ? exitCandidates[Math.floor(Math.random() * exitCandidates.length)]
                        : fallbackExitCandidates.sort((a, b) => distance(b, startPos) - distance(a, startPos))[0] || startPos;
                routePath = findPath(maze, startPos, exitPos);
                routeTiles = new Set(routePath.map(pos => `${pos.x},${pos.y}`));

                // Place dollar signs
                dollars = [];
                const dollarCount = levelConfig.dollarCount;
                const availableFloors = floors.filter(f => 
                    !(f.x === startPos.x && f.y === startPos.y) && 
                    !(f.x === exitPos.x && f.y === exitPos.y)
                );

                for (let i = 0; i < dollarCount && availableFloors.length > 0; i++) {
                    const idx = Math.floor(Math.random() * availableFloors.length);
                    const pos = availableFloors.splice(idx, 1)[0];
                    dollars.push({ x: pos.x, y: pos.y, collected: false, value: levelConfig.dollarValue });
                }

                // Place treasures (level 3+)
                treasures = [];
                if (level >= 3 && levelConfig.treasureCount > 0) {
                    // Prefer dead ends for treasures
                    const treasureCandidates = deadEnds.filter(d => 
                        !(d.x === startPos.x && d.y === startPos.y) && 
                        !(d.x === exitPos.x && d.y === exitPos.y) &&
                        !dollars.some(dol => dol.x === d.x && dol.y === d.y) &&
                        distance(d, startPos) > 8
                    );

                    const treasureCount = levelConfig.treasureCount;
                    for (let i = 0; i < treasureCount && treasureCandidates.length > 0; i++) {
                        const idx = Math.floor(Math.random() * treasureCandidates.length);
                        const pos = treasureCandidates.splice(idx, 1)[0];
                        treasures.push({ x: pos.x, y: pos.y, collected: false, value: levelConfig.treasureValue });
                    }
                }

                // Place holes (level 3+)
                holes = [];
                if (level >= 3 && levelConfig.holeCount > 0) {
                    const holeCandidates = floors.filter(f => 
                        !(f.x === startPos.x && f.y === startPos.y) && 
                        !(f.x === exitPos.x && f.y === exitPos.y) &&
                        !dollars.some(dol => dol.x === f.x && dol.y === f.y) &&
                        !treasures.some(tre => tre.x === f.x && tre.y === f.y) &&
                        !routeTiles.has(`${f.x},${f.y}`) &&
                        distance(f, startPos) > 5 && distance(f, exitPos) > 5
                    );

                    const holeCount = levelConfig.holeCount;
                    for (let i = 0; i < holeCount && holeCandidates.length > 0; i++) {
                        const idx = Math.floor(Math.random() * holeCandidates.length);
                        const pos = holeCandidates.splice(idx, 1)[0];
                        holes.push({ x: pos.x, y: pos.y });
                    }
                }

                // Set timer
                timeRemaining = levelConfig.timeLimit;
                
                // Track level start time
                currentLevelStartTime = totalGameTime;

                // Reset animations
                collectAnimations = [];
                portalRotation = 0;

                // Update camera
                updateCamera();
            }

            // ==================== CAMERA ====================

            function updateCamera() {
                const viewWidth = canvas.width;
                const viewHeight = canvas.height;

                // Center camera on player
                const targetCamX = (player.x + 0.5) * tileSize - viewWidth / 2;
                const targetCamY = (player.y + 0.5) * tileSize - viewHeight / 2;

                // Clamp camera to maze bounds
                const maxCamX = mazeWidth * tileSize - viewWidth;
                const maxCamY = mazeHeight * tileSize - viewHeight;

                camera.x = Math.max(0, Math.min(maxCamX, targetCamX));
                camera.y = Math.max(0, Math.min(maxCamY, targetCamY));
            }

            // ==================== INPUT HANDLING ====================

            // Keyboard
            window.addEventListener('keydown', (e) => {
                const key = e.key.toLowerCase();
                if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
                    e.preventDefault();
                    keys[key] = true;
                }
            });

            window.addEventListener('keyup', (e) => {
                const key = e.key.toLowerCase();
                keys[key] = false;
            });

            window.addEventListener('blur', () => {
                keys = {};
                joystickInput = { x: 0, y: 0, active: false };
            });

            // Touch joystick
            function setupJoystick() {
                if (!isTouchDevice) return;

                joystickArea.style.display = 'block';

                joystickArea.addEventListener('touchstart', (e) => {
                    if (gameState !== 'playing') return;
                    e.preventDefault();
                    
                    const touch = e.changedTouches[0];
                    joystickTouchId = touch.identifier;
                    
                    const rect = joystickArea.getBoundingClientRect();
                    const x = touch.clientX - rect.left;
                    const y = touch.clientY - rect.top;

                    joystickBase.style.display = 'block';
                    joystickBase.style.left = (x - 60) + 'px';
                    joystickBase.style.top = (y - 60) + 'px';
                    
                    joystickStick.style.left = '35px';
                    joystickStick.style.top = '35px';
                    
                    joystickInput.active = true;
                    joystickInput.x = 0;
                    joystickInput.y = 0;
                }, { passive: false });

                joystickArea.addEventListener('touchmove', (e) => {
                    if (!joystickInput.active) return;
                    e.preventDefault();

                    let touch = null;
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        if (e.changedTouches[i].identifier === joystickTouchId) {
                            touch = e.changedTouches[i];
                            break;
                        }
                    }
                    if (!touch) return;

                    const rect = joystickArea.getBoundingClientRect();
                    const baseRect = joystickBase.getBoundingClientRect();
                    const centerX = baseRect.left + 60 - rect.left;
                    const centerY = baseRect.top + 60 - rect.top;

                    const touchX = touch.clientX - rect.left;
                    const touchY = touch.clientY - rect.top;

                    let dx = touchX - centerX;
                    let dy = touchY - centerY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const maxRadius = 50;

                    if (dist > maxRadius) {
                        dx = (dx / dist) * maxRadius;
                        dy = (dy / dist) * maxRadius;
                    }

                    joystickStick.style.left = (35 + dx) + 'px';
                    joystickStick.style.top = (35 + dy) + 'px';

                    // Dead zone
                    if (dist < 15) {
                        joystickInput.x = 0;
                        joystickInput.y = 0;
                    } else {
                        joystickInput.x = dx / maxRadius;
                        joystickInput.y = dy / maxRadius;
                    }
                }, { passive: false });

                const endJoystick = (e) => {
                    let found = false;
                    for (let i = 0; i < e.changedTouches.length; i++) {
                        if (e.changedTouches[i].identifier === joystickTouchId) {
                            found = true;
                            break;
                        }
                    }
                    if (!found) return;

                    joystickInput.active = false;
                    joystickInput.x = 0;
                    joystickInput.y = 0;
                    joystickBase.style.display = 'none';
                    joystickTouchId = null;
                };

                joystickArea.addEventListener('touchend', endJoystick);
                joystickArea.addEventListener('touchcancel', endJoystick);
            }

            function getMovementInput() {
                let dx = 0;
                let dy = 0;

                // Keyboard input
                if (keys['w'] || keys['arrowup']) dy -= 1;
                if (keys['s'] || keys['arrowdown']) dy += 1;
                if (keys['a'] || keys['arrowleft']) dx -= 1;
                if (keys['d'] || keys['arrowright']) dx += 1;

                // Joystick input (prioritize strongest axis)
                if (joystickInput.active) {
                    if (Math.abs(joystickInput.x) > Math.abs(joystickInput.y)) {
                        dx = joystickInput.x > 0.3 ? 1 : (joystickInput.x < -0.3 ? -1 : 0);
                    } else {
                        dy = joystickInput.y > 0.3 ? 1 : (joystickInput.y < -0.3 ? -1 : 0);
                    }
                }

                return { dx, dy };
            }

            // ==================== GAME LOGIC ====================

            function canMoveTo(x, y) {
                if (x < 0 || x >= mazeWidth || y < 0 || y >= mazeHeight) return false;
                return maze[y][x] === 0;
            }

            function updatePlayer(deltaTime) {
                if (player.moving) {
                    player.moveProgress += deltaTime * (config.settings.playerSpeed / tileSize);
                    
                    if (player.moveProgress >= 1) {
                        player.x = player.targetX;
                        player.y = player.targetY;
                        player.moving = false;
                        player.moveProgress = 0;

                        // Check collectibles
                        checkCollectibles();

                        // Check exit
                        if (player.x === exitPos.x && player.y === exitPos.y) {
                            completeLevel();
                        }
                    }
                } else {
                    const input = getMovementInput();
                    
                    if (input.dx !== 0 || input.dy !== 0) {
                        // Prioritize one direction
                        let moveX = 0, moveY = 0;
                        if (Math.abs(input.dx) >= Math.abs(input.dy)) {
                            moveX = input.dx > 0 ? 1 : -1;
                        } else {
                            moveY = input.dy > 0 ? 1 : -1;
                        }

                        const newX = player.x + moveX;
                        const newY = player.y + moveY;

                        if (canMoveTo(newX, newY)) {
                            player.targetX = newX;
                            player.targetY = newY;
                            player.moving = true;
                            player.moveProgress = 0;

                            // Update direction
                            if (moveX > 0) player.direction = 'right';
                            else if (moveX < 0) player.direction = 'left';
                            else if (moveY > 0) player.direction = 'down';
                            else if (moveY < 0) player.direction = 'up';
                        }
                    }
                }

                updateCamera();
            }

            function checkCollectibles() {
                // Check dollars
                for (const dollar of dollars) {
                    if (!dollar.collected && dollar.x === player.x && dollar.y === player.y) {
                        dollar.collected = true;
                        score += dollar.value;
                        playSound('coin_collect_sound', 0.5);
                        collectAnimations.push({
                            x: dollar.x,
                            y: dollar.y,
                            type: 'dollar',
                            progress: 0,
                            value: dollar.value
                        });
                    }
                }

                // Check treasures
                for (const treasure of treasures) {
                    if (!treasure.collected && treasure.x === player.x && treasure.y === player.y) {
                        treasure.collected = true;
                        score += treasure.value;
                        playSound('treasure_collect_sound', 0.6);
                        collectAnimations.push({
                            x: treasure.x,
                            y: treasure.y,
                            type: 'treasure',
                            progress: 0,
                            value: treasure.value
                        });
                    }
                }

                // Check holes
                for (const hole of holes) {
                    if (!hole.triggered && hole.x === player.x && hole.y === player.y) {
                        hole.triggered = true; // Mark hole as triggered so it disappears

                        // 50% chance to return to start or jump forward on the valid route.
                        const routeDestination = routePath.length > 0
                            ? routePath[Math.floor(routePath.length * 0.8)]
                            : exitPos;
                        const destination = Math.random() < 0.5 ? levelStartPos : routeDestination;

                        player.x = destination.x;
                        player.y = destination.y;
                        player.targetX = player.x;
                        player.targetY = player.y;
                        player.moving = false;
                        player.moveProgress = 0;
                        playSound('level_complete_sound', 0.4); // Use a sound effect for teleport
                    }
                }

            }

            function updateTimer(deltaTime) {
                timeRemaining -= deltaTime;
                totalGameTime += deltaTime; // Track total time
                
                if (timeRemaining <= 0) {
                    timeRemaining = 0;
                    gameOver();
                }
            }

            function updateAnimations(deltaTime) {
                portalRotation += deltaTime * 2;

                for (let i = collectAnimations.length - 1; i >= 0; i--) {
                    collectAnimations[i].progress += deltaTime * 3;
                    if (collectAnimations[i].progress >= 1) {
                        collectAnimations.splice(i, 1);
                    }
                }
            }

            function completeLevel() {
                playSound('level_complete_sound', 0.7);
                
                // Calculate level completion time
                const levelTime = totalGameTime - currentLevelStartTime;
                levelCompletionTimes.push(levelTime);
                
                // Check for 2-minute level bonus ($500)
                if (levelTime < 120) {
                    score += 500;
                    bonusesEarned.push({
                        text: `⚡ Speed Bonus: +$500 (Level ${currentLevel} < 2 min)`,
                        timestamp: Date.now()
                    });
                }
                
                if (currentLevel >= 5) {
                    victory();
                } else {
                    gameState = 'transition';
                    currentLevel++;
                    levelTransitionText.textContent = `Level ${currentLevel}`;
                    levelTransition.classList.add('visible');

                    setTimeout(() => {
                        setupLevel(currentLevel);
                        levelTransition.classList.remove('visible');
                        gameState = 'playing';
                    }, 1500);
                }
            }

            function gameOver() {
                gameState = 'gameover';
                stopBackgroundMusic();
                playSound('game_over_sound', 0.7);
                
                gameoverLevel.textContent = currentLevel;
                gameoverScore.textContent = '$' + score;
                gameoverScreen.classList.add('visible');
                hud.style.display = 'none';
                joystickArea.style.display = 'none';
            }

            async function victory() {
                // Check for 5-minute total game bonus ($1000)
                if (totalGameTime < 300) {
                    score += 1000;
                    bonusesEarned.push({
                        text: `🚀 Master Speed Bonus: +$1000 (All levels < 5 min)`,
                        timestamp: Date.now()
                    });
                }
                
                gameState = 'victory';
                stopBackgroundMusic();
                playSound('level_complete_sound', 0.8);
                
                // Display score and bonuses
                victoryScore.textContent = '$' + score;
                
                // Display bonuses
                bonusContainer.innerHTML = '';
                if (bonusesEarned.length > 0) {
                    for (const bonus of bonusesEarned) {
                        const bonusDiv = document.createElement('div');
                        bonusDiv.className = 'bonus-display';
                        bonusDiv.textContent = bonus.text;
                        bonusContainer.appendChild(bonusDiv);
                    }
                }
                
                // Submit to leaderboard and display
                try {
                    const response = await lib.addPlayerScoreToLeaderboard(score, 5);
                    
                    if (response.success) {
                        displayLeaderboard(response.entries, response.userRank);
                    }
                } catch (error) {
                    lib.log(`Failed to submit score to leaderboard: ${error.message}`);
                    // Game still works without leaderboard
                }
                
                victoryScreen.classList.add('visible');
                hud.style.display = 'none';
                joystickArea.style.display = 'none';
            }
            
            function displayLeaderboard(entries, userRank) {
                leaderboardContainer.style.display = 'block';
                leaderboardEntries.innerHTML = '';
                
                if (entries && entries.length > 0) {
                    entries.forEach((entry, index) => {
                        const entryDiv = document.createElement('div');
                        entryDiv.className = 'leaderboard-entry';
                        
                        // Highlight current player
                        if (entry.userId === lib.getUserId()) {
                            entryDiv.classList.add('current-player');
                        }
                        
                        // Rank
                        const rankSpan = document.createElement('span');
                        rankSpan.className = 'leaderboard-rank';
                        rankSpan.textContent = `#${index + 1}`;
                        entryDiv.appendChild(rankSpan);
                        
                        // Profile picture
                        if (entry.profilePicture) {
                            const profileImg = document.createElement('img');
                            profileImg.className = 'leaderboard-profile';
                            profileImg.src = entry.profilePicture;
                            profileImg.onerror = () => {
                                // Fallback to colored div
                                profileImg.style.display = 'none';
                            };
                            entryDiv.appendChild(profileImg);
                        } else {
                            const profileDiv = document.createElement('div');
                            profileDiv.className = 'leaderboard-profile';
                            entryDiv.appendChild(profileDiv);
                        }
                        
                        // Username
                        const nameSpan = document.createElement('span');
                        nameSpan.className = 'leaderboard-name';
                        nameSpan.textContent = entry.username || 'Anonymous';
                        entryDiv.appendChild(nameSpan);
                        
                        // Score
                        const scoreSpan = document.createElement('span');
                        scoreSpan.className = 'leaderboard-score';
                        scoreSpan.textContent = '$' + entry.score;
                        entryDiv.appendChild(scoreSpan);
                        
                        leaderboardEntries.appendChild(entryDiv);
                    });
                }
                
                // Display user's rank
                if (userRank !== null && userRank !== undefined) {
                    yourRank.textContent = `Your Rank: #${userRank}`;
                } else {
                    yourRank.textContent = '';
                }
            }

            function startGame() {
                currentLevel = config.settings.startingLevel;
                score = 0;
                totalGameTime = 0;
                levelCompletionTimes = [];
                bonusesEarned = [];
                gameState = 'playing';

                startScreen.classList.remove('visible');
                gameoverScreen.classList.remove('visible');
                victoryScreen.classList.remove('visible');
                hud.style.display = 'flex';
                
                if (isTouchDevice) {
                    joystickArea.style.display = 'block';
                }

                setupLevel(currentLevel);
                playBackgroundMusic();
            }

            function restartGame() {
                gameoverScreen.classList.remove('visible');
                victoryScreen.classList.remove('visible');
                startGame();
            }

            // ==================== RENDERING ====================

            function drawMaze() {
                const startX = Math.floor(camera.x / tileSize);
                const startY = Math.floor(camera.y / tileSize);
                const endX = Math.min(mazeWidth, startX + Math.ceil(canvas.width / tileSize) + 2);
                const endY = Math.min(mazeHeight, startY + Math.ceil(canvas.height / tileSize) + 2);

                for (let y = Math.max(0, startY); y < endY; y++) {
                    for (let x = Math.max(0, startX); x < endX; x++) {
                        const screenX = x * tileSize - camera.x;
                        const screenY = y * tileSize - camera.y;

                        if (maze[y][x] === 1) {
                            // Wall
                            ctx.fillStyle = config.visuals.wallColor;
                            ctx.fillRect(screenX, screenY, tileSize, tileSize);
                            
                            // Wall border
                            ctx.fillStyle = 'rgba(0,0,0,0.3)';
                            ctx.fillRect(screenX, screenY + tileSize - 4, tileSize, 4);
                        } else {
                            // Floor
                            ctx.fillStyle = config.visuals.floorColor;
                            ctx.fillRect(screenX, screenY, tileSize, tileSize);
                            
                            // Subtle grid lines
                            ctx.strokeStyle = 'rgba(0,0,0,0.1)';
                            ctx.strokeRect(screenX, screenY, tileSize, tileSize);
                        }
                    }
                }
            }

            function drawExit() {
                const screenX = exitPos.x * tileSize - camera.x;
                const screenY = exitPos.y * tileSize - camera.y;

                // Check if visible
                if (screenX + tileSize < 0 || screenX > canvas.width ||
                    screenY + tileSize < 0 || screenY > canvas.height) return;

                const centerX = screenX + tileSize / 2;
                const centerY = screenY + tileSize / 2;

                // Draw portal glow
                const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, tileSize * 0.6);
                gradient.addColorStop(0, 'rgba(46, 204, 113, 0.8)');
                gradient.addColorStop(0.5, 'rgba(46, 204, 113, 0.4)');
                gradient.addColorStop(1, 'rgba(46, 204, 113, 0)');
                ctx.fillStyle = gradient;
                ctx.fillRect(screenX - tileSize * 0.2, screenY - tileSize * 0.2, tileSize * 1.4, tileSize * 1.4);

                // Draw portal image or fallback
                if (imageCache['exit_portal']) {
                    ctx.save();
                    ctx.translate(centerX, centerY);
                    ctx.rotate(portalRotation);
                    const size = tileSize * 0.9;
                    ctx.drawImage(imageCache['exit_portal'], -size / 2, -size / 2, size, size);
                    ctx.restore();
                } else {
                    ctx.save();
                    ctx.translate(centerX, centerY);
                    ctx.rotate(portalRotation);
                    ctx.fillStyle = config.visuals.portalColor || '#2ECC71';
                    ctx.beginPath();
                    ctx.arc(0, 0, tileSize * 0.35, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            }

            function drawCollectibles() {
                // Draw dollars
                for (const dollar of dollars) {
                    if (dollar.collected) continue;

                    const screenX = dollar.x * tileSize - camera.x;
                    const screenY = dollar.y * tileSize - camera.y;

                    if (screenX + tileSize < 0 || screenX > canvas.width ||
                        screenY + tileSize < 0 || screenY > canvas.height) continue;

                    const centerX = screenX + tileSize / 2;
                    const centerY = screenY + tileSize / 2;
                    const size = tileSize * 0.6;

                    if (imageCache['dollar_sign']) {
                        const img = imageCache['dollar_sign'];
                        const aspect = img.width / img.height;
                        let drawW = size;
                        let drawH = size / aspect;
                        if (drawH > size) {
                            drawH = size;
                            drawW = size * aspect;
                        }
                        ctx.drawImage(img, centerX - drawW / 2, centerY - drawH / 2, drawW, drawH);
                    } else {
                        ctx.fillStyle = config.visuals.dollarColor;
                        ctx.font = `bold ${tileSize * 0.5}px Fredoka`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('$', centerX, centerY);
                    }
                }

                // Draw treasures
                for (const treasure of treasures) {
                    if (treasure.collected) continue;

                    const screenX = treasure.x * tileSize - camera.x;
                    const screenY = treasure.y * tileSize - camera.y;

                    if (screenX + tileSize < 0 || screenX > canvas.width ||
                        screenY + tileSize < 0 || screenY > canvas.height) continue;

                    const centerX = screenX + tileSize / 2;
                    const centerY = screenY + tileSize / 2;
                    const size = tileSize * 0.75;

                    if (imageCache['treasure_chest']) {
                        const img = imageCache['treasure_chest'];
                        const aspect = img.width / img.height;
                        let drawW = size;
                        let drawH = size / aspect;
                        if (drawH > size) {
                            drawH = size;
                            drawW = size * aspect;
                        }
                        ctx.drawImage(img, centerX - drawW / 2, centerY - drawH / 2, drawW, drawH);
                    } else {
                        ctx.fillStyle = config.visuals.treasureColor;
                        ctx.fillRect(centerX - size / 2, centerY - size / 3, size, size * 0.6);
                        ctx.fillStyle = '#FFD700';
                        ctx.fillRect(centerX - size / 6, centerY - size / 6, size / 3, size / 4);
                    }
                }

                // Draw holes
                for (const hole of holes) {
                    if (hole.triggered) continue; // Skip holes that have been triggered
                    
                    const screenX = hole.x * tileSize - camera.x;
                    const screenY = hole.y * tileSize - camera.y;

                    if (screenX + tileSize < 0 || screenX > canvas.width ||
                        screenY + tileSize < 0 || screenY > canvas.height) continue;

                    const centerX = screenX + tileSize / 2;
                    const centerY = screenY + tileSize / 2;
                    const size = tileSize * 0.6;

                    // Draw hole as a dark swirling vortex
                    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, size / 2);
                    gradient.addColorStop(0, 'rgba(100, 50, 150, 0.8)');
                    gradient.addColorStop(0.5, 'rgba(50, 20, 100, 0.6)');
                    gradient.addColorStop(1, 'rgba(20, 10, 40, 0.3)');
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2);
                    ctx.fill();

                    // Draw spiral pattern
                    ctx.strokeStyle = 'rgba(150, 100, 200, 0.5)';
                    ctx.lineWidth = 2;
                    for (let i = 0; i < 3; i++) {
                        ctx.beginPath();
                        const angle = (portalRotation + i * Math.PI * 2 / 3) % (Math.PI * 2);
                        const x1 = centerX + Math.cos(angle) * (size / 4);
                        const y1 = centerY + Math.sin(angle) * (size / 4);
                        const x2 = centerX + Math.cos(angle + Math.PI) * (size / 4);
                        const y2 = centerY + Math.sin(angle + Math.PI) * (size / 4);
                        ctx.moveTo(x1, y1);
                        ctx.lineTo(x2, y2);
                        ctx.stroke();
                    }

                    // Draw warning symbol
                    ctx.fillStyle = '#FF6B6B';
                    ctx.font = `bold ${tileSize * 0.4}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('⚠', centerX, centerY);
                }
            }

            function drawPlayer() {
                let drawX = player.x;
                let drawY = player.y;

                if (player.moving) {
                    const t = player.moveProgress;
                    drawX = player.x + (player.targetX - player.x) * t;
                    drawY = player.y + (player.targetY - player.y) * t;
                }

                const screenX = drawX * tileSize - camera.x + tileSize / 2;
                const screenY = drawY * tileSize - camera.y + tileSize / 2;
                const size = tileSize * 0.75;

                if (imageCache['player_character']) {
                    const img = imageCache['player_character'];
                    const aspect = img.width / img.height;
                    let drawW = size;
                    let drawH = size / aspect;
                    if (drawH > size) {
                        drawH = size;
                        drawW = size * aspect;
                    }
                    
                    ctx.save();
                    ctx.translate(screenX, screenY);
                    
                    // Rotate based on direction
                    let rotation = 0;
                    if (player.direction === 'up') rotation = -Math.PI / 2;
                    else if (player.direction === 'down') rotation = Math.PI / 2;
                    else if (player.direction === 'left') rotation = Math.PI;
                    ctx.rotate(rotation);
                    
                    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
                    ctx.restore();
                } else {
                    // Fallback circle
                    ctx.fillStyle = config.visuals.playerColor;
                    ctx.beginPath();
                    ctx.arc(screenX, screenY, size / 2, 0, Math.PI * 2);
                    ctx.fill();
                    
                    ctx.strokeStyle = '#FFFFFF';
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    // Direction indicator
                    ctx.fillStyle = '#FFFFFF';
                    let indicatorX = screenX;
                    let indicatorY = screenY;
                    if (player.direction === 'up') indicatorY -= size / 4;
                    else if (player.direction === 'down') indicatorY += size / 4;
                    else if (player.direction === 'left') indicatorX -= size / 4;
                    else if (player.direction === 'right') indicatorX += size / 4;
                    
                    ctx.beginPath();
                    ctx.arc(indicatorX, indicatorY, 4, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            function drawCollectAnimations() {
                for (const anim of collectAnimations) {
                    const screenX = anim.x * tileSize - camera.x + tileSize / 2;
                    const screenY = anim.y * tileSize - camera.y + tileSize / 2;

                    const scale = 1 + anim.progress * 0.5;
                    const alpha = 1 - anim.progress;

                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.translate(screenX, screenY);
                    ctx.scale(scale, scale);

                    // Draw value text floating up
                    ctx.fillStyle = anim.type === 'treasure' ? '#FFD700' : '#F1C40F';
                    ctx.font = 'bold 20px Fredoka';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('+$' + anim.value, 0, -20 * anim.progress);

                    ctx.restore();
                }
            }

            function updateHUD() {
                hudLevel.textContent = currentLevel;
                hudTimer.textContent = Math.ceil(timeRemaining);
                hudScore.textContent = '$' + score;

                // Warning effect when time is low
                if (timeRemaining <= 10) {
                    hudTimer.classList.add('warning');
                } else {
                    hudTimer.classList.remove('warning');
                }
            }

            // ==================== EDIT MODE ====================

            function setupEditMode() {
                editInfo.style.display = 'block';
                startScreen.style.display = 'none';
                hud.style.display = 'none';

                // Show game parameters
                lib.showGameParameters({
                    name: 'Treasure Maze Dash Settings',
                    params: {
                        'Player Speed': {
                            key: 'settings.playerSpeed',
                            type: 'slider',
                            min: 100,
                            max: 400,
                            step: 10
                        },
                        'Tile Size': {
                            key: 'settings.tileSize',
                            type: 'slider',
                            min: 32,
                            max: 64,
                            step: 4
                        },
                        'Starting Level': {
                            key: 'settings.startingLevel',
                            type: 'slider',
                            min: 1,
                            max: 5,
                            step: 1
                        },
                        'Wall Color': {
                            key: 'visuals.wallColor',
                            type: 'color'
                        },
                        'Floor Color': {
                            key: 'visuals.floorColor',
                            type: 'color'
                        },
                        'Player Color': {
                            key: 'visuals.playerColor',
                            type: 'color'
                        },
                        'L1 Maze Size': {
                            key: 'levels.level1.mazeSize',
                            type: 'slider',
                            min: 11,
                            max: 25,
                            step: 2
                        },
                        'L1 Time Limit': {
                            key: 'levels.level1.timeLimit',
                            type: 'slider',
                            min: 30,
                            max: 180,
                            step: 5
                        },
                        'L1 Dollar Value': {
                            key: 'levels.level1.dollarValue',
                            type: 'slider',
                            min: 5,
                            max: 100,
                            step: 5
                        },
                        'L3 Treasure Count': {
                            key: 'levels.level3.treasureCount',
                            type: 'slider',
                            min: 0,
                            max: 10,
                            step: 1
                        },
                        'L3 Treasure Value': {
                            key: 'levels.level3.treasureValue',
                            type: 'slider',
                            min: 50,
                            max: 500,
                            step: 25
                        }
                    }
                });

                // Draw a sample maze preview
                mazeWidth = 15;
                mazeHeight = 15;
                tileSize = config.settings.tileSize;
                maze = generateMaze(mazeWidth, mazeHeight);
                camera = { x: 0, y: 0 };

                function editRender() {
                    ctx.fillStyle = '#1a1a2e';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    // Center the preview maze
                    const mazePixelWidth = mazeWidth * tileSize;
                    const mazePixelHeight = mazeHeight * tileSize;
                    camera.x = -(canvas.width - mazePixelWidth) / 2;
                    camera.y = -(canvas.height - mazePixelHeight) / 2;

                    drawMaze();

                    requestAnimationFrame(editRender);
                }
                editRender();
            }

            // ==================== PLAY MODE ====================

            function setupPlayMode() {
                // Set up instructions based on device
                if (isTouchDevice) {
                    instructionsEl.innerHTML = 'Touch and drag to move<br>Collect 💰 and find the exit!';
                } else {
                    instructionsEl.innerHTML = 'Use WASD or Arrow Keys to move<br>Collect 💰 and find the exit!';
                }

                // Show game parameters for play mode too
                lib.showGameParameters({
                    name: 'Game Settings',
                    params: {
                        'Starting Level': {
                            key: 'settings.startingLevel',
                            type: 'slider',
                            min: 1,
                            max: 5,
                            step: 1
                        }
                    }
                });

                // Button handlers
                startBtn.addEventListener('click', () => {
                    if (audioContext && audioContext.state === 'suspended') {
                        audioContext.resume();
                    }
                    startGame();
                });

                restartBtn.addEventListener('click', restartGame);
                victoryRestartBtn.addEventListener('click', restartGame);

                // Setup joystick for mobile
                setupJoystick();

                // Game loop
                function gameLoop(timestamp) {
                    const deltaTime = Math.min((timestamp - lastTimestamp) / 1000, 0.11);
                    lastTimestamp = timestamp;

                    // Clear canvas
                    ctx.fillStyle = '#1a1a2e';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    if (gameState === 'playing') {
                        updatePlayer(deltaTime);
                        updateTimer(deltaTime);
                        updateAnimations(deltaTime);
                        updateHUD();
                    } else if (gameState === 'transition') {
                        updateAnimations(deltaTime);
                    }

                    // Render
                    if (gameState === 'playing' || gameState === 'transition' || gameState === 'gameover' || gameState === 'victory') {
                        drawMaze();
                        drawExit();
                        drawCollectibles();
                        drawPlayer();
                        drawCollectAnimations();
                    }

                    requestAnimationFrame(gameLoop);
                }

                lastTimestamp = performance.now();
                requestAnimationFrame(gameLoop);
            }

            // ==================== INITIALIZATION ====================

            await preloadAssets();

            if (mode === 'edit') {
                setupEditMode();
            } else {
                setupPlayMode();
            }
        }
