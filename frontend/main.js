'use strict';


const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);


const SceneManager = {
  scenes: {},
  current: null,

  register(name, el) {
    if (!el) { console.warn(`[SceneManager] null element for scene "${name}"`); return; }
    this.scenes[name] = el;
  },

  show(name, duration = 0.6, ease = 'power2.inOut') {
    return new Promise(resolve => {
      const next = this.scenes[name];
      if (!next) { console.warn(`[SceneManager] unknown scene "${name}"`); return resolve(); }

      
      const prev = this.current;
      if (prev && prev !== next) {
        gsap.to(prev, {
          opacity: 0, duration: duration * 0.5, ease,
          onComplete: () => prev.classList.remove('active')
        });
      }

      this.current = next;
      next.classList.add('active');
      gsap.fromTo(next, { opacity: 0 }, { opacity: 1, duration, ease, onComplete: resolve });
    });
  }
};


function normalizePost(raw, idx) {
  const cat = (raw.category || '').toUpperCase();
  const isBlue = cat.includes('SECURITY') || cat.includes('HACKING') || cat.includes('CYBER');
  const type = raw.type || (isBlue ? 'blue' : 'red');
  return {
    id:       raw.id       ?? idx + 1,
    type,
    category: raw.category ?? (type === 'blue' ? 'CYBERSECURITY' : 'GEOPOLITICS'),
    title:    raw.title    ?? 'Untitled',
    excerpt:  raw.excerpt  ?? (raw.content ? raw.content.replace(/<[^>]+>/g,'').slice(0,160) + '…' : ''),
    body:     raw.body     ?? raw.content ?? '',  
    author:   raw.author   ?? 'STAFF',
    date:     raw.date     ?? new Date().toISOString().slice(0,10)
  };
}


const MOCK_POSTS = []; 


const API_BASE = 'https://the-journal.pavlositpro.workers.dev';

async function fetchPosts() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${API_BASE}/api/posts`, {
      method: 'GET',
      mode: 'cors',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    
    if (!Array.isArray(raw)) throw new Error('API returned non-array response');
    console.info(`[JOURNAL] Loaded ${raw.length} posts from Workers API`);
    return raw.map(normalizePost);
  } catch (err) {
    clearTimeout(timer);
    
    throw new Error(`API unreachable: ${err.message}`);
  }
}


class BackgroundParticles {
  constructor(canvas) {
    if (!canvas) return;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.resize();
    this.init();
    window.addEventListener('resize', () => this.resize());
    this.animate();
  }
  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
  init() {
    const count = Math.floor((this.canvas.width * this.canvas.height) / 18000);
    for (let i = 0; i < count; i++) this.particles.push(this._make());
  }
  _make() {
    return {
      x: rand(0, this.canvas.width), y: rand(0, this.canvas.height),
      r: rand(0.3, 1.5), vx: rand(-0.15, 0.15), vy: rand(-0.15, 0.15),
      alpha: rand(0.05, 0.35),
      color: Math.random() > 0.5
        ? `rgba(0,${randInt(150,255)},${randInt(200,255)},`
        : `rgba(${randInt(150,255)},${randInt(50,100)},0,`
    };
  }
  animate() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.particles.forEach(p => {
      p.x = (p.x + p.vx + this.canvas.width)  % this.canvas.width;
      p.y = (p.y + p.vy + this.canvas.height) % this.canvas.height;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      this.ctx.fillStyle = p.color + p.alpha + ')';
      this.ctx.fill();
    });
    requestAnimationFrame(() => this.animate());
  }
}


class IntroParticles {
  constructor(canvas) {
    if (!canvas) return;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    this.running = true;
    this._rb = () => { this.resize(); this.particles = []; this.init(); };
    this._mb = e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; };
    window.addEventListener('resize', this._rb);
    window.addEventListener('mousemove', this._mb);
    this.resize();
    this.init();
    
    requestAnimationFrame(() => this.animate());
  }
  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.cx = this.canvas.width / 2;
    this.cy = this.canvas.height / 2;
  }
  init() {
    for (let i = 0; i < 120; i++) {
      const a = rand(0, Math.PI * 2), r = rand(80, 380);
      this.particles.push({
        x: this.cx + Math.cos(a) * r, y: this.cy + Math.sin(a) * r,
        vx: rand(-0.3, 0.3), vy: rand(-0.3, 0.3),
        r: rand(0.5, 2.5), alpha: rand(0.2, 0.9),
        color: Math.random() > 0.4 ? [0, randInt(200,255), 255] : [255, randInt(50,150), 0],
        pulse: rand(0, Math.PI * 2), pulseSpeed: rand(0.02, 0.06)
      });
    }
  }
  animate() {
    if (!this.running) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    for (let i = 0; i < this.particles.length; i++) {
      for (let j = i + 1; j < this.particles.length; j++) {
        const dx = this.particles[i].x - this.particles[j].x;
        const dy = this.particles[i].y - this.particles[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 80) {
          this.ctx.beginPath();
          this.ctx.moveTo(this.particles[i].x, this.particles[i].y);
          this.ctx.lineTo(this.particles[j].x, this.particles[j].y);
          this.ctx.strokeStyle = `rgba(0,200,255,${(1-dist/80)*0.06})`;
          this.ctx.lineWidth = 0.5;
          this.ctx.stroke();
        }
      }
    }
    this.particles.forEach(p => {
      const mdx = this.mouse.x - p.x, mdy = this.mouse.y - p.y;
      const md = Math.sqrt(mdx*mdx + mdy*mdy) || 1;
      if (md < 120) { p.vx -= (mdx/md)*0.05; p.vy -= (mdy/md)*0.05; }
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.98; p.vy *= 0.98;
      p.pulse += p.pulseSpeed;
      
      p.vx += (this.cx - p.x) * 0.00008;
      p.vy += (this.cy - p.y) * 0.00008;
      const a = p.alpha * (0.7 + 0.3 * Math.sin(p.pulse));
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${a})`;
      this.ctx.fill();
      const g = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r*4);
      g.addColorStop(0, `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${a*0.3})`);
      g.addColorStop(1, 'transparent');
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.r*4, 0, Math.PI * 2);
      this.ctx.fillStyle = g;
      this.ctx.fill();
    });
    requestAnimationFrame(() => this.animate());
  }
  stop() {
    this.running = false;
    window.removeEventListener('resize', this._rb);
    window.removeEventListener('mousemove', this._mb);
  }
}


