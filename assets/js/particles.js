(function (window, document) {
    'use strict';

    function Plugin() {
    }

    Plugin.prototype.init = function (opts) {
        opts = opts || {};
        const sel = opts.selector || '#particles-js';

        const host = document.querySelector(sel);
        if (!host) {
            console.warn('Particles: selector not found →', sel);
            return;
        }

        let cvs = host.tagName.toLowerCase() === 'canvas'
            ? host

            : host.querySelector('canvas');


        if (!cvs) {
            cvs = document.createElement('canvas');
            cvs.className = 'particles-js-canvas-el';
            cvs.style.width = '100%';
            cvs.style.height = '100%';
            host.appendChild(cvs);
        }

        const urls = [
            '/assets/img/rock1.png',
            '/assets/img/rock2.png',
            '/assets/img/rock3.png',
            '/assets/img/rock4.png'
        ];
        const imgs = urls.map(u => new Promise(res => {
            const i = new Image();
            i.src = u;
            i.onload = () => res(i);
        }));
        Promise.all(imgs).then(imgArr => new AsteroidField(cvs, imgArr));
    };
    window.Particles = new Plugin();

    function AsteroidField(cvs, spriteImgs) {

        const SCALE = 6, AST_SIZE = 3, RATE = 1000, GRAVITY = 0.05;
        const IMPACT_DELAY = RATE * 9, IMPACT_VAR = RATE + 5;

        let GRID_W, GRID_H;
        let groundH, groundShade, groundPix, imgData, dataBuf;
        let asteroids = [], debris = [], flames = [];
        let stars = [];

        cvs.style.imageRendering = 'pixelated';
        cvs.style.display = 'block';
        const ctx = cvs.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        function allocateArrays() {
            GRID_W = Math.ceil(cvs.clientWidth / SCALE);
            GRID_H = Math.ceil(cvs.clientHeight / SCALE);

            cvs.width = GRID_W;
            cvs.height = GRID_H;
            cvs.style.width = GRID_W * SCALE + 'px';
            cvs.style.height = GRID_H * SCALE + 'px';

            groundH = new Uint8Array(GRID_W).fill(GRID_H);
            groundShade = new Uint8Array(GRID_W).fill(48);
            groundPix = Array.from({length: GRID_H}, () => new Uint8Array(GRID_W).fill(255));

            imgData = ctx.createImageData(GRID_W, GRID_H);
            dataBuf = imgData.data;
        }

        allocateArrays();
        window.addEventListener('resize', () => {
            allocateArrays();
            asteroids = [];
            debris = [];
            flames = [];
            makeStars()
        });
        makeStars();

        const rand = (a, b) => a + Math.random() * (b - a);

        class Asteroid {
            constructor(big = false) {
                this.big = big;
                this.size = big ? AST_SIZE * (1 + Math.random() * 2.5) : AST_SIZE;

                this.x = rand(0, GRID_W - this.size);
                this.vx = rand(-0.35, 0.35);
                this.y = -this.size;
                this.vy = rand(0.2, 0.6);

                const sprite = spriteImgs[Math.random() * spriteImgs.length | 0];

                if (big) {
                    const hue = rand(5, 25);
                    const tint = `hsl(${hue} 100% 60%)`;

                    const buf = document.createElement('canvas');
                    buf.width = 32;
                    buf.height = 32;
                    const bctx = buf.getContext('2d');
                    bctx.imageSmoothingEnabled = false;

                    /* draw the original sprite */
                    bctx.drawImage(sprite, 0, 0);

                    bctx.globalCompositeOperation = 'source-atop';
                    bctx.fillStyle = tint;
                    bctx.globalAlpha = 0.9;
                    bctx.fillRect(0, 0, 32, 32);

                    this.sprite = buf;
                } else {
                    this.sprite = sprite;
                }
            }

            step() {
                this.x += this.vx;
                this.y += this.vy;
                this.vy += 0.015;
                if (this.x < 0) {
                    this.x = 0;
                    this.vx *= -1;
                }
                if (this.x > GRID_W - this.size) {
                    this.x = GRID_W - this.size;
                    this.vx *= -1;
                }

                ctx.drawImage(this.sprite,
                    0, 0, 32, 32,
                    this.x | 0, this.y | 0,
                    6, 6);

                const mid = Math.min(GRID_W - 1, Math.max(0, Math.floor(this.x + this.size * 0.5)));
                if (this.y + this.size >= groundH[mid]) {
                    this.big ? crater(mid, this.size * 2) : explode(this.x, this.y);
                    return false;
                }
                return this.y <= GRID_H;
            }
        }

        class Debris {
            constructor(x, y) {
                this.x = x;
                this.y = y;
                this.vx = rand(-0.3, 0.3);
                this.vy = rand(-1.1, -0.3);
                this.size = 2;
                this.shade = 45 + Math.random() * 25 | 0;
                this.col = `hsl(0 0% ${this.shade}%)`;
            }

            colIdx() {
                return Math.max(0, Math.min(GRID_W - 1, Math.floor(this.x)));
            }

            step() {
                this.x += this.vx;
                this.y += this.vy;
                this.vy += GRAVITY;
                if (this.x < 0) {
                    this.x = 0;
                    this.vx *= -.5;
                }
                if (this.x > GRID_W - this.size) {
                    this.x = GRID_W - this.size;
                    this.vx *= -.5;
                }

                if (this.y + this.size >= groundH[this.colIdx()]) {
                    /* paint into ground */
                    for (let dx = 0; dx < this.size; dx++) {
                        const c = Math.floor(this.x + dx);
                        if (c < 0 || c >= GRID_W) continue;
                        const top = Math.floor(this.y);
                        for (let dy = 0; dy < this.size; dy++) {
                            const r = top + dy;
                            if (r >= GRID_H) continue;
                            groundPix[r][c] = this.shade;
                        }
                        if (top < groundH[c]) {
                            groundH[c] = top;
                            groundShade[c] = this.shade;
                        }
                    }
                    return false;
                }
                ctx.fillStyle = this.col;
                ctx.fillRect(this.x | 0, this.y | 0, this.size, this.size);
                return true;
            }
        }

        class Flame {
            constructor(x, y) {
                this.x = x;
                this.y = y;
                this.vx = rand(-0.6, 0.6);
                this.vy = rand(-1.6, -0.8);
                this.size = 2;
                this.life = 35 + (Math.random() * 25 | 0);
                const hue = rand(25, 55);
                const light = rand(50, 65);
                this.col = `hsl(${hue} 100% ${light}%)`;
            }

            step() {
                this.x += this.vx;
                this.y += this.vy;
                this.vy += GRAVITY * 0.6;
                this.life--;
                if (this.life <= 0 || this.y >= GRID_H) return false;
                ctx.fillStyle = this.col;
                ctx.fillRect(this.x | 0, this.y | 0, this.size, this.size);
                return true;
            }
        }

        const explode = (x, y) => {
            const sy = y - 2;
            for (let i = 0; i < 15; i++)
                debris.push(new Debris(x + rand(0, AST_SIZE), sy + rand(0, AST_SIZE * .5)));
        };

        function crater(centerCol, baseR) {
            const a = baseR * (1.4 + Math.random() * 0.6), b = baseR, aCols = Math.ceil(a);
            const pile = [];
            for (let dx = -aCols; dx <= aCols; dx++) {
                const col = centerCol + dx;
                if (col < 0 || col >= GRID_W) continue;
                const nx = Math.abs(dx) / a;
                if (nx >= 1) continue;
                const depth = b * Math.cos(nx * Math.PI / 2);
                const target = Math.min(GRID_H - 5, groundH[col] + depth | 0);
                pile.push({col, vol: target - groundH[col]});
                for (let y = groundH[col]; y < target; y++) groundPix[y][col] = 255;
                groundH[col] = target;
            }
            pile.forEach(({col, vol}) => {
                const l = col - (aCols + 3), r = col + (aCols + 3);
                if (l >= 0) {
                    groundH[l] -= vol * .35;
                    groundShade[l] = 48;
                }
                if (r < GRID_W) {
                    groundH[r] -= vol * .35;
                    groundShade[r] = 48;
                }
            });
            for (let c = 1; c < GRID_W - 1; c++) {
                const avg = (groundH[c - 1] + groundH[c] + groundH[c + 1]) / 3;
                groundH[c] = groundH[c] * .65 + avg * .35;
            }
            for (let i = debris.length - 1; i >= 0; i--) {
                const d = debris[i];
                if (Math.abs(d.x - centerCol) < aCols && d.y > groundH[Math.floor(d.x)] - b * .5)
                    debris.splice(i, 1);
            }

            const impactY = groundH[centerCol] - 1;
            const sparks = 18 + (Math.random() * 7 | 0);
            for (let i = 0; i < sparks; i++) {
                flames.push(new Flame(centerCol + rand(-baseR, baseR), impactY));
            }
        }

        function makeStars() {
            const density = 0.0020;
            const n = Math.ceil(GRID_W * GRID_H * density);
            stars = Array.from({length: n}, () => ({
                x: Math.random() * GRID_W,
                y: Math.random() * GRID_H,
                a: Math.random(),                           // base alpha
                phase: Math.random() * Math.PI * 2         // twinkle offset
            }));
        }

        function drawGround() {
            for (let y = GRID_H - 2; y >= 0; y--) {
                for (let x = 0; x < GRID_W; x++) {
                    const shade = groundPix[y][x];
                    if (shade === 255) continue;

                    if (groundPix[y + 1][x] === 255) {
                        groundPix[y + 1][x] = shade;
                        groundPix[y][x] = 255;
                        if (y + 1 < groundH[x]) groundH[x] = y + 1;
                        continue;
                    }
                    if (x > 0 && groundPix[y + 1][x - 1] === 255) {
                        groundPix[y + 1][x - 1] = shade;
                        groundPix[y][x] = 255;
                        if (y + 1 < groundH[x - 1]) groundH[x - 1] = y + 1;
                        continue;
                    }
                    if (x < GRID_W - 1 && groundPix[y + 1][x + 1] === 255) {
                        groundPix[y + 1][x + 1] = shade;
                        groundPix[y][x] = 255;
                        if (y + 1 < groundH[x + 1]) groundH[x + 1] = y + 1;
                    }
                }
            }

            for (let x = 0; x < GRID_W; x++) {
                for (let y = 0; y < GRID_H; y++) {
                    if (groundPix[y][x] !== 255) {
                        groundH[x] = y;
                        groundShade[x] = groundPix[y][x];
                        break;
                    }
                    groundH[x] = GRID_H;
                    groundShade[x] = 48;
                }
            }

            const img = ctx.createImageData(GRID_W, GRID_H);
            const d = img.data;
            for (let y = 0, p = 0; y < GRID_H; y++) {
                for (let x = 0; x < GRID_W; x++, p += 4) {
                    const s = groundPix[y][x];
                    if (s !== 255) {
                        d[p] = d[p + 1] = d[p + 2] = s * 2.55 | 0;
                        d[p + 3] = 255;
                    }
                }
            }
            ctx.putImageData(img, 0, 0);
        }

        let last = 0, next = 0;

        function frame(t) {

            drawGround();

            const twinkleSpd = 0.002;
            stars.forEach(s => {
                const alpha = 0.4 + 0.6 * Math.abs(Math.sin(twinkleSpd * t + s.phase));
                ctx.fillStyle = `rgba(255,255,255,${alpha * s.a})`;
                ctx.fillRect(s.x | 0, s.y | 0, 1, 1);
            });

            if (t - last > RATE) {
                asteroids.push(new Asteroid(false));
                last = t;
            }
            if (t > next) {
                asteroids.push(new Asteroid(true));
                next = t + IMPACT_DELAY + Math.random() * IMPACT_VAR;
            }


            for (let i = asteroids.length - 1; i >= 0; i--) if (!asteroids[i].step()) asteroids.splice(i, 1);
            for (let i = debris.length - 1; i >= 0; i--) if (!debris[i].step()) debris.splice(i, 1);
            for (let i = flames.length - 1; i >= 0; i--) if (!flames[i].step()) flames.splice(i, 1);
            requestAnimationFrame(frame);
            console.log('Drew frame')
        }

        requestAnimationFrame(frame);
    }
})(window, document);