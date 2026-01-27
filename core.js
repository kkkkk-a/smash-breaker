/* core.js - 設定、形状データ、クラス定義 (Japanese) */

const CFG = {
    width: 600, height: 800,
    paddleW: 100, paddleH: 15, ballR: 8,
    maxCharge: 100, speedNormal: 12, speedCharge: 6,
    // Neo Tactics Color Palette
    colors: { 
        p1: '#00f2ff', // Cyan
        p2: '#ff0055', // Magenta
        ball: '#ffffff',
        block: '#00f2ff', // Cyan Base
        text: '#e0e6ed'
    },
    paddleNearDistSq: 15000,
    ballMaxSpeed: 22,
    ballBaseSpeed: 7
};

const PADDLE_SHAPES = {
    'bar': { name: '標準バー', type: 'poly', v: [[-50,-7.5], [50,-7.5], [50,7.5], [-50,7.5]] },
    'square': { name: 'キューブ', type: 'poly', v: [[-25,-25], [25,-25], [25,25], [-25,25]] },
    'rect_l': { name: 'ヘビプレート', type: 'poly', v: [[-60,-20], [60,-20], [60,20], [-60,20]] },
    'trapezoid': { name: 'トラペゾイド', type: 'poly', v: [[-40,-15], [40,-15], [60,15], [-60,15]] },
    'tri_eq': { name: 'デルタ', type: 'poly', v: [[0,-35], [40,30], [-40,30]] },
    'tri_iso': { name: 'ニードル', type: 'poly', v: [[0,-15], [50,15], [-50,15]] },
    'star': { name: 'スター', type: 'poly', v: [[0,-40], [10,-10], [40,-10], [15,10], [25,40], [0,20], [-25,40], [-15,10], [-40,-10], [-10,-10]] },
    'circle': { name: 'オーブ', type: 'circle', r: 35 },
    'bowl_round': { name: 'ディッシュ(円)', type: 'chain', v: [[-40,-20], [-35,0], [-20,15], [0,20], [20,15], [35,0], [40,-20]] },
    'bowl_box': { name: 'ディッシュ(角)', type: 'chain', v: [[-40,-20], [-40,15], [40,15], [40,-20]] },
    'custom': { name: 'カスタム', type: 'custom', img: null, v: [[-50,-10], [50,-10], [50,10], [-50,10]] }
};

let CURRENT_SHAPE = 'bar';

const Input = {
    keys: {}, touch: { x: null, y: null, active: false }, chargeBtn: false,
    init() {
        window.addEventListener('keydown', e => {
            if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code)) e.preventDefault();
            this.keys[e.code] = true;
        });
        window.addEventListener('keyup', e => this.keys[e.code] = false);
        const cvs = document.getElementById('game-canvas');
        const updateTouch = (e) => {
            e.preventDefault();
            const r = cvs.getBoundingClientRect();
            const t = e.touches[0];
            if(t) {
                this.touch.x = (t.clientX - r.left) * (CFG.width / r.width);
                this.touch.y = (t.clientY - r.top) * (CFG.height / r.height);
                this.touch.active = true;
            } else this.touch.active = false;
        };
        cvs.addEventListener('touchstart', updateTouch, {passive:false});
        cvs.addEventListener('touchmove', updateTouch, {passive:false});
        cvs.addEventListener('touchend', () => this.touch.active = false);
        const btn = document.getElementById('btn-mobile-charge');
        btn.addEventListener('touchstart', e => { e.preventDefault(); this.chargeBtn = true; });
        btn.addEventListener('touchend', e => { e.preventDefault(); this.chargeBtn = false; });
    },
    getLocalInput() {
        const i = { m: 0, r: 0, c: false };
        if(this.keys['ArrowLeft'] || this.keys['KeyA']) i.m = -1;
        if(this.keys['ArrowRight'] || this.keys['KeyD']) i.m = 1;
        if(this.keys['ArrowUp'] || this.keys['KeyW']) i.r = 1;
        if(this.keys['ArrowDown'] || this.keys['KeyS']) i.r = -1;
        if(this.keys['ShiftRight'] || this.keys['ShiftLeft'] || this.keys['Enter'] || this.keys['Space'] || this.chargeBtn) i.c = true;
        if(this.touch.active && i.m === 0) {
            if(this.touch.x < CFG.width/2 - 50) i.m = -1;
            else if(this.touch.x > CFG.width/2 + 50) i.m = 1;
        }
        return i;
    },
    getP2Local() {
        const i = { m: 0, r: 0, c: false };
        if(this.keys['KeyA']) i.m = -1; if(this.keys['KeyD']) i.m = 1;
        if(this.keys['KeyW']) i.r = 1; if(this.keys['KeyS']) i.r = -1;
        if(this.keys['ShiftLeft'] || this.keys['Space']) i.c = true;
        return i;
    }
};