class SparkEngine {
  constructor(canvas) {
    this._dead = !canvas;
    if (this._dead) return;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sparks = [];
    this.running = false;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    if (this._dead) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
  emit(x, y, count = 6) {
    if (this._dead) return;
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI*2), s = rand(1,5);
      this.sparks.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s,
        life:1, decay:rand(0.03,0.08), r:rand(1,3),
        color: Math.random()>0.5?'#00ffff':'#ffffff' });
    }
  }
  emitElectric(x, y) {
    if (this._dead) return;
    this.emit(x, y, 10);
    for (let i = 0; i < 3; i++) {
      this.sparks.push({ x, y, vx:rand(-8,8), vy:rand(-8,8),
        life:1, decay:0.12, r:rand(0.5,1.5), color:'#ffff00' });
    }
  }
  start() { if (this._dead) return; this.running = true; this.animate(); }
  stop()  { this.running = false; }
  animate() {
    if (!this.running || this._dead) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.sparks = this.sparks.filter(s => s.life > 0.01);
    this.sparks.forEach(s => {
      s.x += s.vx; s.y += s.vy;
      s.vy += 0.1; s.vx *= 0.97; s.vy *= 0.97;
      s.life -= s.decay;
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y, Math.max(0.1, s.r*s.life), 0, Math.PI*2);
      this.ctx.fillStyle = s.color;
      this.ctx.globalAlpha = s.life;
      this.ctx.fill();
      this.ctx.beginPath();
      this.ctx.moveTo(s.x, s.y);
      this.ctx.lineTo(s.x - s.vx*3, s.y - s.vy*3);
      this.ctx.strokeStyle = s.color;
      this.ctx.lineWidth = Math.max(0.1, s.r*0.5*s.life);
      this.ctx.globalAlpha = s.life * 0.5;
      this.ctx.stroke();
    });
    this.ctx.globalAlpha = 1;
    requestAnimationFrame(() => this.animate());
  }
}


class FiberPulseSystem {
  constructor() {
    this.pulses = [];
    this._svg = null;
    this.running = false;
    this.yPositions = [40,70,100,130,160];
    this.colors = ['#ff440088','#0088ff88','#00ff4488','#ff880088','#00bbff88'];
  }
  get svg() {
    
    if (!this._svg) this._svg = document.getElementById('fiber-pulses');
    return this._svg;
  }
  createPulse() {
    if (!this.svg) return;
    const idx = randInt(0, this.yPositions.length-1);
    const y = this.yPositions[idx];
    const el = document.createElementNS('http://www.w3.org/2000/svg','rect');
    el.setAttribute('y', y-4);
    el.setAttribute('width', randInt(20,60));
    el.setAttribute('height', 8);
    el.setAttribute('rx', 3);
    el.setAttribute('fill', this.colors[idx]);
    this.svg.appendChild(el);
    this.pulses.push({ el, x:-60, speed:rand(3,8), done:false });
  }
  start() {
    this.running = true;
    this.interval = setInterval(() => { if (Math.random()>0.3) this.createPulse(); }, 120);
    this.animate();
  }
  stop() { this.running = false; clearInterval(this.interval); }
  animate() {
    if (!this.running) return;
    this.pulses.forEach(p => {
      if (p.done) return;
      p.x += p.speed;
      p.el.setAttribute('x', p.x);
      if (p.x > 850) { p.done=true; p.el.parentNode && p.el.parentNode.removeChild(p.el); }
    });
    this.pulses = this.pulses.filter(p => !p.done);
    requestAnimationFrame(() => this.animate());
  }
}


class ServerLog {
  constructor(el) {
    this.el = el;
    this.lines = [
      '> SIGNAL RECEIVED: PACKET SIZE 4.7KB',
      '> ROUTING TO CPU CLUSTER-\u0394447...',
      '> DECRYPTING PAYLOAD... OK',
      '> INTEGRITY CHECK: SHA-256 \u2713',
      '> CONTENT TYPE: JOURNAL_TRANSMISSION',
      '> DECOMPRESSING DATA STREAMS...',
      '> SPLITTING CHANNELS: RED | BLUE',
      '> ENERGY CONVERSION: 99.97% EFFICIENT',
      '> INITIATING PORTAL GENESIS SEQUENCE...'
    ];
    this.lineIdx = 0; this.charIdx = 0; this.running = false;
  }
  start() { this.running = true; this.tick(); }
  tick() {
    if (!this.running || !this.el) return; // FIX #18
    if (this.lineIdx >= this.lines.length) return;
    const line = this.lines[this.lineIdx];
    if (this.charIdx <= line.length) {
      const prev = this.lines.slice(0,this.lineIdx).map(l=>`<div>${l}</div>`).join('');
      this.el.innerHTML = prev + `<div>${line.slice(0,this.charIdx)}<span style="animation:blink 0.5s step-end infinite">&#9611;</span></div>`;
      this.charIdx++;
      setTimeout(() => this.tick(), 40 + Math.random()*20);
    } else {
      this.lineIdx++; this.charIdx = 0;
      setTimeout(() => this.tick(), 200);
    }
  }
}


class ExplosionEngine {
  constructor(canvas) {
    this._dead = !canvas;
    if (this._dead) return;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.shockwaves = [];
    this.phase = 'idle';
    this.time = 0;
    this._rafId = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    if (this._dead) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.cx = this.canvas.width/2;
    this.cy = this.canvas.height/2;
  }
  explode() {
    if (this._dead) return;
    this.phase = 'explode'; this.time = 0; this.particles = [];
    for (let i = 0; i < 400; i++) {
      const a = rand(0,Math.PI*2), s = rand(1,18), ir = Math.random()>0.5;
      this.particles.push({
        x:this.cx, y:this.cy,
        vx:Math.cos(a)*s, vy:Math.sin(a)*s,
        life:1, decay:rand(0.005,0.02), r:rand(1,5),
        isRed:ir, color:ir?[255,randInt(50,150),0]:[0,randInt(150,255),255],
        trail:[], glow:rand(2,8)
      });
    }
    this.shockwaves = [
      { r:0, maxR:Math.max(this.canvas.width,this.canvas.height)*0.8, life:1, delay:0 },
      { r:0, maxR:Math.max(this.canvas.width,this.canvas.height)*0.5, life:1, delay:0.3 }
    ];
    if (!this._rafId) this._tick();
  }
  startStreams() {
    if (this._dead) return;
    this.phase = 'streams';
    this.particles.forEach(p => {
      const ta = p.isRed ? Math.PI+rand(-0.4,0.4) : rand(-0.4,0.4);
      p.vx = Math.cos(ta)*rand(4,10);
      p.vy = Math.sin(ta)*rand(-2,2);
      p.decay = rand(0.002,0.01);
    });
  }
  _tick() {
    if (this.phase==='idle'||this._dead) { this._rafId=null; return; }
    this._rafId = requestAnimationFrame(() => this._tick());
    const c = this.ctx;
    c.fillStyle = 'rgba(2,4,9,0.15)';
    c.fillRect(0,0,this.canvas.width,this.canvas.height);
    this.time++;
    
    this.shockwaves.forEach(sw => {
      if (sw.delay>0) { sw.delay-=0.016; return; }
      sw.r += (sw.maxR-sw.r)*0.08; sw.life -= 0.025;
      if (sw.life>0) {
        c.beginPath(); c.arc(this.cx,this.cy,sw.r,0,Math.PI*2);
        c.strokeStyle = `rgba(255,255,255,${sw.life*0.5})`; c.lineWidth=2; c.stroke();
      }
    });
    
    if (this.phase==='explode'||this.time<120) {
      const gs = 80+Math.sin(this.time*0.1)*20;
      const grd = c.createRadialGradient(this.cx,this.cy,0,this.cx,this.cy,gs);
      grd.addColorStop(0,'rgba(255,255,255,0.8)');
      grd.addColorStop(0.3,'rgba(100,200,255,0.3)');
      grd.addColorStop(1,'transparent');
      c.beginPath(); c.arc(this.cx,this.cy,gs,0,Math.PI*2);
      c.fillStyle=grd; c.fill();
    }
    
    this.particles = this.particles.filter(p=>p.life>0.01);
    this.particles.forEach(p => {
      p.trail.push({x:p.x,y:p.y}); if(p.trail.length>8) p.trail.shift();
      p.x+=p.vx; p.y+=p.vy; p.vx*=0.97; p.vy*=0.97; p.life-=p.decay;
      const [r,g,b]=p.color;
      for(let i=0;i<p.trail.length-1;i++){
        const t=i/p.trail.length;
        c.beginPath(); c.moveTo(p.trail[i].x,p.trail[i].y); c.lineTo(p.trail[i+1].x,p.trail[i+1].y);
        c.strokeStyle=`rgba(${r},${g},${b},${t*p.life*0.5})`; c.lineWidth=p.r*t*0.8; c.stroke();
      }
      const grd=c.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*p.glow);
      grd.addColorStop(0,`rgba(${r},${g},${b},${p.life*0.6})`);
      grd.addColorStop(1,'transparent');
      c.beginPath(); c.arc(p.x,p.y,p.r*p.glow,0,Math.PI*2); c.fillStyle=grd; c.fill();
      c.beginPath(); c.arc(p.x,p.y,Math.max(0.1,p.r*p.life),0,Math.PI*2);
      c.fillStyle=`rgba(${r},${g},${b},${p.life})`; c.fill();
    });
    
