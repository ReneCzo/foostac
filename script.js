const board = document.getElementById("board");
const drawLayer = document.getElementById("drawLayer");
const toggleDrawBtn = document.getElementById("toggleDraw");
const clearDrawingsBtn = document.getElementById("clearDrawings");
const resetBoardBtn = document.getElementById("resetBoard");
const ball = document.getElementById("ball");
const bars = Array.from(document.querySelectorAll(".bar"));

const boardState = {
  drawMode: false,
  pointers: new Map(),
};

const drawCtx = drawLayer.getContext("2d");
drawCtx.lineCap = "round";
drawCtx.lineJoin = "round";
drawCtx.strokeStyle = "#ffffff";
drawCtx.lineWidth = 3;

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
  drawCtx.drawImage(previous, 0, 0, previous.width, previous.height, 0, 0, drawLayer.width, drawLayer.height);
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
  const maxOffset = rect.height * 0.2;
  const offset = clamp(pointerY - rect.height / 2, -maxOffset, maxOffset);
  bar.style.setProperty("--bar-offset", `${offset}px`);
}

function handleBallMove(pointerX, pointerY, rect) {
  const x = clamp((pointerX / rect.width) * 100, 2, 98);
  const y = clamp((pointerY / rect.height) * 100, 2, 98);
  ball.style.setProperty("--x", `${x}%`);
  ball.style.setProperty("--y", `${y}%`);
}

function onPointerDown(event) {
  const target = event.target.closest(".bar, .ball");
  if (!board.contains(event.target)) {
    return;
  }

  const { x, y } = pointerPosition(event);

  if (boardState.drawMode) {
    boardState.pointers.set(event.pointerId, { type: "draw", x, y });
    return;
  }

  if (!target) {
    return;
  }

  event.preventDefault();
  event.target.setPointerCapture(event.pointerId);
  if (target.classList.contains("bar")) {
    boardState.pointers.set(event.pointerId, { type: "bar", id: target.dataset.id });
  } else if (target.classList.contains("ball")) {
    boardState.pointers.set(event.pointerId, { type: "ball" });
  }
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
}

toggleDrawBtn.addEventListener("click", () => {
  setDrawMode(!boardState.drawMode);
});

clearDrawingsBtn.addEventListener("click", clearDrawing);
resetBoardBtn.addEventListener("click", resetBoard);

board.addEventListener("pointerdown", onPointerDown);
board.addEventListener("pointermove", onPointerMove);
board.addEventListener("pointerup", onPointerUp);
board.addEventListener("pointercancel", onPointerUp);
window.addEventListener("resize", resizeDrawingLayer);

buildPlayers();
resizeDrawingLayer();
setDrawMode(false);
