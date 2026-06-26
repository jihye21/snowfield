const canvas = document.getElementById("snow");
const ctx = canvas.getContext("2d");

const STORAGE_KEY = "snow-footprints-infinite";

let width = window.innerWidth;
let height = window.innerHeight;

canvas.width = width;
canvas.height = height;

// ---------------------------------------------
// 핵심 게임 및 카메라 상태 변수
// ---------------------------------------------
let footprints = [];
let snowflakes = [];
let started = false;

let camera = { x: 0, y: 0 };
let targetCamera = { x: 0, y: 0 }; 

// PC 키보드
let keys = { w: false, a: false, s: false, d: false };

// 모바일 조이스틱
let touchStartPos = null;
let touchCurrentPos = null;
let isTouching = false;

let lastWorldFoot = null;
let stepToggle = false;
let accumulatedDist = 0;

// 물리 및 환경 변수
let slipFactor = 0;
let globalWind = 0.2; 
let fogIntensity = 0.8; 
let targetDirection = 0; 
let comboCount = 0;
let snowDepth = 0.5; 

let remainingDistance = 1000; 
let isCleared = false;
let clearTimer = 0;

const FOOTPRINT_GAP = 22;

// UI 데이터 설정
let lastVisit = Number(localStorage.getItem("lastVisit")) || Date.now();
let elapsedDays = Math.floor((Date.now() - lastVisit) / (1000 * 60 * 60 * 24));
document.getElementById("dayCounter").textContent = `${elapsedDays} day(s) later`;

// =============================================
// 시스템 핸들러 및 입력 리스너
// =============================================
window.addEventListener("resize", () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
});

// 키보드 입력
document.addEventListener("keydown", (e) => {
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) {
        e.preventDefault();
    }
    if (!started) startExperience();

    const key = e.key.toLowerCase();
    if (key === "w" || key === "arrowup") keys.w = true;
    if (key === "s" || key === "arrowdown") keys.s = true;
    if (key === "a" || key === "arrowleft") keys.a = true;
    if (key === "d" || key === "arrowright") keys.d = true;
});

document.addEventListener("keyup", (e) => {
    const key = e.key.toLowerCase();
    if (key === "w" || key === "arrowup") keys.w = false;
    if (key === "s" || key === "arrowdown") keys.s = false;
    if (key === "a" || key === "arrowleft") keys.a = false;
    if (key === "d" || key === "arrowright") keys.d = false;
});

// 모바일 터치 이벤트 리스너
canvas.addEventListener("touchstart", (e) => {
    if (!started) { startExperience(); return; }
    if (e.target.tagName === "BUTTON") return;
    
    e.preventDefault();
    isTouching = true;
    const touch = e.touches[0];
    
    touchStartPos = { x: touch.clientX, y: touch.clientY };
    touchCurrentPos = { x: touch.clientX, y: touch.clientY };
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
    if (!isTouching) return;
    e.preventDefault();
    const touch = e.touches[0];
    
    touchCurrentPos = { x: touch.clientX, y: touch.clientY };
}, { passive: false });

canvas.addEventListener("touchend", () => {
    isTouching = false;
    touchStartPos = null;
    touchCurrentPos = null;
});

const welcome = document.getElementById("welcome");
document.getElementById("startButton")?.addEventListener("click", (e) => {
    e.stopPropagation();
    startExperience();
});

function startExperience() {
    started = true;
    if (welcome) welcome.classList.add("hidden");
    localStorage.setItem("lastVisit", Date.now());
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    targetDirection = Math.random() * Math.PI * 2;
}

try {
    footprints = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
} catch {
    footprints = [];
}
updateCounterUI();

// =============================================
// 눈 & 안개 시스템
// =============================================
class Snowflake {
    constructor() { this.reset(true); }
    reset(initial = false) {
        this.x = Math.random() * width;
        this.y = initial ? Math.random() * height : -20;
        this.radius = Math.random() * 2 + 1.5;
        this.speed = Math.random() * 1.0 + 0.5; 
        this.drift = Math.random() * 0.5 - 0.25;
        this.alpha = Math.random() * 0.6 + 0.3;
    }
    update() {
        this.y += this.speed;
        this.x += globalWind + this.drift + Math.sin(Date.now() * 0.001 + this.y) * 0.2;
        if (this.y > height + 20 || this.x > width + 20 || this.x < -20) this.reset();
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${this.alpha})`;
        ctx.fill();
    }
}
for (let i = 0; i < 250; i++) snowflakes.push(new Snowflake());

function drawFog() {
    if (!started) return;
    let targetFog = Math.max(0.95 - (comboCount * 0.06), 0.45);
    fogIntensity += (targetFog - fogIntensity) * 0.03; 
    const centerX = width / 2; const centerY = height / 2;
    const innerRadius = Math.min(width, height) * 0.12; 
    const outerRadius = Math.max(width, height) * 0.55;
    const fogGrad = ctx.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, outerRadius);
    fogGrad.addColorStop(0, `rgba(230, 238, 245, ${fogIntensity * 0.15})`);
    fogGrad.addColorStop(0.4, `rgba(225, 235, 245, ${fogIntensity * 0.6})`);
    fogGrad.addColorStop(1, `rgba(215, 225, 235, ${fogIntensity * 0.98})`); 
    ctx.fillStyle = fogGrad; ctx.fillRect(0, 0, width, height);
}

function drawCompassGuide() {
    if (!started) return;

    const isMobile = window.innerWidth < 768;
    const baseWidth = 1200;

    const rawScale = window.innerWidth / baseWidth;
    const scale = Math.max(0.9, Math.min(rawScale, 1.4)) * (isMobile ? 1.3 : 1);

    const compassRadius = 24 * scale;
    const arrowLength = 18 * scale;

    const margin = 24 * scale;

    const compassX = margin + compassRadius;
    const compassY = height - margin - compassRadius;

    ctx.save();
    ctx.translate(compassX, compassY);

    ctx.beginPath();
    ctx.arc(0, 0, compassRadius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.fill();
    ctx.strokeStyle = "rgba(40, 60, 90, 0.3)";
    ctx.stroke();

    ctx.fillStyle = "rgba(40, 60, 90, 0.4)";
    ctx.font = `${9 * scale}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", 0, -15 * scale);