    if (this.phase==='streams') {
      const rg=c.createRadialGradient(this.canvas.width*0.15,this.cy,0,this.canvas.width*0.15,this.cy,this.canvas.width*0.3);
      rg.addColorStop(0,'rgba(255,50,0,0.08)'); rg.addColorStop(1,'transparent');
      c.fillStyle=rg; c.fillRect(0,0,this.canvas.width*0.5,this.canvas.height);
      const bg=c.createRadialGradient(this.canvas.width*0.85,this.cy,0,this.canvas.width*0.85,this.cy,this.canvas.width*0.3);
      bg.addColorStop(0,'rgba(0,150,255,0.08)'); bg.addColorStop(1,'transparent');
      c.fillStyle=bg; c.fillRect(this.canvas.width*0.5,0,this.canvas.width,this.canvas.height);
    }
  }
}


class MatrixRain {
  constructor(canvas) {
    this._dead = !canvas;
    if (this._dead) return;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cols = [];
    this.running = false;
    this.chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<>{}[]|\\/?!@#$%^&*';
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }
  resize() {
    if (this._dead) return;
    const p = this.canvas.parentElement;
    this.canvas.width  = p ? p.clientWidth  : 400;
    this.canvas.height = p ? p.clientHeight : 600;
    this.fontSize = 12;
    this.numCols = Math.floor(this.canvas.width/this.fontSize) || 1;
    this.cols = Array(this.numCols).fill(0).map(() => rand(-this.canvas.height, 0));
  }
  start() { if (this._dead) return; this.running=true; this.animate(); }
  stop()  { this.running=false; }
  animate() {
    if (!this.running||this._dead) return;
    this.ctx.fillStyle='rgba(0,2,15,0.05)';
    this.ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
    this.ctx.font=`${this.fontSize}px "Share Tech Mono"`;
    this.cols.forEach((y,i) => {
      const ch=this.chars[Math.floor(Math.random()*this.chars.length)];
      const x=i*this.fontSize, b=Math.random();
      this.ctx.fillStyle = b>0.95?'#ffffff': b>0.7?'#00ffff':`rgba(0,${randInt(100,200)},${randInt(180,255)},${rand(0.3,0.8)})`;
      this.ctx.fillText(ch,x,y);
      this.cols[i] = y > this.canvas.height+rand(0,100) ? -this.fontSize : y+this.fontSize;
    });
    setTimeout(() => requestAnimationFrame(() => this.animate()), 50);
  }
}


class RedPortalCanvas {
  constructor(canvas) {
    this._dead = !canvas;
    if (this._dead) return;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dots = [];
    this.running = false;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }
  resize() {
    if (this._dead) return;
    const p = this.canvas.parentElement;
    this.canvas.width  = p ? p.clientWidth  : 600;
    this.canvas.height = p ? p.clientHeight : 600;
    this.dots = Array.from({length:60}, () => ({
      x:rand(0,this.canvas.width), y:rand(0,this.canvas.height),
      r:rand(1,3), alpha:rand(0.1,0.5), speed:rand(0.01,0.05), angle:rand(0,Math.PI*2)
    }));
  }
  start() { if (this._dead) return; this.running=true; this.animate(); }
  animate() {
    if (!this.running||this._dead) return;
    this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    this.ctx.strokeStyle='rgba(255,51,0,0.06)'; this.ctx.lineWidth=0.5;
    for(let x=0;x<this.canvas.width;x+=40){ this.ctx.beginPath(); this.ctx.moveTo(x,0); this.ctx.lineTo(x,this.canvas.height); this.ctx.stroke(); }
    for(let y=0;y<this.canvas.height;y+=40){ this.ctx.beginPath(); this.ctx.moveTo(0,y); this.ctx.lineTo(this.canvas.width,y); this.ctx.stroke(); }
    this.dots.forEach(d => {
      d.angle+=d.speed; d.x+=Math.cos(d.angle)*0.3; d.y+=Math.sin(d.angle)*0.3;
      if(d.x<0) d.x=this.canvas.width; if(d.x>this.canvas.width) d.x=0;
      if(d.y<0) d.y=this.canvas.height; if(d.y>this.canvas.height) d.y=0;
      this.ctx.beginPath(); this.ctx.arc(d.x,d.y,d.r,0,Math.PI*2);
      this.ctx.fillStyle=`rgba(255,100,0,${d.alpha})`; this.ctx.fill();
    });
    requestAnimationFrame(() => this.animate());
  }
}


function animateFinanceGraph() {
  const line = document.getElementById('graph-line');
  const fill = document.getElementById('graph-fill');
  if (!line||!fill) return;
  const W=400, H=80;
  const gen = () => { const pts=[]; let y=40; for(let x=0;x<=W;x+=20){ y=clamp(y+rand(-12,12),5,75); pts.push(`${x},${y}`); } return pts; };
  const draw = pts => {
    line.setAttribute('points', pts.join(' '));
    fill.setAttribute('points', [...pts,`${W},${H}`,`0,${H}`].join(' '));
  };
  draw(gen());
  
  setInterval(() => draw(gen()), 2000);
}


function initCursorSparks() {
  let last = 0;
  document.addEventListener('mousemove', e => {
    const now = Date.now();
    if (now-last<60 || Math.random()>0.4) return;
    last = now;
    const s = document.createElement('div');
    s.className = 'cursor-spark';
    s.style.left = e.clientX+'px'; s.style.top = e.clientY+'px';
    s.style.setProperty('--dx', rand(-30,30)+'px');
    s.style.setProperty('--dy', rand(-30,30)+'px');
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 600);
  });
}


