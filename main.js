/* main.js - NEO SMASH BREAKER (Fixed: Removed Duplicate AudioSys) */

/* --- ネットワーク管理クラス --- */
const Network = {
    peer: null, conn: null, isHost: false,
    inputData: { m: 0, r: 0, c: false }, 

    init() { }, 

    openMenu() {
        document.querySelectorAll('.screen').forEach(e => e.classList.remove('active'));
        document.getElementById('screen-network').classList.add('active');
        document.getElementById('net-menu-init').style.display = 'grid';
        document.getElementById('net-menu-host').style.display = 'none';
        document.getElementById('net-menu-connecting').style.display = 'none';
    },
    closeMenu() {
        if(this.peer) { this.peer.destroy(); this.peer = null; }
        document.getElementById('screen-network').classList.remove('active');
        document.getElementById('screen-mode').classList.add('active');
    },

    initHost() {
        document.getElementById('net-menu-init').style.display = 'none';
        document.getElementById('net-menu-host').style.display = 'grid';
        this.peer = new Peer();
        this.peer.on('open', id => {
            document.getElementById('host-id-display').innerText = id;
            this.isHost = true;
        });
        this.peer.on('connection', c => {
            this.conn = c;
            this.setupConnection();
            GameApp.start('online-host');
        });
        this.peer.on('error', err => alert('接続エラー: ' + err));
    },

    joinRoom() {
        const id = document.getElementById('net-room-id').value;
        if(!id) return alert("IDを入力してください");
        document.getElementById('net-menu-init').style.display = 'none';
        document.getElementById('net-menu-connecting').style.display = 'grid';
        
        this.peer = new Peer();
        this.peer.on('open', () => {
            this.conn = this.peer.connect(id);
            this.setupConnection();
            this.isHost = false;
        });
        this.peer.on('error', () => {
            alert('接続失敗。IDを確認してください。');
            location.reload();
        });
    },

    setupConnection() {
        this.conn.on('open', () => {
            console.log("接続完了");
            if(!this.isHost) GameApp.start('online-guest');
        });
        this.conn.on('data', data => {
            if (data.type === 'rematch_req') {
                GameApp.handleRematchRequest();
            } else if (data.type === 'rematch_start') {
                GameApp.startRematchGame();
            } else if(this.isHost) {
                if(data.type === 'input') this.inputData = data.val;
            } else {
                if(data.type === 'sync') GameApp.syncState(data.val);
            }
        });
        this.conn.on('close', () => {
            alert("対戦相手が切断しました");
            location.reload();
        });
    },

    sendInput(input) {
        if(this.conn && this.conn.open) this.conn.send({ type: 'input', val: input });
    },

    sendState(state) {
        if(this.conn && this.conn.open) this.conn.send({ type: 'sync', val: state });
    },

    sendRematchRequest() {
        if(this.conn && this.conn.open) this.conn.send({ type: 'rematch_req' });
    },

    sendRematchStart() {
        if(this.conn && this.conn.open) this.conn.send({ type: 'rematch_start' });
    }
};

