const board = document.getElementById("board");
const drawLayer = document.getElementById("drawLayer");
const shadowLayer = document.getElementById("shadowLayer");
const toggleDrawBtn = document.getElementById("toggleDraw");
const clearDrawingsBtn = document.getElementById("clearDrawings");
const resetBoardBtn = document.getElementById("resetBoard");
const coverageSelect = document.getElementById("coverageSelect");
const ball = document.getElementById("ball");
const bars = Array.from(document.querySelectorAll(".bar"));
const goals = Array.from(document.querySelectorAll(".goal"));

const boardState = {
  drawMode: false,
  coverageTeam: 0,
  pointers: new Map(),
};

const drawCtx = drawLayer.getContext("2d");
const shadowCtx = shadowLayer.getContext("2d");
let resizeTimer;

function configureDrawingContext() {
  drawCtx.lineCap = "round";
  drawCtx.lineJoin = "round";
  drawCtx.strokeStyle = "#ffffff";
  drawCtx.lineWidth = 3;
}

function buildPlayers() {
  bars.forEach((bar) => {
    const holder = bar.querySelector(".players");
    const count = Number(holder.dataset.count || 0);
    holder.innerHTML = "";
    for (let i = 0; i < count; i += 1) {
      const player = document.createElement("span");
      player.className = "player";
      holder.appendChild(player);
    }
  });
}

function resizeDrawingLayer() {
  const previous = document.createElement("canvas");
  previous.width = drawLayer.width;
  previous.height = drawLayer.height;
  const previousCtx = previous.getContext("2d");
  previousCtx.drawImage(drawLayer, 0, 0);

  const rect = board.getBoundingClientRect();
  drawLayer.width = rect.width;
  drawLayer.height = rect.height;
  configureDrawingContext();
  drawCtx.drawImage(previous, 0, 0, previous.width, previous.height, 0, 0, drawLayer.width, drawLayer.height);

  shadowLayer.width = rect.width;
  shadowLayer.height = rect.height;
  drawCoverage();

  const goalHeight = rect.height * 0.3;
  goals.forEach((g) => {
    g.style.height = `${goalHeight}px`;
  });
}