function renderBlogCards(rawPosts) {
  const posts = rawPosts.map(normalizePost);
  const redBox   = document.getElementById('red-cards');
  const blueBox  = document.getElementById('blue-cards');
  const redCnt   = document.getElementById('red-count');
  const blueCnt  = document.getElementById('blue-count');
  const overlay  = document.getElementById('loading-overlay');

  if (!redBox||!blueBox) { console.warn('[JOURNAL] Card containers missing'); return; }

  const reds  = posts.filter(p=>p.type==='red');
  const blues = posts.filter(p=>p.type==='blue');

  if (redCnt)  redCnt.textContent  = reds.length;
  if (blueCnt) blueCnt.textContent = blues.length;

  redBox.innerHTML  = '';
  blueBox.innerHTML = '';

  
  if (reds.length === 0) {
    redBox.innerHTML = '<div class="no-posts-msg">NO TRANSMISSIONS YET</div>';
  }
  if (blues.length === 0) {
    blueBox.innerHTML = '<div class="no-posts-msg">NO TRANSMISSIONS YET</div>';
  }

  reds.forEach((p,i)  => { const c=createCard(p,'red');  redBox.appendChild(c);  setTimeout(()=>c.classList.add('visible'), i*120+100); });
  blues.forEach((p,i) => { const c=createCard(p,'blue'); blueBox.appendChild(c); setTimeout(()=>c.classList.add('visible'), i*120+100); });

  if (overlay) setTimeout(() => overlay.classList.add('hidden'), 300);
}

function createCard(post, type) {
  const card = document.createElement('div');
  card.className = `blog-card ${type}-card`;
  card.innerHTML = `
    <div class="card-category-tag">${post.category}</div>
    <div class="card-title">${post.title}</div>
    <div class="card-excerpt">${post.excerpt}</div>
    <div class="card-footer">
      <span class="card-author">BY ${post.author}${post.date?' &middot; '+post.date:''}</span>
      <button class="card-read-btn">READ &rarr;</button>
    </div>`;
  
  const launch = () => dragonEyeGate(post, type);
  card.addEventListener('click', launch);
  card.querySelector('.card-read-btn').addEventListener('click', e => { e.stopPropagation(); launch(); });
  return card;
}




class DragonEye {
  constructor(color) {
    this.color = color;         
    this.phase = 'idle';        
    this.openT = 0;             
    this.clickZone = null;      
    this.onPass = null;         
    this.onAbort = null;        
    this.raf = null;
    this.mouseX = window.innerWidth / 2;
    this.mouseY = window.innerHeight / 2;
    this._bound_mm = this._onMouseMove.bind(this);
    this._bound_click = this._onClick.bind(this);
    this._bound_key = this._onKey.bind(this);
    this._particles = [];       
    this._scaleState = 0;       
    this._breathDir = 1;
    this._glowPulse = 0;
    this._lockT = 0;            
    this._shakeX = 0;
    this._flicker = 1;
    this._flickerTimer = 0;
    this._lidsT = 0;            
  }

  
  mount() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'dragon-eye-overlay';
    this.overlay.style.cssText = [
      'position:fixed','inset:0','z-index:5000',
      'background:rgba(0,0,0,0)','display:flex',
      'align-items:center','justify-content:center',
      'pointer-events:all','cursor:none'
    ].join(';');

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;

    
    this.hint = document.createElement('div');
    this.hint.style.cssText = [
      'position:absolute','bottom:14%','left:50%',
      'transform:translateX(-50%)',
      'font-family:"Share Tech Mono",monospace',
      'font-size:clamp(.55rem,.9vw,.8rem)',
      'letter-spacing:.35em','color:rgba(255,255,255,0)',
      'transition:color .8s','pointer-events:none',
      'text-align:center','white-space:nowrap'
    ].join(';');
    this.hint.textContent = 'CLICK THE EYE TO ENTER';

    this.overlay.appendChild(this.canvas);
    this.overlay.appendChild(this.hint);
    document.body.appendChild(this.overlay);

