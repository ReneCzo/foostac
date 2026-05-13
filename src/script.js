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

// Returns true when the direct-shot cone from (ballX, ballY) to the goal has
// at least one gap not blocked by any defender.
function hasDirectOpenLane(ballX, ballY, defenders, goalX, goalTopY, goalBottomY) {
  if (defenders.length === 0) return true;

  // Minimum x-component of a shadow ray for it to be considered pointing toward
  // the goal rather than nearly perpendicular.
  const NEAR_ZERO = 0.01;
  // Minimum open gap in pixels at the goal line to count as a usable lane.
  const MIN_GAP_PX = 0.5;

  const playerRadius = 14;
  const goalDir = Math.sign(goalX - ballX); // +1 right, -1 left
  const intervals = [];

  for (const { x: px, y: py } of defenders) {
    const dx = px - ballX;
    const dy = py - ballY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) continue;

    const nx = -dy / dist;
    const ny = dx / dist;

    const d1x = dx + nx * playerRadius;
    const d1y = dy + ny * playerRadius;
    const d2x = dx - nx * playerRadius;
    const d2y = dy - ny * playerRadius;

    // Only project rays that actually point toward the goal.
    if (Math.abs(d1x) < NEAR_ZERO || Math.abs(d2x) < NEAR_ZERO) continue;
    if (Math.sign(d1x) !== goalDir || Math.sign(d2x) !== goalDir) continue;

    const t1 = (goalX - ballX) / d1x;
    const t2 = (goalX - ballX) / d2x;
    const y1 = ballY + t1 * d1y;
    const y2 = ballY + t2 * d2y;

    const shadowTop = Math.max(goalTopY, Math.min(y1, y2));
    const shadowBot = Math.min(goalBottomY, Math.max(y1, y2));
    if (shadowBot > shadowTop) {
      intervals.push([shadowTop, shadowBot]);
    }
  }

  if (intervals.length === 0) return true;

  intervals.sort((a, b) => a[0] - b[0]);
  let covered = goalTopY;
  for (const [lo, hi] of intervals) {
    if (lo > covered + MIN_GAP_PX) return true;
    if (hi > covered) covered = hi;
  }
  return covered < goalBottomY - MIN_GAP_PX;
}