class Paddle {
    constructor(x, y) {
        this.x = x; this.y = y; this.angle = 0; this.charge = 0; this.spin = 0;
        this.spinDir = 1; this.isCharging = false;
        this.shapeId = CURRENT_SHAPE;
        this.shapeData = PADDLE_SHAPES[this.shapeId];
        this.visible = true;
        this.baseColor = (y > CFG.height/2) ? CFG.colors.p1 : CFG.colors.p2;
    }
    update(input) {
        if(input.r !== 0) this.spinDir = input.r;
        if(input.c) {
            this.isCharging = true;
            this.charge = Math.min(this.charge + 1.5, CFG.maxCharge);
            if(Math.floor(this.charge) % 15 === 0) AudioSys.playCharge();
        } else {
            if(this.isCharging) {
                this.spin = this.spinDir * (0.5 + (this.charge / CFG.maxCharge));
                AudioSys.playSmash();
                setTimeout(() => { this.charge = 0; }, 500);
            }
            this.isCharging = false;
        }
        if(Math.abs(this.spin) > 0.01) { this.angle += this.spin; this.spin *= 0.92; }
        else if(!this.isCharging && input.r) this.angle += input.r * 0.05;

        if(input.m) {
            const s = this.isCharging ? CFG.speedCharge : CFG.speedNormal;
            this.x = Math.max(50, Math.min(CFG.width - 50, this.x + input.m * s));
        }
    }
    getWorldVertices() {
        if (this.shapeData.type === 'circle') return null;
        const cos = Math.cos(this.angle), sin = Math.sin(this.angle);
        return this.shapeData.v.map(pt => ({
            x: (pt[0] * cos - pt[1] * sin) + this.x,
            y: (pt[0] * sin + pt[1] * cos) + this.y
        }));
    }
    draw(ctx) {
        if(!this.visible) return;
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
        
        const glowColor = this.isCharging ? '#ffffff' : this.baseColor;
        ctx.shadowBlur = this.isCharging ? 20 : 10;
        ctx.shadowColor = glowColor;
        
        const color = this.isCharging ? `hsl(${180 + this.charge}, 100%, 70%)` : this.baseColor;
        ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;

        if (this.shapeData.type === 'custom' && this.shapeData.img) {
            ctx.drawImage(this.shapeData.img, -50, -50, 100, 100);
            if (this.isCharging) {
                ctx.globalCompositeOperation = 'source-atop';
                ctx.fillStyle = `hsla(${180 + this.charge}, 100%, 50%, 0.5)`;
                ctx.fillRect(-50, -50, 100, 100);
                ctx.globalCompositeOperation = 'source-over';
            }
        } else if (this.shapeData.type === 'circle') {
            ctx.beginPath(); ctx.arc(0, 0, this.shapeData.r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
        } else {
            ctx.beginPath(); ctx.moveTo(this.shapeData.v[0][0], this.shapeData.v[0][1]);
            for(let i=1; i<this.shapeData.v.length; i++) ctx.lineTo(this.shapeData.v[i][0], this.shapeData.v[i][1]);
            if(this.shapeData.type === 'poly') { ctx.closePath(); ctx.fill(); ctx.stroke(); }
            else { ctx.stroke(); ctx.globalAlpha = 0.3; ctx.fill(); ctx.globalAlpha = 1.0; }
        }
        if(this.isCharging) {
            ctx.shadowBlur = 0;
            ctx.beginPath(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
            ctx.arc(0, 0, 40 * (this.charge/CFG.maxCharge), 0, Math.PI*2); ctx.stroke();
            ctx.fillStyle = '#fff'; const ax = (this.spinDir === 1) ? 20 : -20;
            ctx.beginPath(); ctx.moveTo(ax, -45); ctx.lineTo(ax-5, -55); ctx.lineTo(ax+5, -55); ctx.fill();
        }
        ctx.restore();
    }
}

class Ball {
    constructor(x, y) {
        this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.r = CFG.ballR; this.power = 0; this.baseSpeed = CFG.ballBaseSpeed;
    }
    launch(dirY = -1) {
        const a = (dirY > 0 ? Math.PI/2 : -Math.PI/2) + (Math.random() - 0.5);
        this.vx = Math.cos(a) * this.baseSpeed; this.vy = Math.sin(a) * this.baseSpeed;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        const s = Math.sqrt(this.vx**2 + this.vy**2);
        if (s > CFG.ballMaxSpeed) { this.vx *= (CFG.ballMaxSpeed/s); this.vy *= (CFG.ballMaxSpeed/s); }
        if (this.power > 0) this.power--;
        else if (s > this.baseSpeed) { this.vx *= 0.985; this.vy *= 0.985; }
        if (Math.abs(this.vy) < 0.6) { this.vy = (this.vy >= 0 ? 1 : -1) * 1.5; this.vx += (Math.random()-0.5); }
        this.vx += (Math.random()-0.5) * 0.03; this.vy += (Math.random()-0.5) * 0.03;
    }
    draw(ctx) {
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI*2);
        ctx.fillStyle = this.power > 0 ? CFG.colors.p2 : '#fff'; 
        ctx.shadowBlur = this.power > 0 ? 20 : 10; 
        ctx.shadowColor = ctx.fillStyle;
        ctx.fill(); 
        ctx.shadowBlur = 0;
    }
}

class Block {
    constructor(x,y,w,h,hp) { this.x=x; this.y=y; this.w=w; this.h=h; this.hp=hp; this.max=hp; }
    draw(ctx) {
        const r = this.hp / this.max;
        ctx.fillStyle = `rgba(0, 242, 255, ${0.3 + r*0.5})`;
        ctx.strokeStyle = `rgba(0, 242, 255, ${0.5 + r*0.5})`;
        ctx.shadowBlur = 5; ctx.shadowColor = CFG.colors.p1;
        ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.strokeRect(this.x, this.y, this.w, this.h);
        ctx.shadowBlur = 0;
    }
}