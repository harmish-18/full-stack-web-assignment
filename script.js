// --- STATE VARIABLES ---
let volume = 0;
let dartsLeft = 3;
let totalDartsThrown = 0;
let isFrozen = false;
let punishmentFlag = false;

// Time & Animation
let activeTime = 0;
let lastTimestamp = 0;

// Dartboard configuration
const ringsCount = 15; // +1 for bullseye = 16
const ringWidth = 8;
const maxRadius = ringWidth * (ringsCount + 1); // 128px
const colors = ['#c72c41', '#1a1a1a', '#2e8b57', '#fdf5e6'];
let ringValues = [];

// Throwing mechanics
let isCharging = false;
let predictOffsetX = 0;
let predictOffsetY = 0;
let stuckDarts = []; // {dx, dy} relative to board center

// Modals & Timers
let mathTimerInterval;
let currentRingLanded = 0;
let currentMathAnswer = 0;

let spinnerInterval;
let spinnerTimeLeft = 60;

// DOM Elements
const canvas = document.getElementById('dartboard');
const ctx = canvas.getContext('2d');
const predictionDot = document.getElementById('prediction-dot');
const gameContainer = document.getElementById('game-container');
const volDisplay = document.getElementById('vol-value');
const dartsDisplay = document.getElementById('darts-display');

// --- INITIALIZATION ---
function init() {
    reshuffleRings();
    requestAnimationFrame(animationLoop);
}

function reshuffleRings() {
    ringValues = [];
    for (let i = 0; i <= ringsCount; i++) {
        ringValues.push(Math.floor(Math.random() * 100) + 1);
    }
}

// --- MOVEMENT & DRAWING ---
function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function getBoardPosition(t) {
    // Continuous smooth loop: Center -> Left Side -> Top Right -> Center
    // Cycle length: 6 seconds
    const cycle = (t / 1000) % 6;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const rangeX = 250;
    const rangeY = 120;

    let bx, by;
    if (cycle < 2) {
        // Phase 1: Center to Left Side
        let p = cycle / 2; 
        bx = cx - rangeX * easeInOut(p);
        by = cy;
    } else if (cycle < 4) {
        // Phase 2: Left Side to Top Right
        let p = (cycle - 2) / 2;
        bx = cx - rangeX + (rangeX + rangeX * 0.8) * easeInOut(p);
        by = cy - rangeY * easeInOut(p);
    } else {
        // Phase 3: Top Right back to Center
        let p = (cycle - 4) / 2;
        bx = cx + rangeX * 0.8 - (rangeX * 0.8) * easeInOut(p);
        by = cy - rangeY + rangeY * easeInOut(p);
    }
    return { x: bx, y: by };
}

function animationLoop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    let dt = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    if (!isFrozen) {
        activeTime += dt;
        draw();
    }
    requestAnimationFrame(animationLoop);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const pos = getBoardPosition(activeTime);

    // Draw Rings (Outer to Inner)
    for (let i = ringsCount; i >= 0; i--) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, (i + 1) * ringWidth, 0, Math.PI * 2);
        
        if (i === 0) {
            ctx.fillStyle = '#c72c41'; // Bullseye
        } else {
            ctx.fillStyle = colors[i % colors.length];
        }
        
        ctx.fill();
        ctx.strokeStyle = '#rgba(0,0,0,0.2)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }

    // Draw Stuck Darts
    stuckDarts.forEach(dart => {
        ctx.beginPath();
        ctx.arc(pos.x + dart.dx, pos.y + dart.dy, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'black';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(pos.x + dart.dx, pos.y + dart.dy);
        ctx.lineTo(pos.x + dart.dx + 10, pos.y + dart.dy - 10);
        ctx.strokeStyle = 'silver';
        ctx.lineWidth = 2;
        ctx.stroke();
    });
}

// --- THROW MECHANIC ---
gameContainer.addEventListener('mousedown', (e) => {
    if (isFrozen || dartsLeft <= 0) return;
    
    isCharging = true;
    
    // Choose prediction dot offset on mousedown
    predictOffsetX = (Math.random() * 60) - 30;
    predictOffsetY = (Math.random() * 60) - 30;
    
    updatePredictionDot(e);
    predictionDot.style.display = 'block';
});

gameContainer.addEventListener('mousemove', (e) => {
    if (isCharging) {
        updatePredictionDot(e);
    }
});

function updatePredictionDot(e) {
    const rect = gameContainer.getBoundingClientRect();
    const x = e.clientX - rect.left + predictOffsetX;
    const y = e.clientY - rect.top + predictOffsetY;
    predictionDot.style.left = `${x}px`;
    predictionDot.style.top = `${y}px`;
}

gameContainer.addEventListener('mouseup', (e) => {
    if (!isCharging || isFrozen || dartsLeft <= 0) return;
    isCharging = false;
    predictionDot.style.display = 'none';

    totalDartsThrown++;
    dartsLeft--;
    updateUI();

    const rect = gameContainer.getBoundingClientRect();
    const basePathX = e.clientX - rect.left + predictOffsetX;
    const basePathY = e.clientY - rect.top + predictOffsetY;
    
    // Add secondary random offset on release
    const finalX = basePathX + (Math.random() * 40 - 20);
    const finalY = basePathY + (Math.random() * 40 - 20);

    const pos = getBoardPosition(activeTime);
    const dist = Math.hypot(finalX - pos.x, finalY - pos.y);

    if (dist <= maxRadius) {
        // Hit board
        stuckDarts.push({ dx: finalX - pos.x, dy: finalY - pos.y });
        
        let ringIndex = Math.floor(dist / ringWidth);
        if (ringIndex > ringsCount) ringIndex = ringsCount;

        const landedValue = ringValues[ringIndex];
        reshuffleRings(); // Reshuffle values immediately after landing
        
        triggerMathUnlock(landedValue);
    }
});