    ctx.rotate(targetDirection);

    ctx.beginPath();
    ctx.moveTo(arrowLength, 0);
    ctx.lineTo(arrowLength * 0.3, 5 * scale);
    ctx.lineTo(arrowLength * 0.3, -5 * scale);
    ctx.closePath();

    ctx.fillStyle = "rgba(30, 70, 120, 0.8)";
    ctx.fill();

    ctx.restore();
}

// 모바일 조이스틱
function drawVirtualJoystick() {
    if (!isTouching || !touchStartPos || !touchCurrentPos) return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(touchStartPos.x, touchStartPos.y, 45, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(40, 60, 90, 0.07)";
    ctx.strokeStyle = "rgba(40, 60, 90, 0.2)";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(touchCurrentPos.x, touchCurrentPos.y, 20, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(35, 75, 135, 0.3)";
    ctx.fill();
    ctx.restore();
}

function createFootprint(worldX, worldY, angle, isMatch) {
    footprints.push({
        worldX, worldY, angle: angle + Math.PI / 2, createdAt: Date.now(),
        step: stepToggle ? 1 : 0, perfect: isMatch, frameDepth: snowDepth 
    });
    stepToggle = !stepToggle; updateCounterUI(); saveFootprints();
}

// =============================================
// 통합 물리 연산 루프 (PC 키보드 + 모바일 터치)
// =============================================
function updateGamePhysics() {
    const time = Date.now();
    slipFactor = (Math.sin(time * 0.0005) + 1) / 2;
    globalWind = Math.sin(time * 0.0002) * 1.5 + 0.5;

    if (started && !isCleared) snowDepth = Math.min(snowDepth + 0.0005, 3.5);

    if (isCleared) {
        if (time - clearTimer > 3000) { 
            isCleared = false; remainingDistance = 1000 + Math.floor(Math.random() * 500); 
            targetDirection = Math.random() * Math.PI * 2; comboCount = 0; snowDepth = 0.5; 
        }
        return;
    }

    let moveX = 0; let moveY = 0;
    let isMoving = false;

    // 키보드 입력 체크
    if (keys.w) moveY -= 1;
    if (keys.s) moveY += 1;
    if (keys.a) moveX -= 1;
    if (keys.d) moveX += 1;
    if (moveX !== 0 || moveY !== 0) isMoving = true;

    let moveAngle = Math.atan2(moveY, moveX);

    // 모바일 조이스틱 입력
    if (isTouching && touchStartPos && touchCurrentPos) {
        const dx = touchCurrentPos.x - touchStartPos.x;
        const dy = touchCurrentPos.y - touchStartPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 10) { // 데드존 설정 (최소 10픽셀 이상 밀었을 때 움직임)
            moveAngle = Math.atan2(dy, dx);
            isMoving = true;

            if (dist > 45) {
                touchCurrentPos.x = touchStartPos.x + Math.cos(moveAngle) * 45;
                touchCurrentPos.y = touchStartPos.y + Math.sin(moveAngle) * 45;
            }
        }
    }

    // 최종 이동 처리
    if (started && isMoving) {
        // [함정]
        const speedPenalty = Math.max(1.0 - (snowDepth * 0.2), 0.3);
        const currentSpeed = 2.2 * speedPenalty;

        targetCamera.x += Math.cos(moveAngle) * currentSpeed;
        targetCamera.y += Math.sin(moveAngle) * currentSpeed;

        accumulatedDist += currentSpeed;
        
        if (accumulatedDist > FOOTPRINT_GAP) {
            const windInfluence = globalWind * 0.05;
            const slipAngle = moveAngle + (Math.random() - 0.5) * slipFactor * 0.12 + windInfluence;
            
            let angleDiff = Math.abs(slipAngle - targetDirection);
            angleDiff = Math.min(angleDiff, Math.PI * 2 - angleDiff);
            const isDirectionMatch = angleDiff < 0.5;

            if (isDirectionMatch) {
                comboCount = Math.min(comboCount + 1, 10);
                remainingDistance = Math.max(remainingDistance - 15, 0);
            } else {
                comboCount = Math.max(comboCount - 1, 0); remainingDistance += 5;
            }

            if (remainingDistance <= 0 && !isCleared) {
                isCleared = true; clearTimer = Date.now(); playSuccessSound(); 
            }

            const currentWorldX = (width / 2) + camera.x;
            const currentWorldY = (height / 2) + camera.y;

            createFootprint(currentWorldX, currentWorldY, slipAngle, isDirectionMatch);
            playStepSound(isDirectionMatch ? 1.1 : 0.55);
            accumulatedDist = 0;
        }
    }

    camera.x += (targetCamera.x - camera.x) * 0.06;
    camera.y += (targetCamera.y - camera.y) * 0.06;

    footprints = footprints.filter(fp => {
        const ageDays = (time - fp.createdAt) / (1000 * 60 * 60 * 24);
        return ageDays < Math.max(1.0 - (fp.frameDepth * 0.25), 0.15);
    });
}

// =============================================
// 렌더링 루프
// =============================================
function drawBackground() {
    const t = new Date().getHours(); let f = t / 24;
    const day = Math.sin((f * Math.PI * 2) - Math.PI / 2) * 0.5 + 0.5;
    const top = `rgb(${205 - day * 30}, ${218 - day * 20}, ${232})`;
    const bottom = `rgb(${218 - day * 45}, ${226 - day * 30}, ${238})`;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, top); gradient.addColorStop(1, bottom);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
}