function drawCoverage() {
  const team = boardState.coverageTeam;
  const w = shadowLayer.width;
  const h = shadowLayer.height;

  shadowCtx.clearRect(0, 0, w, h);
  if (!team) return;

  const xPct = parseFloat(ball.style.getPropertyValue("--x") || "50%");
  const yPct = parseFloat(ball.style.getPropertyValue("--y") || "50%");
  const ballX = (xPct / 100) * w;
  const ballY = (yPct / 100) * h;

  // Team 1 (blue, left side) attacks toward the right goal; Team 2 defends.
  // Team 2 (red, right side) attacks toward the left goal; Team 1 defends.
  const goalX = team === 1 ? w : 0;
  const goalTopY = h * 0.35;
  const goalBottomY = h * 0.65;
  const defendingTeam = team === 1 ? 2 : 1;

  // Collect every defending player that lies between the ball and the goal.
  const defenders = [];
  bars
    .filter((b) => b.dataset.team === String(defendingTeam))
    .forEach((bar) => {
      const barX = (parseFloat(bar.style.left) / 100) * w;
      const isBlocking = team === 1 ? barX > ballX : barX < ballX;
      if (!isBlocking) return;

      const barOffset = parseFloat(bar.style.getPropertyValue("--bar-offset") || "0");
      const playersEl = bar.querySelector(".players");
      const count = parseInt(playersEl.dataset.count, 10);

      for (let i = 0; i < count; i += 1) {
        const py = ((i + 1) / (count + 1)) * h + barOffset;
        defenders.push({ x: barX, y: py });
      }
    });

  // Draw only the open (unblocked) part of a shooting cone from srcX/srcY to
  // the goal opening, filled with the given color.
  // Wall-bounce paths use mirror-image sources: reflecting the ball across the
  // top wall (y=0) gives srcY=-ballY, across the bottom wall (y=h) gives
  // srcY=2h-ballY. The canvas clips the triangle to its own bounds automatically.
  // Each call is isolated via save/restore + clip so destination-out doesn't
  // bleed into cones drawn by other calls.
  function drawOpenGap(srcX, srcY, color) {
    shadowCtx.save();

    // Clip all subsequent drawing to the shooting-cone triangle.
    shadowCtx.beginPath();
    shadowCtx.moveTo(srcX, srcY);
    shadowCtx.lineTo(goalX, goalTopY);
    shadowCtx.lineTo(goalX, goalBottomY);
    shadowCtx.closePath();
    shadowCtx.clip();

    // Fill the full cone with the chosen color.
    shadowCtx.globalCompositeOperation = "source-over";
    shadowCtx.globalAlpha = 0.65;
    shadowCtx.fillStyle = color;
    shadowCtx.beginPath();
    shadowCtx.moveTo(srcX, srcY);
    shadowCtx.lineTo(goalX, goalTopY);
    shadowCtx.lineTo(goalX, goalBottomY);
    shadowCtx.closePath();
    shadowCtx.fill();

    // Erase the shadow cone cast by each blocking defender so only the truly
    // open lanes remain visible.
    shadowCtx.globalCompositeOperation = "destination-out";
    shadowCtx.globalAlpha = 1;
    defenders.forEach(({ x: px, y: py }) => {
      const dx = px - srcX;
      const dy = py - srcY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) return;

      const playerRadius = 14;
      const nx = -dy / dist;
      const ny = dx / dist;

      const d1x = dx + nx * playerRadius;
      const d1y = dy + ny * playerRadius;
      const d2x = dx - nx * playerRadius;
      const d2y = dy - ny * playerRadius;

      const extendLen = Math.max(w, h) * 3;
      const len1 = Math.sqrt(d1x * d1x + d1y * d1y);
      const len2 = Math.sqrt(d2x * d2x + d2y * d2y);
      const far1x = srcX + (d1x / len1) * extendLen;
      const far1y = srcY + (d1y / len1) * extendLen;
      const far2x = srcX + (d2x / len2) * extendLen;
      const far2y = srcY + (d2y / len2) * extendLen;

      shadowCtx.beginPath();
      shadowCtx.moveTo(srcX, srcY);
      shadowCtx.lineTo(far1x, far1y);
      shadowCtx.lineTo(far2x, far2y);
      shadowCtx.closePath();
      shadowCtx.fill();
    });

    shadowCtx.restore();
  }

  // Direct shot gaps — yellow.
  drawOpenGap(ballX, ballY, "rgba(255, 220, 0, 1)");
  // Wall-bounce (Bande) gaps — orange.
  drawOpenGap(ballX, -ballY, "rgba(255, 140, 0, 1)");         // top wall
  drawOpenGap(ballX, 2 * h - ballY, "rgba(255, 140, 0, 1)"); // bottom wall

  // Restore default compositing state.
  shadowCtx.globalCompositeOperation = "source-over";
  shadowCtx.globalAlpha = 1;
}

function isBallHit(pointerX, pointerY) {
  const xPct = parseFloat(ball.style.getPropertyValue("--x") || "50%");
  const yPct = parseFloat(ball.style.getPropertyValue("--y") || "50%");
  const rect = board.getBoundingClientRect();
  const ballX = (xPct / 100) * rect.width;
  const ballY = (yPct / 100) * rect.height;
  // Use a slightly generous hit radius so the ball stays grabbable when partly
  // covered by a bar or player figure.
  const hitRadius = 20;
  const dx = pointerX - ballX;
  const dy = pointerY - ballY;
  return dx * dx + dy * dy <= hitRadius * hitRadius;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pointerPosition(event) {
  const rect = board.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    rect,
  };
}