    window.addEventListener('mousemove', this._bound_mm, { passive: true });
    window.addEventListener('click',     this._bound_click);
    window.addEventListener('keydown',   this._bound_key);

    
    const isPrimary = this.color === 'red';
    for (let i = 0; i < 55; i++) {
      this._particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        vx: (Math.random() - .5) * .6,
        vy: (Math.random() - .5) * .6,
        r: Math.random() * 1.6 + .3,
        life: Math.random(),
        decay: .002 + Math.random() * .004,
        hue: isPrimary ? (Math.random() * 40) : (185 + Math.random() * 40)
      });
    }

    
    this.phase = 'opening';
    this.openT = 0;
    this._raf();
  }

  
  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('mousemove', this._bound_mm);
    window.removeEventListener('click',     this._bound_click);
    window.removeEventListener('keydown',   this._bound_key);
    if (this.overlay && this.overlay.parentNode) {
      
      this.overlay.style.transition = 'opacity .5s';
      this.overlay.style.opacity = '0';
      setTimeout(() => { if (this.overlay.parentNode) this.overlay.parentNode.removeChild(this.overlay); }, 520);
    }
  }

  
  _onMouseMove(e) { this.mouseX = e.clientX; this.mouseY = e.clientY; }
  _onKey(e) { if (e.key === 'Escape') { this.destroy(); if (this.onAbort) this.onAbort(); } }
  _onClick(e) {
    if (this.phase !== 'open') return;
    const z = this.clickZone;
    if (!z) return;
    const dx = e.clientX - z.cx, dy = e.clientY - z.cy;
    if (dx*dx + dy*dy <= z.r*z.r) {
      this.phase = 'clicked';
      this._triggerPass();
    }
  }

  
  _triggerPass() {
    
    this.canvas.style.transition = 'opacity .12s';
    this.canvas.style.opacity = '0';
    setTimeout(() => {
      this.canvas.style.opacity = '1';
      setTimeout(() => {
        this.canvas.style.transition = 'opacity .35s';
        this.canvas.style.opacity = '0';
        setTimeout(() => { this.destroy(); if (this.onPass) this.onPass(); }, 370);
      }, 80);
    }, 120);
  }

  
  _raf() {
    this.raf = requestAnimationFrame(() => {
      this._update();
      this._draw();
      if (this.phase !== 'done') this._raf();
    });
  }

  
  _update() {
    const dt = 1/60;

    
    if (this.phase === 'opening') {
      this.openT = Math.min(1, this.openT + dt / 1.2);
      if (this.openT >= 1) { this.phase = 'open'; this.hint.style.color = 'rgba(255,255,255,.55)'; }
    }
    if (this.phase === 'open') this._lockT += dt;

    
    this._scaleState += dt * this._breathDir * .4;
    if (this._scaleState > 1)  { this._scaleState = 1;  this._breathDir = -1; }
    if (this._scaleState < 0)  { this._scaleState = 0;  this._breathDir =  1; }

    
    this._glowPulse = (this._glowPulse + dt * 1.8) % (Math.PI * 2);

    
    this._shakeX = this.phase === 'open' ? Math.sin(this._lockT * 14) * (Math.random() > .97 ? 3 : 0) : 0;

    
    this._lidsT += dt * .5;

    
    this._flickerTimer -= dt;
    if (this._flickerTimer <= 0) {
      this._flicker = .85 + Math.random() * .15;
      this._flickerTimer = .04 + Math.random() * .12;
    }

    
    this._particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) {
        p.x = Math.random() * this.canvas.width;
        p.y = Math.random() * this.canvas.height;
        p.life = 1;
      }
    });
  }

  
  _draw() {
    const cv = this.canvas;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const cx = W / 2, cy = H / 2;

    
    const dimA = this.openT * .92;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = `rgba(0,0,0,${dimA})`;
    ctx.fillRect(0, 0, W, H);

    if (this.openT < .05) return;

    const isRed = this.color === 'red';
    const C1 = isRed ? '#ff2200' : '#00aaff';
    const C2 = isRed ? '#ff6600' : '#00e5ff';
    const C3 = isRed ? '#880000' : '#003366';
    const C4 = isRed ? '#ff440044' : '#00ccff44';
    const CG = isRed ? '#ff3300' : '#00c8ff'; 

    ctx.save();
    ctx.translate(cx + this._shakeX, cy);
    ctx.globalAlpha = this._flicker;

    
    const eyeScale = this.openT;
    const breathScale = 1 + this._scaleState * .018;
    ctx.scale(eyeScale * breathScale, eyeScale * breathScale);

    
    const EW = Math.min(W, H) * .52;   
    const EH = EW * .34;               

    
    const glowR = EW * .65 + Math.sin(this._glowPulse) * EW * .05;
    const aura  = ctx.createRadialGradient(0, 0, EH * .2, 0, 0, glowR);
    aura.addColorStop(0,   `${CG}22`);
    aura.addColorStop(.4,  `${CG}12`);
    aura.addColorStop(.8,  `${CG}05`);
    aura.addColorStop(1,   `${CG}00`);
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.ellipse(0, 0, glowR, glowR * .55, 0, 0, Math.PI*2); ctx.fill();

    
    const scleraGrad = ctx.createRadialGradient(0, -EH*.15, EH*.1, 0, 0, EW*.42);
    scleraGrad.addColorStop(0, isRed ? '#2a0800' : '#001528');
    scleraGrad.addColorStop(.5, isRed ? '#1a0300' : '#000e1a');
    scleraGrad.addColorStop(1, '#000000');
    ctx.beginPath(); this._eyePath(ctx, EW, EH, 1);
    ctx.fillStyle = scleraGrad;
    ctx.fill();

    
    ctx.save();
    ctx.clip(); 
    this._eyePath(ctx, EW, EH, 1);
    ctx.beginPath(); this._eyePath(ctx, EW, EH, 1); ctx.clip();
    if (isRed) {
      
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const len = EW * (.2 + Math.random() * .22);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a)*EH*.25, Math.sin(a)*EH*.15);
        const mx = Math.cos(a+.3)*len*.55, my = Math.sin(a+.3)*len*.4;
        ctx.bezierCurveTo(mx*.5, my*.5, mx, my, Math.cos(a)*len, Math.sin(a)*len*.7);
        ctx.strokeStyle = `rgba(180,0,0,${.08 + Math.random()*.06})`;
        ctx.lineWidth = .6 + Math.random() * .8;
        ctx.stroke();
      }
    } else {
      
      ctx.strokeStyle = 'rgba(0,180,255,.07)';
      ctx.lineWidth = .8;
      for (let i = 0; i < 12; i++) {
        const x0 = (Math.random() - .5) * EW, y0 = (Math.random() - .5) * EH*.8;
        ctx.beginPath(); ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + (Math.random()-.5)*EW*.4, y0+(Math.random()-.5)*EH*.4); ctx.stroke();
      }
    }
    ctx.restore();

    
    const PR = EH * .72;  
    const irisGrad = ctx.createRadialGradient(0, 0, PR*.05, 0, 0, PR);
    if (isRed) {
      irisGrad.addColorStop(0,   '#ff8800');
      irisGrad.addColorStop(.3,  '#dd2200');
      irisGrad.addColorStop(.65, '#880000');
      irisGrad.addColorStop(1,   '#330000');
    } else {
      irisGrad.addColorStop(0,   '#00ffff');
      irisGrad.addColorStop(.3,  '#0088ff');
      irisGrad.addColorStop(.65, '#003388');
      irisGrad.addColorStop(1,   '#000033');
    }
    ctx.beginPath(); ctx.ellipse(0, 0, PR, PR * .88, 0, 0, Math.PI*2);
    ctx.fillStyle = irisGrad; ctx.fill();

    
    for (let i = 1; i <= 6; i++) {
      const rr = PR * (i/7);
      ctx.beginPath(); ctx.ellipse(0, 0, rr, rr*.88, 0, 0, Math.PI*2);
      ctx.strokeStyle = isRed ? `rgba(255,100,0,${.04+i*.015})` : `rgba(0,180,255,${.04+i*.015})`;
      ctx.lineWidth = .6; ctx.stroke();
    }

    
    for (let i = 0; i < 60; i++) {
      const a = (i/60)*Math.PI*2;
      const r1 = PR * .18, r2 = PR * (.78 + Math.sin(a*7+this._lidsT)*.05);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a)*r1, Math.sin(a)*r1*.88);
      ctx.lineTo(Math.cos(a)*r2, Math.sin(a)*r2*.88);
      ctx.strokeStyle = isRed ? `rgba(255,60,0,${.08+Math.abs(Math.sin(a*3))*.07})` : `rgba(0,200,255,${.06+Math.abs(Math.sin(a*3))*.06})`;
      ctx.lineWidth = .5; ctx.stroke();
    }

    
    const PPR = PR * .4;   

    
    const rawDx = this.mouseX - (W/2 + this._shakeX),
          rawDy = this.mouseY - H/2;
    const maxTrack = PR * .22;
    const trackDist = Math.sqrt(rawDx*rawDx + rawDy*rawDy) || 1;
    const factor = Math.min(trackDist, maxTrack) / trackDist;
    const pupilX = rawDx * factor / (eyeScale * breathScale);
    const pupilY = rawDy * factor / (eyeScale * breathScale);

    
    this.clickZone = {
      cx: W/2 + (pupilX + this._shakeX) * eyeScale * breathScale,
      cy: H/2 + pupilY * eyeScale * breathScale,
      r:  PPR * 1.1 * eyeScale * breathScale
    };

    
    const pupilAura = ctx.createRadialGradient(pupilX, pupilY, 0, pupilX, pupilY, PPR*1.8);
    pupilAura.addColorStop(0, isRed ? 'rgba(255,50,0,.35)' : 'rgba(0,200,255,.3)');
    pupilAura.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath(); ctx.ellipse(pupilX, pupilY, PPR*1.8, PPR*1.6, 0, 0, Math.PI*2);
    ctx.fillStyle = pupilAura; ctx.fill();

    
    const pupilGrad = ctx.createRadialGradient(pupilX - PPR*.2, pupilY - PPR*.2, PPR*.05, pupilX, pupilY, PPR);
    pupilGrad.addColorStop(0, isRed ? '#331100' : '#001133');
    pupilGrad.addColorStop(.6, '#000000');
    pupilGrad.addColorStop(1,  '#000000');
    ctx.beginPath(); ctx.ellipse(pupilX, pupilY, PPR, PPR*.92, 0, 0, Math.PI*2);
    ctx.fillStyle = pupilGrad; ctx.fill();

    
    ctx.beginPath();
    ctx.ellipse(pupilX, pupilY, PPR*.22, PPR*.82, 0, 0, Math.PI*2);
    ctx.fillStyle = '#000'; ctx.fill();

    
    ctx.beginPath(); ctx.ellipse(pupilX - PPR*.3, pupilY - PPR*.3, PPR*.18, PPR*.12, -Math.PI/4, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(pupilX + PPR*.2, pupilY + PPR*.25, PPR*.07, PPR*.05, Math.PI/4, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fill();

    
    if (this.phase === 'open') {
      const ringA = .4 + Math.sin(this._glowPulse * 2) * .3;
      ctx.beginPath(); ctx.ellipse(pupilX, pupilY, PPR*1.15, PPR*1.05, 0, 0, Math.PI*2);
      ctx.strokeStyle = isRed ? `rgba(255,100,0,${ringA})` : `rgba(0,220,255,${ringA})`;
      ctx.lineWidth = 1.5; ctx.stroke();
    }

    
    this._drawLids(ctx, EW, EH, C1, C2, C3, isRed);

    
    ctx.beginPath(); this._eyePath(ctx, EW, EH, 1);
    ctx.strokeStyle = C1;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = CG; ctx.shadowBlur = 22;
    ctx.stroke();
    ctx.shadowBlur = 0;

    
    this._drawLashes(ctx, EW, EH, C1, isRed);

    
    this._drawScales(ctx, EW, EH, C1, C3, isRed);

    ctx.restore(); 

    
    ctx.save();
    this._particles.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fillStyle = `hsla(${p.hue},100%,60%,${p.life * .35})`;
      ctx.fill();
    });
    ctx.restore();

    
    ctx.fillStyle = `rgba(0,0,0,${dimA * .15})`;
    for (let y = 0; y < H; y += 4) { ctx.fillRect(0, y, W, 1); }
  }

  
  _eyePath(ctx, EW, EH, scale=1) {
    const w = EW * scale, h = EH * scale;
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.bezierCurveTo(-w * .6, -h * 1.15, w * .6, -h * 1.15, w, 0);
    ctx.bezierCurveTo(w * .6,   h * 1.15, -w * .6,  h * 1.15, -w, 0);
  }

  
  _drawLids(ctx, EW, EH, C1, C2, C3, isRed) {
    const lidGrad = ctx.createLinearGradient(0, -EH*1.4, 0, EH*1.4);
    if (isRed) {
      lidGrad.addColorStop(0,   '#1a0000');
      lidGrad.addColorStop(.35, '#2a0500');
      lidGrad.addColorStop(.5,  'transparent');
      lidGrad.addColorStop(.65, '#2a0500');
      lidGrad.addColorStop(1,   '#1a0000');
    } else {
      lidGrad.addColorStop(0,   '#000a1a');
      lidGrad.addColorStop(.35, '#001228');
      lidGrad.addColorStop(.5,  'transparent');
      lidGrad.addColorStop(.65, '#001228');
      lidGrad.addColorStop(1,   '#000a1a');
    }
    
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-EW, 0);
    ctx.bezierCurveTo(-EW*.6, -EH*1.15, EW*.6, -EH*1.15, EW, 0);
    ctx.lineTo(EW, -EH*3); ctx.lineTo(-EW, -EH*3); ctx.closePath();
    ctx.fillStyle = isRed ? '#0a0000' : '#00050f';
    ctx.fill();

    
    ctx.beginPath();
    ctx.moveTo(-EW, 0);
    ctx.bezierCurveTo(-EW*.6, -EH*1.15, EW*.6, -EH*1.15, EW, 0);
    ctx.lineTo(EW, -EH*1.2); ctx.lineTo(-EW, -EH*1.2); ctx.closePath();
    ctx.fillStyle = lidGrad; ctx.fill();

    
    ctx.beginPath();
    ctx.moveTo(-EW, 0);
    ctx.bezierCurveTo(-EW*.6, EH*1.15, EW*.6, EH*1.15, EW, 0);
    ctx.lineTo(EW, EH*3); ctx.lineTo(-EW, EH*3); ctx.closePath();
    ctx.fillStyle = isRed ? '#0a0000' : '#00050f';
    ctx.fill();
    ctx.restore();

    
    ctx.save();
    ctx.strokeStyle = isRed ? 'rgba(100,20,0,.3)' : 'rgba(0,60,120,.3)';
    ctx.lineWidth = .8;
    for (let i = 0; i < 8; i++) {
      const t = (i/8 - .5) * 2;
      const x = t * EW * .85;
      const yTop = -EH * (1.02 + Math.abs(t)*.08 + Math.sin(t*3+this._lidsT)*.03);
      ctx.beginPath(); ctx.moveTo(x, yTop); ctx.lineTo(x + (Math.random()-.5)*8, yTop - EH*.18);
      ctx.stroke();
    }
    ctx.restore();
  }

  
  _drawLashes(ctx, EW, EH, C1, isRed) {
    const lashColor = isRed ? '#ff2200' : '#00aaff';
    ctx.save();
    ctx.strokeStyle = lashColor; ctx.shadowColor = lashColor; ctx.shadowBlur = 6;
    
    for (let i = 0; i < 14; i++) {
      const t = -1 + (i/13) * 2;
      const ex = t * EW * .98;
      const ey = -(EH * 1.1) * Math.sqrt(1 - t*t*.9);
      const angle = Math.atan2(-ey, ex) + Math.PI*.5 + (Math.random()-.5)*.2;
      const len = EH * (.35 + Math.abs(Math.sin(i*1.3))*.3);
      ctx.beginPath(); ctx.moveTo(ex, ey);
      ctx.lineTo(ex + Math.cos(angle)*len, ey + Math.sin(angle)*len);
      ctx.lineWidth = 1.2 + Math.random()*.8; ctx.stroke();
    }
    
    ctx.shadowBlur = 3;
    for (let i = 0; i < 10; i++) {
      const t = -.8 + (i/9)*1.6;
      const ex = t * EW * .88;
      const ey = (EH * 1.05) * Math.sqrt(1 - t*t*.9);
      const angle = Math.atan2(ey, ex) - Math.PI*.5 + (Math.random()-.5)*.2;
      const len = EH * (.18 + Math.abs(Math.sin(i*1.7))*.15);
      ctx.beginPath(); ctx.moveTo(ex, ey);
      ctx.lineTo(ex + Math.cos(angle)*len, ey + Math.sin(angle)*len);
      ctx.lineWidth = .8; ctx.stroke();
    }
    ctx.restore();
  }

  
  _drawScales(ctx, EW, EH, C1, C3, isRed) {
    const scaleColor = isRed ? 'rgba(180,30,0,' : 'rgba(0,80,160,';
    ctx.save();
    
    [[-1, 0], [1, 0]].forEach(([sx]) => {
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 5; col++) {
          const ox = sx * (EW * .82 + col * EW * .14 * sx);
          const oy = (row - 1) * EH * .45;
          const sr = EW * .055;
          ctx.beginPath();
          ctx.ellipse(ox, oy, sr, sr*.72, 0, 0, Math.PI*2);
          ctx.strokeStyle = `${scaleColor}${.15 - col*.025})`;
          ctx.lineWidth = .8;
          ctx.stroke();
          ctx.fillStyle = `${scaleColor}${.07 - col*.01})`;
          ctx.fill();
        }
      }
    });
    ctx.restore();
  }
}