function updateUI() {
    volDisplay.innerText = volume;
    dartsDisplay.innerText = dartsLeft;
    document.getElementById('fake-reload-btn').disabled = (dartsLeft > 0);
}

// --- MATH PROBLEM UNLOCK ---
function triggerMathUnlock(ringValue) {
    isFrozen = true;
    currentRingLanded = ringValue;
    
    let p1, p2, p3, timeLimit;
    let str = "";
    
    // Scale complexity
    if (totalDartsThrown <= 3) {
        p1 = Math.floor(Math.random() * 20) + 1;
        p2 = Math.floor(Math.random() * 20) + 1;
        currentMathAnswer = p1 + p2;
        str = `${p1} + ${p2}`;
        timeLimit = 8;
    } else if (totalDartsThrown <= 6) {
        p1 = Math.floor(Math.random() * 12) + 2;
        p2 = Math.floor(Math.random() * 12) + 2;
        currentMathAnswer = p1 * p2;
        str = `${p1} × ${p2}`;
        timeLimit = 10;
    } else if (totalDartsThrown <= 9) {
        p1 = Math.floor(Math.random() * 10) + 2;
        p2 = Math.floor(Math.random() * 10) + 2;
        p3 = Math.floor(Math.random() * 20) + 1;
        currentMathAnswer = p1 * p2 + p3;
        str = `${p1} × ${p2} + ${p3}`;
        timeLimit = 12;
    } else {
        p1 = Math.floor(Math.random() * 5) + 2;
        p2 = Math.floor(Math.random() * 3) + 2; // Powers 2-4
        p3 = Math.floor(Math.random() * 10) + 2;
        currentMathAnswer = Math.pow(p1, p2) - p3;
        str = `${p1}^${p2} - ${p3}`;
        timeLimit = 15;
    }

    document.getElementById('math-problem').innerText = str + " = ?";
    document.getElementById('math-input').value = "";
    document.getElementById('math-timer').innerText = timeLimit;
    document.getElementById('math-modal').classList.remove('hidden');
    document.getElementById('math-input').focus();

    clearInterval(mathTimerInterval);
    let timeLeft = timeLimit;
    mathTimerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('math-timer').innerText = timeLeft;
        if (timeLeft <= 0) {
            handleMathResult(false); // Timeout
        }
    }, 1000);
}

document.getElementById('math-submit').addEventListener('click', () => checkMath());
document.getElementById('math-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') checkMath();
});

function checkMath() {
    const userVal = parseInt(document.getElementById('math-input').value, 10);
    handleMathResult(userVal === currentMathAnswer);
}

function handleMathResult(isCorrect) {
    clearInterval(mathTimerInterval);
    document.getElementById('math-modal').classList.add('hidden');
    
    if (punishmentFlag) {
        // Punishment active: volume goes to 0 regardless of math result
        volume = 0;
        updateUI();
        
        if (isCorrect) {
            // Extra evil: Tell them they succeeded, but set volume to 0 anyway
            showToast(`Success! Volume updated to 0%`); 
        }
        
        punishmentFlag = false; // Clear the flag after resolving
    } else {
        // Normal behavior
        if (isCorrect) {
            volume = currentRingLanded;
            updateUI();
            showToast(`Success! Volume updated to ${volume}%`);
        } else {
            // Silent punishment setup
            punishmentFlag = true;
        }
    }
    
    isFrozen = false;
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// --- DART RELOAD MECHANICS ---

// Fake Reload
document.getElementById('fake-reload-btn').addEventListener('click', () => {
    document.getElementById('spinner-modal').classList.remove('hidden');
    startFakeSpinner();
});

function startFakeSpinner() {
    clearInterval(spinnerInterval);
    spinnerTimeLeft = 60;
    document.getElementById('spinner-time').innerText = spinnerTimeLeft;
    document.getElementById('progress-bar').style.width = '0%';
    
    spinnerInterval = setInterval(() => {
        spinnerTimeLeft--;
        document.getElementById('spinner-time').innerText = spinnerTimeLeft;
        const pct = ((60 - spinnerTimeLeft) / 60) * 100;
        document.getElementById('progress-bar').style.width = pct + '%';
        
        if (spinnerTimeLeft <= 0) {
            // It loops infinitely because the real world is cruel
            spinnerTimeLeft = 60; 
        }
    }, 1000);
}

// Fake Close
document.getElementById('fake-close-spinner').addEventListener('click', () => {
    // "Does not close the modal, resets progress to 0"
    startFakeSpinner();
});

// REAL Escape from spinner
document.getElementById('real-escape').addEventListener('click', () => {
    clearInterval(spinnerInterval);
    document.getElementById('spinner-modal').classList.add('hidden');
});

// REAL Reload Darts
document.getElementById('real-reload').addEventListener('click', () => {
    dartsLeft = 3;
    stuckDarts = [];
    updateUI();
});

// Start
init();