/* --- ゲームアプリ本体 --- */
const GameApp = {
    canvas: null, ctx: null, mode: 'normal', state: 'title',
    p1: null, p2: null, ball: null, blocks: [],
    score: 0, startTime: 0, blocksBroken: 0, smashCount: 0, stage: 1,
    endlessTicker: 0, endlessSpeed: 1,
    drawingColor: '#f1c40f', isDrawing: false,
    editorColors: ['#FFFFFF','#C3C3C3','#585858','#000000','#FF4500','#FFD700','#9ACD32','#008000','#00CED1','#1E90FF','#0000CD','#8A2BE2','#C71585','#FF1493','#A52A2A','transparent'],
    
    // 再戦管理用
    rematchMe: false,
    rematchOpp: false,

    init() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = CFG.width; this.canvas.height = CFG.height;
        Input.init();
        this.initEditor();
        this.setupSettingsUI();
        requestAnimationFrame((t) => this.loop(t));
    },

    initEditor() {
        const grid = document.getElementById('pixel-grid');
        grid.innerHTML = '';
        const drawCell = (cell) => { cell.style.backgroundColor = this.drawingColor; };
        for(let i=0; i<32*32; i++) {
            const c = document.createElement('div');
            c.className = 'pixel-cell';
            c.onmousedown = () => { this.isDrawing=true; drawCell(c); };
            c.onmouseover = () => { if(this.isDrawing) drawCell(c); };
            c.ontouchstart = (e) => { e.preventDefault(); this.isDrawing=true; drawCell(c); };
            c.ontouchmove = (e) => {
                e.preventDefault();
                const t = e.touches[0];
                const target = document.elementFromPoint(t.clientX, t.clientY);
                if(target && target.classList.contains('pixel-cell')) drawCell(target);
            };
            grid.appendChild(c);
        }
        window.addEventListener('mouseup', () => this.isDrawing=false);
        window.addEventListener('touchend', () => this.isDrawing=false);

        const palette = document.getElementById('color-palette');
        this.editorColors.forEach(col => {
            const s = document.createElement('div');
            s.className = 'color-swatch';
            if(col==='transparent') s.style.background = "repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 10px 10px";
            else s.style.backgroundColor = col;
            s.onclick = () => {
                this.drawingColor = col;
                document.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('active'));
                s.classList.add('active');
            };
            palette.appendChild(s);
        });
        document.getElementById('paddle-file-input').onchange = (e) => {
            const f = e.target.files[0]; if(!f) return;
            const r = new FileReader();
            r.onload = (ev) => { try { this.loadPaddleFromData(JSON.parse(ev.target.result)); } catch(err) { alert("読込失敗"); } };
            r.readAsText(f); e.target.value = '';
        };
        document.getElementById('paddle-webp-input').onchange = (e) => {
            const f = e.target.files[0]; if(!f) return;
            const r = new FileReader();
            r.onload = (ev) => {
                const img = new Image();
                img.onload = () => this.loadPaddleFromImage(img);
                img.src = ev.target.result;
            };
            r.readAsDataURL(f); e.target.value = '';
        };
    },

    savePaddleWebP() {
        const name = prompt("保存名を入力してください", "my-paddle");
        if(!name) return;
        const temp = document.createElement('canvas');
        temp.width = 32; temp.height = 32;
        const tctx = temp.getContext('2d');
        const cells = document.querySelectorAll('.pixel-cell');
        cells.forEach((c, i) => {
            const bg = c.style.backgroundColor;
            if(bg && bg !== 'transparent' && bg !== '' && bg !== 'rgba(0, 0, 0, 0)') {
                tctx.fillStyle = bg;
                tctx.fillRect(i % 32, Math.floor(i / 32), 1, 1);
            }
        });
        const link = document.createElement('a');
        link.href = temp.toDataURL('image/webp');
        link.download = `${name}.webp`;
        link.click();
    },

    loadPaddleFromImage(img) {
        const temp = document.createElement('canvas');
        temp.width = 32; temp.height = 32;
        const tctx = temp.getContext('2d');
        tctx.imageSmoothingEnabled = false;
        tctx.drawImage(img, 0, 0, 32, 32);
        const imageData = tctx.getImageData(0, 0, 32, 32).data;
        const cells = document.querySelectorAll('.pixel-cell');
        for (let i = 0; i < 1024; i++) {
            const r = imageData[i * 4], g = imageData[i * 4 + 1], b = imageData[i * 4 + 2], a = imageData[i * 4 + 3];
            cells[i].style.backgroundColor = (a < 10) ? 'transparent' : `rgb(${r},${g},${b})`;
        }
        alert("画像からデザインを復元しました！");
    },

    openEditor() { document.getElementById('screen-editor').classList.add('active'); },
    closeEditor() { document.getElementById('screen-editor').classList.remove('active'); },
    clearEditor() { if(confirm("全消去しますか？")) document.querySelectorAll('.pixel-cell').forEach(c => c.style.backgroundColor = 'transparent'); },

    savePaddleJSON() {
        const name = prompt("保存名", "my-paddle"); if(!name) return;
        const pixels = Array.from(document.querySelectorAll('.pixel-cell')).map(c => c.style.backgroundColor || 'transparent');
        const blob = new Blob([JSON.stringify({name, pixels})], {type: "application/json"});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name}.json`; a.click();
    },

    loadPaddleFromData(data) {
        const cells = document.querySelectorAll('.pixel-cell');
        if(data.pixels.length !== cells.length) return alert("データ不整合");
        data.pixels.forEach((c, i) => cells[i].style.backgroundColor = c);
        alert("読込完了: " + data.name);
    },

    applyCustomPaddle() {
        const temp = document.createElement('canvas'); temp.width = 32; temp.height = 32;
        const tctx = temp.getContext('2d');
        const cells = document.querySelectorAll('.pixel-cell');
        let minX=32, maxX=-1, minY=32, maxY=-1, hasP=false;
        cells.forEach((c, i) => {
            const bg = c.style.backgroundColor;
            if(bg && bg !== 'transparent' && bg !== '' && bg !== 'rgba(0, 0, 0, 0)') {
                const x = i % 32, y = Math.floor(i / 32);
                tctx.fillStyle = bg; tctx.fillRect(x, y, 1, 1);
                minX = Math.min(minX, x); maxX = Math.max(maxX, x);
                minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                hasP = true;
            }
        });
        if(!hasP) return alert("空です");
        const scale = 100/32;
        const img = new Image(); img.src = temp.toDataURL();
        PADDLE_SHAPES['custom'].img = img;
        PADDLE_SHAPES['custom'].v = [[(minX-16)*scale, (minY-16)*scale], [(maxX+1-16)*scale, (minY-16)*scale], [(maxX+1-16)*scale, (maxY+1-16)*scale], [(minX-16)*scale, (maxY+1-16)*scale]];
        CURRENT_SHAPE = 'custom';
        this.closeEditor(); this.closeSettings();
        alert("適用しました！");
    },

    setupSettingsUI() {
        const container = document.getElementById('shape-selector');
        container.innerHTML = '';
        Object.keys(PADDLE_SHAPES).forEach(key => {
            const btn = document.createElement('div');
            btn.className = `shape-btn ${key === CURRENT_SHAPE ? 'selected' : ''}`;
            btn.innerText = PADDLE_SHAPES[key].name;
            btn.onclick = () => { CURRENT_SHAPE = key; this.setupSettingsUI(); };
            container.appendChild(btn);
        });
    },

    openSettings() { document.getElementById('screen-settings').classList.add('active'); },
    closeSettings() { document.getElementById('screen-settings').classList.remove('active'); },

    start(mode) {
        AudioSys.init(); this.mode = mode; this.state = 'playing'; this.resetStats();
        
        // 再戦用フラグのリセット
        this.rematchMe = false;
        this.rematchOpp = false;
        document.getElementById('rematch-msg').innerText = '';
        // モードに応じてボタンテキストを切り替え
        document.getElementById('btn-retry').innerText = (this.mode.includes('online')) ? '再戦を申し込む' : 'リトライ';
        document.getElementById('btn-retry').disabled = false;

        document.querySelectorAll('.screen').forEach(e => e.classList.remove('active'));
        document.getElementById('screen-game').classList.add('active');
        document.getElementById('overlay').classList.remove('visible');
        
        const isVS = (mode === 'local-vs' || mode === 'online-host' || mode === 'online-guest');
        document.getElementById('hud-center').style.display = isVS ? 'block' : 'none';
        document.getElementById('hud-center').innerText = (mode === 'online-guest') ? 'GUEST (P2)' : (mode === 'online-host') ? 'HOST (P1)' : 'VS MODE';
        document.getElementById('btn-mobile-charge').style.display = (mode === 'online-guest') ? 'block' : null;

        this.p1 = new Paddle(CFG.width/2, CFG.height - 80);
        this.ball = new Ball(CFG.width/2, CFG.height - 150); this.ball.launch(-1);
        
        if(isVS) {
            this.p2 = new Paddle(CFG.width/2, 80); 
            this.ball.y = CFG.height/2; 
            this.setupVSLevel();
        } else {
            this.p2 = null; 
            this.setupLevel(1);
        }
    },

    resetStats() { this.score=0; this.startTime=Date.now(); this.blocksBroken=0; this.smashCount=0; this.stage=1; this.endlessTicker=0; this.endlessSpeed=1; },
    
    setupLevel(lvl) {
        this.blocks = []; const rows=4+Math.min(lvl,6), cols=8, bw=60, bh=25, ox=(CFG.width-(cols*65))/2;
        for(let r=0; r<rows; r++) for(let c=0; c<cols; c++) this.blocks.push(new Block(ox+c*65, 60+r*30, bw, bh, 1+Math.floor(lvl/3)));
    },
    
    setupVSLevel() { 
        this.blocks = []; 
    },

    loop(timestamp) {
        if(this.state === 'playing') {
            if(this.mode === 'online-guest') {
                this.updateGuest();
            } else {
                this.update(); 
                if(this.mode === 'online-host') this.broadcastState();
            }
        }
        this.draw();
        requestAnimationFrame((t) => this.loop(t));
    },

    updateGuest() {
        const myInput = Input.getLocalInput();
        Network.sendInput(myInput);
    },

    syncState(data) {
        if(this.p1) {
            this.p1.x = data.p1.x; this.p1.y = data.p1.y; this.p1.angle = data.p1.angle;
            this.p1.charge = data.p1.c; this.p1.isCharging = data.p1.ic;
        }
        if(this.p2) {
            this.p2.x = data.p2.x; this.p2.y = data.p2.y; this.p2.angle = data.p2.angle;
            this.p2.charge = data.p2.c; this.p2.isCharging = data.p2.ic;
        }
        if(this.ball) {
            this.ball.x = data.b.x; this.ball.y = data.b.y; 
            this.ball.power = data.b.p;
        }
        this.score = data.s;
        
        if(data.bl && data.bl.length === this.blocks.length) {
            for(let i=0; i<this.blocks.length; i++) this.blocks[i].hp = data.bl[i];
        } else if (data.bl) {
             this.blocks = data.bl.map(b => new Block(b.x, b.y, b.w, b.h, b.hp));
        }

        if(data.over) this.gameOver(data.overMsg);
    },

    broadcastState() {
        const state = {
            p1: { x:this.p1.x, y:this.p1.y, angle:this.p1.angle, c:this.p1.charge, ic:this.p1.isCharging },
            p2: { x:this.p2.x, y:this.p2.y, angle:this.p2.angle, c:this.p2.charge, ic:this.p2.isCharging },
            b: { x:this.ball.x, y:this.ball.y, p:this.ball.power },
            s: this.score,
            bl: this.blocks.map(b => ({x:b.x, y:b.y, w:b.w, h:b.h, hp:b.hp})), 
            over: (this.state === 'over'),
            overMsg: document.getElementById('overlay-title').innerText
        };
        Network.sendState(state);
    },

    update() {
        if(this.p1) this.p1.update(Input.getLocalInput());
        
        if(this.p2) {
            if(this.mode === 'local-vs') {
                this.p2.update(Input.getP2Local());
            } else if (this.mode === 'online-host') {
                this.p2.update(Network.inputData);
            }
        }

        if(this.ball) {
            this.ball.update();
            if(this.ball.x < 0 || this.ball.x > CFG.width) { this.ball.vx *= -1; this.ball.x = this.ball.x < 0 ? 5 : CFG.width-5; }
            
            if(this.mode === 'local-vs' || this.mode === 'online-host') {
                if(this.ball.y < 0) this.gameOver('P1 (HOST) 勝利！');
                if(this.ball.y > CFG.height) this.gameOver('P2 (GUEST) 勝利！');
            } else {
                if(this.ball.y < 0) { this.ball.y = 8; this.ball.vy = Math.abs(this.ball.vy); this.ball.vx += (Math.random()-0.5); }
                if(this.ball.y > CFG.height) this.gameOver('GAME OVER');
            }

            [this.p1, this.p2].forEach(p => {
                if(!p) return;
                const dx = this.ball.x - p.x, dy = this.ball.y - p.y;
                if(dx*dx + dy*dy > CFG.paddleNearDistSq) return;

                if(p.shapeData.type === 'circle') {
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    const minDist = p.shapeData.r + this.ball.r;
                    if(dist < minDist) {
                        const nx = dx/dist, ny = dy/dist;
                        const pen = minDist - dist;
                        this.ball.x += nx * pen;
                        this.ball.y += ny * pen;
                        this.resolvePaddleHit(p, nx, ny);
                    }
                } else {
                    const v = p.getWorldVertices(); if(!v) return;
                    for(let i=0; i < (p.shapeData.type==='chain'?v.length-1:v.length); i++) {
                        const p1 = v[i], p2 = v[(i+1)%v.length];
                        const ex = p2.x-p1.x, ey = p2.y-p1.y, len2 = ex*ex+ey*ey;
                        let t = Math.max(0, Math.min(1, ((this.ball.x-p1.x)*ex + (this.ball.y-p1.y)*ey)/len2));
                        const cx = p1.x+t*ex, cy = p1.y+t*ey, d2 = (this.ball.x-cx)**2 + (this.ball.y-cy)**2;
                        
                        if(d2 < this.ball.r**2) {
                            const d = Math.sqrt(d2) || 1;
                            const nx = (this.ball.x - cx) / d;
                            const ny = (this.ball.y - cy) / d;
                            const pen = this.ball.r - d;
                            this.ball.x += nx * pen;
                            this.ball.y += ny * pen;
                            this.resolvePaddleHit(p, nx, ny);
                            break;
                        }
                    }
                }
            });
            for(let i=this.blocks.length-1; i>=0; i--) {
                const b = this.blocks[i];
                if(this.ball.x > b.x && this.ball.x < b.x+b.w && this.ball.y > b.y && this.ball.y < b.y+b.h) {
                    b.hp -= (this.ball.power > 0 ? 10 : 1); AudioSys.playHit();
                    if(this.ball.power <= 0) this.ball.vy *= -1;
                    if(b.hp <= 0) { this.blocks.splice(i,1); this.blocksBroken++; if(this.ball.power > 0) AudioSys.playExplosion(); }
                    break;
                }
            }
        }
        if(this.mode === 'normal' && this.blocks.length === 0) { this.stage++; this.setupLevel(this.stage); this.ball.launch(); }
        if(this.mode === 'endless') {
            this.endlessTicker++; this.endlessSpeed = 1 + (Date.now()-this.startTime)/20000;
            if(this.endlessTicker > (600/this.endlessSpeed)) { this.endlessTicker=0; this.shiftBlocksDown(); }
        }
        this.score = (this.blocksBroken*100) + (this.smashCount*500) + Math.floor((Date.now()-this.startTime)/1000)*10;
        document.getElementById('hud-right').innerText = `SCORE: ${this.score}`;
        if(this.mode !== 'online-guest' && this.mode !== 'online-host') {
             document.getElementById('hud-left').innerText = (this.mode==='endless') ? 'SURVIVAL' : `STAGE ${this.stage}`;
        }
    },

    resolvePaddleHit(p, nx, ny) {
        if(Math.abs(p.spin) > 0.1) { this.ball.power = 60; this.ball.vx *= 1.6; this.ball.vy *= 1.6; this.smashCount++; AudioSys.playHit(); }
        const dot = this.ball.vx*nx + this.ball.vy*ny;
        this.ball.vx = (this.ball.vx - 2*dot*nx) + (Math.random()-0.5);
        this.ball.vy = (this.ball.vy - 2*dot*ny) + (Math.random()-0.5);
    },

    shiftBlocksDown() {
        this.blocks.forEach(b => b.y += 30);
        if(this.p1 && this.blocks.some(b => b.y > this.p1.y - 30)) return this.gameOver('防衛失敗...');
        const ox = (CFG.width - 520)/2;
        for(let c=0; c<8; c++) if(Math.random() > 0.4) this.blocks.push(new Block(ox + c*65, 50, 60, 25, 1));
    },

    draw() {
        this.ctx.clearRect(0,0,CFG.width,CFG.height);
        if(!this.p1 || !this.ball) return;
        this.blocks.forEach(b => b.draw(this.ctx));
        this.p1.draw(this.ctx); if(this.p2) this.p2.draw(this.ctx);
        this.ball.draw(this.ctx);
    },

    gameOver(msg) {
        this.state = 'over'; const d = ((Date.now()-this.startTime)/1000).toFixed(1);
        document.getElementById('overlay').classList.add('visible');
        document.getElementById('overlay-title').innerText = msg;
        document.getElementById('overlay-stats').innerHTML = `スコア: ${this.score}<br>生存時間: ${d}秒<br>破壊数: ${this.blocksBroken}<br>スマッシュ: ${this.smashCount}`;
        
        const btnRetry = document.getElementById('btn-retry');
        if(this.mode.includes('online')) {
            btnRetry.style.display = 'block';
        } else {
            btnRetry.style.display = 'block'; 
        }
    },

    shareScore() {
        const text = `NEO SMASH: BREAKER [${this.mode.toUpperCase()}] スコア:${this.score} 使用機体:${PADDLE_SHAPES[CURRENT_SHAPE].name} #SmashBreaker`;
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
    },

    retry() { 
        if(this.mode === 'online-host' || this.mode === 'online-guest') {
            this.requestRematch();
        } else {
            this.start(this.mode); 
        }
    },

    requestRematch() {
        this.rematchMe = true;
        document.getElementById('btn-retry').innerText = "承認待ち...";
        document.getElementById('btn-retry').disabled = true;
        document.getElementById('rematch-msg').innerText = "相手の応答を待っています...";
        Network.sendRematchRequest();
        this.checkRematchStart();
    },

    handleRematchRequest() {
        this.rematchOpp = true;
        document.getElementById('rematch-msg').innerText = "相手が再戦を希望しています！";
        this.checkRematchStart();
    },

    checkRematchStart() {
        if (Network.isHost && this.rematchMe && this.rematchOpp) {
            Network.sendRematchStart();
            this.startRematchGame();
        }
    },

    startRematchGame() {
        this.start(this.mode);
    },

    toTitle() { 
        if(Network.peer) { Network.peer.destroy(); Network.peer=null; }
        document.querySelectorAll('.screen').forEach(e=>e.classList.remove('active')); 
        document.getElementById('screen-mode').classList.add('active'); 
        this.p1=null; this.ball=null; 
    }
};

window.onload = () => GameApp.init();