function dragonEyeGate(post, type) {
  const eye = new DragonEye(type);  
  eye.mount();
  eye.onPass  = () => openModal(post, type);
  eye.onAbort = () => {};  
}


function openModal(post, type) {
  const modal = document.getElementById('post-modal');
  if (!modal) return;
  const color = type==='red' ? '#ff3300' : '#00c8ff';
  
  const bodyText = post.body || post.content || '';
  
  const channel = (post.type || type || 'UNKNOWN').toUpperCase();

  const el = sel => document.getElementById(sel);
  const mc = el('modal-category'), mt=el('modal-title'), mm=el('modal-meta'), mb=el('modal-body');
  const content = modal.querySelector('.modal-content');

  if (mc) { mc.textContent=post.category||type; mc.style.color=color; }
  if (mt)  mt.textContent = post.title||'Untitled';
  if (mm)  mm.textContent = `BY ${post.author||'STAFF'}${post.date?' \u00B7 '+post.date:''} \u00B7 ${channel} CHANNEL`;
  if (mb)  mb.innerHTML = bodyText.split('\n\n').map(p=>`<p style="margin-bottom:16px">${p}</p>`).join('');
  if (content) {
    content.style.borderColor = color+'33';
    content.style.boxShadow = `0 0 80px rgba(0,0,0,0.8), 0 0 40px ${color}15`;
  }
  modal.classList.add('open');
}