function drawFootprints() {
    const now = Date.now();
    for (const fp of footprints) {
        const age = now - fp.createdAt; const days = age / (1000 * 60 * 60 * 24);
        const maxLifeLimit = Math.max(1.0 - (fp.frameDepth * 0.25), 0.15);
        const fade = Math.max(1 - days / maxLifeLimit, 0);
        if (fade <= 0) continue;

        const screenX = fp.worldX - camera.x; const screenY = fp.worldY - camera.y;
        if (screenX < -50 || screenX > width + 50 || screenY < -50 || screenY > height + 50) continue;

        ctx.save(); ctx.translate(screenX, screenY); ctx.rotate(fp.angle);
        ctx.globalAlpha = fp.perfect ? fade * 0.6 : fade * 0.25;
        ctx.fillStyle = fp.perfect ? "rgba(35, 75, 135, 0.5)" : "rgba(80, 92, 108, 0.35)";
        const offset = fp.step === 0 ? -5 : 5;
        const dynamicWidth = 4 + (fp.frameDepth * 2.2);
        const dynamicHeight = (8 + slipFactor * 2) + (fp.frameDepth * 3.5);
        ctx.beginPath(); ctx.ellipse(offset, 0, dynamicWidth, dynamicHeight, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.restore();
    }
}

function updateCounterUI() {
    const counterEl = document.getElementById("footprintCounter");
    const dayEl = document.getElementById("dayCounter");
    
    if (counterEl) {
        counterEl.innerHTML = `
            <span style="color:#234b87; font-weight:bold;">목적지:</span> ${remainingDistance}m <br>
            <span style="color:#505c6c;">눈 깊이:</span> ${snowDepth.toFixed(2)}m (콤보: ${comboCount})
        `;
    }
}

function saveFootprints() { localStorage.setItem(STORAGE_KEY, JSON.stringify(footprints)); }

function animate() {
    requestAnimationFrame(animate);
    drawBackground();
    drawFootprints();     
    drawFog();            
    drawCompassGuide();   
    drawVirtualJoystick();

    if (isCleared) {
        ctx.save();
        ctx.fillStyle = "rgba(30, 60, 100, 0.9)";
        
        const isMobile = width < 600;
        ctx.font = isMobile ? "bold 18px sans-serif" : "bold 24px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("❄️ 눈보라 속에서 대피소를 찾았습니다! ❄️", width / 2, height / 2);
        
        ctx.font = isMobile ? "13px sans-serif" : "16px sans-serif";
        ctx.fillText("잠시 후 새로운 눈길이 시작됩니다...", width / 2, height / 2 + 35);
        ctx.restore();
    }

    for (const flake of snowflakes) { 
        flake.update(); 
        flake.draw(); 
    }
    updateGamePhysics();
}
animate();

// =============================================
// 오디오 시스템
// =============================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playStepSound(intensity = 1) {
    if (audioCtx.state === 'suspended') return;
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.type = "sine"; const depthMuffler = snowDepth * 15;
    osc.frequency.value = Math.max(130 + Math.random() * 50 * intensity - depthMuffler, 80); 
    gain.gain.value = 0.02 * intensity;
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.07);
}

function playSuccessSound() {
    if (audioCtx.state === 'suspended') return;
    const now = audioCtx.currentTime;
    [261.6, 329.6, 392.0, 523.3].forEach((f, i) => {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.frequency.value = f; gain.gain.setValueAtTime(0.02, now + i * 0.08);
        gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.3);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now + i * 0.08); osc.stop(now + i * 0.08 + 0.3);
    });
}
window.addEventListener("click", () => { if (audioCtx.state === 'suspended') audioCtx.resume(); });