function handleBarMove(bar, pointerY, rect) {
  const constrainedIds = ["bar-2", "bar-3", "bar-4", "bar-5", "bar-6", "bar-7"];
  let maxOffset;
  if (constrainedIds.includes(bar.dataset.id)) {
    const playersEl = bar.querySelector(".players");
    const playerCount = playersEl ? Number(playersEl.dataset.count) : 1;
    // With space-evenly, first/last player center is at H/(N+1) from the edge.
    // Subtract half the visual player height (including rotated shoulders) so the
    // player body stays within the field. 16px accounts for the shoulder width.
    const playerHalfHeight = 16;
    maxOffset = Math.max(0, rect.height / (playerCount + 1) - playerHalfHeight);
  } else {
    maxOffset = rect.height * 0.2;
  }
  const offset = clamp(pointerY - rect.height / 2, -maxOffset, maxOffset);
  bar.style.setProperty("--bar-offset", `${offset}px`);
  drawCoverage();
}

function handleBallMove(pointerX, pointerY, rect) {
  const x = clamp((pointerX / rect.width) * 100, 2, 98);
  const y = clamp((pointerY / rect.height) * 100, 2, 98);
  ball.style.setProperty("--x", `${x}%`);
  ball.style.setProperty("--y", `${y}%`);
  drawCoverage();
}

function onPointerDown(event) {
  if (!board.contains(event.target)) {
    return;
  }

  const { x, y } = pointerPosition(event);

  if (boardState.drawMode) {
    boardState.pointers.set(event.pointerId, { type: "draw", x, y });
    return;
  }

  // Always prioritise the ball so it remains grabbable even when a bar or
  // player figure is rendered on top of it.
  if (isBallHit(x, y)) {
    event.preventDefault();
    ball.setPointerCapture(event.pointerId);
    boardState.pointers.set(event.pointerId, { type: "ball" });
    return;
  }

  const target = event.target.closest(".bar");
  if (!target) {
    return;
  }

  event.preventDefault();
  event.target.setPointerCapture(event.pointerId);
  boardState.pointers.set(event.pointerId, { type: "bar", id: target.dataset.id });
}

function onPointerMove(event) {
  const pointer = boardState.pointers.get(event.pointerId);
  if (!pointer) {
    return;
  }

  const { x, y, rect } = pointerPosition(event);

  if (pointer.type === "draw") {
    drawCtx.beginPath();
    drawCtx.moveTo(pointer.x, pointer.y);
    drawCtx.lineTo(x, y);
    drawCtx.stroke();
    pointer.x = x;
    pointer.y = y;
    return;
  }

  event.preventDefault();
  if (pointer.type === "ball") {
    handleBallMove(x, y, rect);
  } else if (pointer.type === "bar") {
    const bar = bars.find((item) => item.dataset.id === pointer.id);
    if (bar) {
      handleBarMove(bar, y, rect);
    }
  }
}

function onPointerUp(event) {
  boardState.pointers.delete(event.pointerId);
}

function setDrawMode(enabled) {
  boardState.drawMode = enabled;
  toggleDrawBtn.textContent = `Draw: ${enabled ? "On" : "Off"}`;
  toggleDrawBtn.setAttribute("aria-pressed", String(enabled));
}

function clearDrawing() {
  drawCtx.clearRect(0, 0, drawLayer.width, drawLayer.height);
}

function resetBoard() {
  bars.forEach((bar) => {
    bar.style.setProperty("--bar-offset", "0px");
  });
  ball.style.setProperty("--x", "50%");
  ball.style.setProperty("--y", "50%");
  clearDrawing();
  drawCoverage();
}

toggleDrawBtn.addEventListener("click", () => {
  setDrawMode(!boardState.drawMode);
});

clearDrawingsBtn.addEventListener("click", clearDrawing);
resetBoardBtn.addEventListener("click", resetBoard);
coverageSelect.addEventListener("change", () => {
  boardState.coverageTeam = parseInt(coverageSelect.value, 10);
  drawCoverage();
});

board.addEventListener("pointerdown", onPointerDown);
board.addEventListener("pointermove", onPointerMove);
board.addEventListener("pointerup", onPointerUp);
board.addEventListener("pointercancel", onPointerUp);
window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(resizeDrawingLayer, 100);
});

buildPlayers();
configureDrawingContext();
resizeDrawingLayer();
setDrawMode(false);