function closeModal() {
  const m = document.getElementById('post-modal');
  if (m) m.classList.remove('open');
}


function initNavFilter() {
  $$('.nav-link[data-filter]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      $$('.nav-link').forEach(l=>l.classList.remove('active'));
      link.classList.add('active');
      const f = link.dataset.filter;
      const rp=document.getElementById('red-portal'), bp=document.getElementById('blue-portal'), dv=document.getElementById('center-divider');
      if (!rp||!bp) return;
      
      if (f==='all') {
        gsap.to(rp,{flexGrow:1,duration:0.4}); gsap.to(bp,{flexGrow:1,duration:0.4});
        if(dv) gsap.to(dv,{opacity:1,duration:0.4});
      } else if (f==='red') {
        gsap.to(rp,{flexGrow:3,duration:0.5,ease:'power2.inOut'});
        gsap.to(bp,{flexGrow:0.3,duration:0.5,ease:'power2.inOut'});
        if(dv) gsap.to(dv,{opacity:0.3,duration:0.3});
      } else if (f==='blue') {
        gsap.to(rp,{flexGrow:0.3,duration:0.5,ease:'power2.inOut'});
        gsap.to(bp,{flexGrow:3,duration:0.5,ease:'power2.inOut'});
        if(dv) gsap.to(dv,{opacity:0.3,duration:0.3});
      }
    });
  });
}


function animateElectronCircuit(sparkEngine, onComplete) {
  const electronGroup = document.getElementById('electron-group');
  const currentPulse  = document.getElementById('current-pulse');
  const serverMarker  = document.getElementById('server-marker');
  const wirePathEl    = document.getElementById('wire-path');
  const svgEl         = document.getElementById('circuit-svg');

  if (!electronGroup || !wirePathEl || !svgEl) {
    console.warn('[JOURNAL] Circuit elements missing — skipping electron animation');
    if (typeof onComplete==='function') onComplete();
    return;
  }

  const waypoints = [
    {x:60,y:350},{x:80,y:350},{x:80,y:200},{x:300,y:200},
    {x:500,y:200},{x:500,y:450},{x:700,y:450},{x:700,y:250},
    {x:900,y:250},{x:900,y:500},{x:1100,y:500},{x:1100,y:350},{x:1140,y:350}
  ];

  
  const wireLen = wirePathEl.getTotalLength ? wirePathEl.getTotalLength() : 1500;
  wirePathEl.setAttribute('stroke-dasharray', wireLen);
  wirePathEl.setAttribute('stroke-dashoffset', wireLen);

  if (currentPulse) {
    const pl = currentPulse.getTotalLength ? currentPulse.getTotalLength() : wireLen;
    currentPulse.setAttribute('stroke-dasharray', pl);
    currentPulse.setAttribute('stroke-dashoffset', pl);
  }

  
  electronGroup.setAttribute('transform', `translate(${waypoints[0].x},${waypoints[0].y})`);

  const tl = gsap.timeline({ onComplete });

  
  tl.to(wirePathEl, { attr:{'stroke-dashoffset':0}, duration:4, ease:'none' }, 0);

  if (serverMarker) tl.to(serverMarker, { opacity:1, duration:0.5 }, 0.2);

  
  const hasMP = typeof MotionPathPlugin !== 'undefined' &&
                gsap.plugins && gsap.plugins.motionPath;

  if (hasMP) {
    
    tl.to(electronGroup, {
      duration: 4, ease: 'power1.inOut',
      motionPath: { path:'#wire-path', align:'#wire-path', alignOrigin:[0.5,0.5], autoRotate:false },
      onUpdate: function() {
        if (Math.random() > 0.85) {
          
          try {
            const ctm = svgEl.getScreenCTM();
            if (ctm) {
              const m = electronGroup.transform.baseVal.getItem(0).matrix;
              
              const sx = ctm.a * m.e + ctm.c * m.f + ctm.e;
              const sy = ctm.b * m.e + ctm.d * m.f + ctm.f;
              sparkEngine.emit(sx, sy, 3);
            }
          } catch(e) { /* silently ignore if CTM unavailable */ }
        }
      }
    }, 0.3);
  } else {
    
    console.info('[JOURNAL] MotionPathPlugin unavailable — using waypoint fallback');
    const stepDur = 4 / (waypoints.length - 1);
    waypoints.forEach((wp, i) => {
      if (i===0) return;
      tl.to(electronGroup, {
        attr: { transform:`translate(${wp.x},${wp.y})` },
        duration: stepDur, ease: 'none'
      }, 0.3 + (i-1)*stepDur);
    });
  }

  
  if (currentPulse) {
    tl.to(currentPulse, { attr:{'stroke-dashoffset':0}, opacity:0.7, duration:3.5, ease:'none' }, 0.5);
  }

  
  tl.call(() => {
    if (!serverMarker) return;
    try {
      const ctm = svgEl.getScreenCTM();
      if (ctm) {
        
        const sx = ctm.a*1140 + ctm.c*350 + ctm.e;
        const sy = ctm.b*1140 + ctm.d*350 + ctm.f;
        sparkEngine.emitElectric(sx, sy);
        sparkEngine.emitElectric(sx, sy);
      }
    } catch(e) {}
    gsap.to(serverMarker, { scale:1.3, duration:0.2, yoyo:true, repeat:1, ease:'power2.out', svgOrigin:'1140 350' });
    gsap.to('#circuit-svg', { filter:'drop-shadow(0 0 40px rgba(0,255,68,0.8))', duration:0.3, yoyo:true, repeat:1 });
  }, [], 3.8);

  tl.to('#circuit-svg', { opacity:0.3, duration:0.1, yoyo:true, repeat:3 }, 4.0);

  return tl;
}