function drawCoverage() {
  const team = boardState.coverageTeam;
  const w = shadowLayer.width;
  const h = shadowLayer.height;

  shadowCtx.clearRect(0, 0, w, h);

  // Reset player highlights and open-lane indicator whenever coverage is redrawn.
  document.querySelectorAll(".player").forEach((p) => {
    p.classList.remove("player--blocker", "player--dim");
  });
  coverageSelect.classList.remove("has-open-lane");

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

  // Collect every defending player that lies between the ball and the goal,
  // and track their DOM elements for the brightness highlight.
  const defenders = [];
  const blockerElements = new Set();
  bars
    .filter((b) => b.dataset.team === String(defendingTeam))
    .forEach((bar) => {
      const barX = (parseFloat(bar.style.left) / 100) * w;
      const isBlocking = team === 1 ? barX > ballX : barX < ballX;

      const barOffset = parseFloat(bar.style.getPropertyValue("--bar-offset") || "0");
      const playersEl = bar.querySelector(".players");
      const count = parseInt(playersEl.dataset.count, 10);
      const playerEls = Array.from(playersEl.querySelectorAll(".player"));

      for (let i = 0; i < count; i += 1) {
        const py = ((i + 1) / (count + 1)) * h + barOffset;
        if (isBlocking) {
          defenders.push({ x: barX, y: py });
          if (playerEls[i]) blockerElements.add(playerEls[i]);
        }
      }
    });

  // Highlight blocking defenders; dim everyone else.
  document.querySelectorAll(".player").forEach((p) => {
    if (blockerElements.has(p)) {
      p.classList.add("player--blocker");
    } else {
      p.classList.add("player--dim");
    }
  });

  // Flag the coverage select red when a straight shot to goal is possible.
  if (hasDirectOpenLane(ballX, ballY, defenders, goalX, goalTopY, goalBottomY)) {
    coverageSelect.classList.add("has-open-lane");
  }

  // Draw only the open (unblocked) part of a shooting cone from srcX/srcY to
  // the goal opening, filled with the given color.
  // Wall-bounce paths use mirror-image sources: reflecting the ball across the
  // top wall (y=0) gives srcY=-ballY, across the bottom wall (y=h) gives
  // srcY=2h-ballY. The canvas clips the triangle to its own bounds automatically.
  // Each cone is rendered onto a shared offscreen canvas (cleared before use) so
  // that destination-out shadow erasure only affects that cone and never removes
  // pixels belonging to a previously composited cone (e.g. band options must stay
  // visible even where the direct-shot shadow would otherwise erase them).
  const offscreen = document.createElement("canvas");
  offscreen.width = w;
  offscreen.height = h;
  const offCtx = offscreen.getContext("2d");

  function drawOpenGap(srcX, srcY, color, blockers) {
    offCtx.clearRect(0, 0, w, h);
    const ctx = offCtx;

    ctx.save();

    // Clip all subsequent drawing to the shooting-cone triangle.
    ctx.beginPath();
    ctx.moveTo(srcX, srcY);
    ctx.lineTo(goalX, goalTopY);
    ctx.lineTo(goalX, goalBottomY);
    ctx.closePath();
    ctx.clip();

    // Fill the full cone with the chosen color.
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(srcX, srcY);
    ctx.lineTo(goalX, goalTopY);
    ctx.lineTo(goalX, goalBottomY);
    ctx.closePath();
    ctx.fill();

    // Erase the shadow cone cast by each blocker so only the truly
    // open lanes remain visible.
    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = 1;
    blockers.forEach(({ x: px, y: py }) => {
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

      ctx.beginPath();
      ctx.moveTo(srcX, srcY);
      ctx.lineTo(far1x, far1y);
      ctx.lineTo(far2x, far2y);
      ctx.closePath();
      ctx.fill();
    });

    ctx.restore();

    // Composite the finished cone onto the shadow layer with source-over so it
    // sits on top of any cones drawn before it without erasing them.
    shadowCtx.save();
    shadowCtx.globalCompositeOperation = "source-over";
    shadowCtx.globalAlpha = 1;
    shadowCtx.drawImage(offscreen, 0, 0);
    shadowCtx.restore();
  }

  // Wall-bounce (Bande) gaps — orange; drawn first so the direct lane is on top.
  // Pre-bounce blockers: any player (either team) between the ball and the wall,
  // mirrored into the unfolded reflection space so the shadow geometry handles
  // both the incoming and outgoing paths of each bank shot correctly.
  const allPlayers = [];
  bars.forEach((bar) => {
    const barX = (parseFloat(bar.style.left) / 100) * w;
    const barOffset = parseFloat(bar.style.getPropertyValue("--bar-offset") || "0");
    const playersEl = bar.querySelector(".players");
    const count = parseInt(playersEl.dataset.count, 10);
    for (let i = 0; i < count; i += 1) {
      const py = ((i + 1) / (count + 1)) * h + barOffset;
      allPlayers.push({ x: barX, y: py });
    }
  });

  // Players above the ball can block the path to the top wall; reflect them
  // across y=0 into the unfolded view.
  const preBounceTopBlockers = allPlayers
    .filter((p) => p.y < ballY)
    .map((p) => ({ x: p.x, y: -p.y }));

  // Players below the ball can block the path to the bottom wall; reflect them
  // across y=h into the unfolded view.
  const preBounceBottomBlockers = allPlayers
    .filter((p) => p.y > ballY)
    .map((p) => ({ x: p.x, y: 2 * h - p.y }));

  drawOpenGap(ballX, -ballY, "rgba(255, 140, 0, 1)", [...defenders, ...preBounceTopBlockers]);         // top wall
  drawOpenGap(ballX, 2 * h - ballY, "rgba(255, 140, 0, 1)", [...defenders, ...preBounceBottomBlockers]); // bottom wall
  // Direct shot gaps — yellow; drawn last so they are never hidden by orange.
  drawOpenGap(ballX, ballY, "rgba(255, 220, 0, 1)", defenders);
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

function handleBarMove(bar, pointerY, rect, grabOffset) {
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
  const offset = clamp(pointerY - grabOffset - rect.height / 2, -maxOffset, maxOffset);
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

  const { x, y, rect } = pointerPosition(event);

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
  const currentOffset = parseFloat(target.style.getPropertyValue("--bar-offset") || "0");
  const grabOffset = y - (rect.height / 2 + currentOffset);
  boardState.pointers.set(event.pointerId, { type: "bar", id: target.dataset.id, grabOffset });
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
      handleBarMove(bar, y, rect, pointer.grabOffset);
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