async function runCinematicSequence() {

  
  const bgCanvas = document.getElementById('bg-canvas');
  if (bgCanvas) new BackgroundParticles(bgCanvas);

  
  const introCanvas = document.getElementById('particle-canvas');
  const introParticles = introCanvas ? new IntroParticles(introCanvas) : null;

  
  const sparkCanvas = document.getElementById('spark-canvas');
  const sparkEngine = new SparkEngine(sparkCanvas);

  const title = document.getElementById('main-title');
  if (!title) { console.error('[JOURNAL] #main-title not found'); return; }

  title.addEventListener('click', startAnimation, { once: true });

  async function startAnimation() {
    title.style.pointerEvents = 'none';

    
    gsap.to('#scene-intro', {
      opacity:0, scale:1.05, duration:0.8, ease:'power2.in',
      onComplete: () => {
        const si = document.getElementById('scene-intro');
        if (si) si.classList.remove('active');
        if (introParticles) introParticles.stop();
      }
    });
    await new Promise(r => setTimeout(r, 400));

    
    await SceneManager.show('circuit', 0.8);
    sparkEngine.start();
    gsap.from('#circuit-svg', { opacity:0, scale:0.95, duration:0.6, ease:'power2.out' });
    gsap.from('#pcb-grid line', { opacity:0, stagger:0.01, duration:0.3 });

    await new Promise(resolve => { animateElectronCircuit(sparkEngine, resolve); });
    await new Promise(r => setTimeout(r, 600));

    
    gsap.to('#scene-circuit', { opacity:0, duration:0.6, ease:'power2.in' });
    await new Promise(r => setTimeout(r, 300));

    
    await SceneManager.show('server', 0.8);
    sparkEngine.stop();

    const fiberSystem = new FiberPulseSystem();
    const serverLog   = new ServerLog(document.getElementById('server-log'));
    fiberSystem.start();
    serverLog.start();

    $$('.rack-unit').forEach((u,i) => {
      gsap.from(u, { x:-40, opacity:0, duration:0.4, delay:i*0.1, ease:'power2.out' });
    });

    
    const sCanvas = document.getElementById('server-canvas');
    if (sCanvas) {
      sCanvas.width=window.innerWidth; sCanvas.height=window.innerHeight;
      const sCtx=sCanvas.getContext('2d');
      const sP = Array.from({length:50},()=>({
        x:rand(0,sCanvas.width),y:rand(0,sCanvas.height),
        vx:rand(-2,2),vy:rand(-0.5,0.5),r:rand(1,2),
        color:Math.random()>0.5?'#00ff44':'#00aaff'
      }));
      let sRun=true;
      const sFn=()=>{
        if(!sRun) return;
        sCtx.clearRect(0,0,sCanvas.width,sCanvas.height);
        sP.forEach(p=>{ p.x=(p.x+p.vx+sCanvas.width)%sCanvas.width; p.y=(p.y+p.vy+sCanvas.height)%sCanvas.height; sCtx.beginPath(); sCtx.arc(p.x,p.y,p.r,0,Math.PI*2); sCtx.fillStyle=p.color; sCtx.globalAlpha=0.3; sCtx.fill(); sCtx.globalAlpha=1; });
        requestAnimationFrame(sFn);
      };
      sFn();
      setTimeout(()=>{ sRun=false; }, 3500);
    }

    await new Promise(r => setTimeout(r, 3200));
    fiberSystem.stop();

    
    gsap.to('#scene-server', { opacity:0, duration:0.4, ease:'power3.in' });
    await new Promise(r => setTimeout(r, 200));

    
    const expCanvas = document.getElementById('explosion-canvas');
    const explosionEngine = new ExplosionEngine(expCanvas);

    await SceneManager.show('explosion', 0.3);
    explosionEngine.explode();

    await new Promise(r => setTimeout(r, 1500));
    explosionEngine.startStreams();

    const rl = document.getElementById('red-stream-label');
    const bl = document.getElementById('blue-stream-label');
    if (rl) rl.classList.add('show');
    await new Promise(r => setTimeout(r, 200));
    if (bl) bl.classList.add('show');

    await new Promise(r => setTimeout(r, 2000));

    
    await new Promise(resolve => {
      const flash = document.createElement('div');
      flash.style.cssText = 'position:fixed;inset:0;background:white;z-index:999;pointer-events:none;opacity:0;';
      document.body.appendChild(flash);

      gsap.to(flash, {
        opacity: 1, duration: 0.2, ease: 'power3.in',
        onComplete: () => {
          const expS = document.getElementById('scene-explosion');
          if (expS) { gsap.set(expS,{opacity:0}); expS.classList.remove('active'); }

          const portalS = document.getElementById('scene-portal');
          if (portalS) { portalS.classList.add('active'); gsap.set(portalS,{opacity:1}); }
          SceneManager.current = portalS;

          gsap.to(flash, {
            opacity: 0, duration: 0.8, ease: 'power2.out',
            
            onComplete: () => { flash.remove(); resolve(); }
          });
        }
      });
    });

    initPortal();
  }
}


async function initPortal() {
  gsap.from('#red-portal',     { x:-80, opacity:0, duration:0.8, ease:'power3.out' });
  gsap.from('#blue-portal',    { x:80,  opacity:0, duration:0.8, ease:'power3.out' });
  gsap.from('#main-nav',       { y:-40, opacity:0, duration:0.6, ease:'power2.out' });
  gsap.from('#center-divider', { opacity:0, duration:1, delay:0.3 });

  const matrixCanvas = document.getElementById('matrix-canvas');
  if (matrixCanvas) new MatrixRain(matrixCanvas).start();

  const redCanvas = document.getElementById('red-canvas');
  if (redCanvas) new RedPortalCanvas(redCanvas).start();

  animateFinanceGraph();
  initNavFilter();

  
  const modalClose    = document.getElementById('modal-close');
  const modalBackdrop = document.querySelector('.modal-backdrop');
  if (modalClose)    modalClose.addEventListener('click', closeModal);
  if (modalBackdrop) modalBackdrop.addEventListener('click', closeModal);
  document.addEventListener('keydown', e => { if (e.key==='Escape') closeModal(); });

  
  const overlay = document.getElementById('loading-overlay');
  try {
    const posts = await fetchPosts();
    renderBlogCards(posts);
  } catch (err) {
    console.error('[JOURNAL] Fatal data error:', err);
    if (overlay) {
      overlay.innerHTML = '<div class="loading-spinner" style="border-top-color:#ff4400"></div><div class="loading-text" style="color:#ff4400">RETRYING...</div>';
      setTimeout(async () => {
        try { renderBlogCards(await fetchPosts()); }
        catch(e2) { if(overlay) overlay.innerHTML='<div class="loading-text" style="color:#ff4400">FEED UNAVAILABLE</div>'; }
      }, 3000);
    }
  }
}


document.addEventListener('DOMContentLoaded', () => {

  
  try {
    if (typeof MotionPathPlugin !== 'undefined') {
      gsap.registerPlugin(MotionPathPlugin);
      console.info('[JOURNAL] MotionPathPlugin registered');
    } else {
      console.warn('[JOURNAL] MotionPathPlugin unavailable — waypoint fallback active');
    }
  } catch(e) {
    console.warn('[JOURNAL] Plugin registration error:', e);
  }

  
  ['intro','circuit','server','explosion','portal'].forEach(name => {
    SceneManager.register(name, document.getElementById(`scene-${name}`));
  });

  initCursorSparks();
  runCinematicSequence();

 
  window.addEventListener('resize', () => {
    ['explosion-canvas','server-canvas','spark-canvas'].forEach(id => {
      const c = document.getElementById(id);
      if (c) { c.width=window.innerWidth; c.height=window.innerHeight; }
    });
  });

  
  const K=[38,38,40,40,37,39,37,39,66,65]; let ki=0;
  document.addEventListener('keydown', e => {
    ki = e.keyCode===K[ki] ? ki+1 : 0;
    if (ki===K.length) {
      ki=0;
      const f=document.createElement('div');
      f.style.cssText='position:fixed;inset:0;background:rgba(0,255,255,0.1);z-index:9998;pointer-events:none;animation:sparkFade 0.5s ease-out forwards;';
      document.body.appendChild(f); setTimeout(()=>f.remove(),500);
    }
  });
});
