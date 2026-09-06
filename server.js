const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

const PORT = process.env.PORT || 10000;

let cameraSocket = null;
let latestFrame = null;
let cameraStatus = {};
let cameraConnectedAt = null;
const viewers = new Set();

/* =========================
   WEB UI
========================= */

app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ESP32-CAM Control</title>

<style>
*{box-sizing:border-box}
body{
  margin:0;
  font-family:Arial,sans-serif;
  background:#0b1020;
  color:#fff;
}
header{
  padding:20px 25px;
  background:#111936;
  border-bottom:1px solid #263154;
  display:flex;
  justify-content:space-between;
  align-items:center;
}
h1{margin:0;font-size:22px}
.status{
  display:flex;
  align-items:center;
  gap:8px;
  font-size:14px;
}
.dot{
  width:10px;
  height:10px;
  border-radius:50%;
  background:#ef4444;
}
.dot.online{background:#22c55e}

.container{
  max-width:1200px;
  margin:auto;
  padding:20px;
}

.grid{
  display:grid;
  grid-template-columns:2fr 1fr;
  gap:20px;
}

.card{
  background:#111936;
  border:1px solid #263154;
  border-radius:14px;
  padding:18px;
  box-shadow:0 8px 30px #0004;
}

.card h2{
  margin-top:0;
  font-size:17px;
}

.video{
  width:100%;
  background:#000;
  border-radius:10px;
  display:block;
  min-height:300px;
  object-fit:contain;
}

.controls{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:12px;
}

.control{
  background:#182142;
  padding:12px;
  border-radius:10px;
}

label{
  display:block;
  font-size:13px;
  color:#aab4d0;
  margin-bottom:8px;
}

input,select,button{
  width:100%;
  padding:9px;
  border:0;
  border-radius:7px;
  background:#0c1329;
  color:#fff;
}

input[type=range]{padding:0}

button{
  background:#2563eb;
  cursor:pointer;
  font-weight:bold;
}

button:hover{background:#3b82f6}

.full{grid-column:1/-1}

.stats{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  gap:10px;
}

.stat{
  background:#182142;
  padding:14px;
  border-radius:10px;
}
.stat small{color:#8d99bb}
.stat strong{
  display:block;
  font-size:18px;
  margin-top:5px;
}

pre{
  background:#080d1d;
  padding:12px;
  border-radius:8px;
  overflow:auto;
  max-height:250px;
  font-size:12px;
}

@media(max-width:800px){
  .grid{grid-template-columns:1fr}
  .controls{grid-template-columns:1fr}
}
</style>
</head>

<body>

<header>
  <h1>📷 ESP32-CAM Control</h1>
  <div class="status">
    <span id="dot" class="dot"></span>
    <span id="connection">Camera Offline</span>
  </div>
</header>

<div class="container">

<div class="grid">

<div class="card">
  <h2>Live Camera</h2>
  <img id="stream" class="video" src="/stream">
</div>

<div class="card">
  <h2>Camera Status</h2>

  <div class="stats">
    <div class="stat">
      <small>Connection</small>
      <strong id="camState">Offline</strong>
    </div>

    <div class="stat">
      <small>Viewers</small>
      <strong id="viewerCount">0</strong>
    </div>

    <div class="stat">
      <small>Frames</small>
      <strong id="frameSize">0 KB</strong>
    </div>
  </div>

  <br>
  <button onclick="capture()">📸 Capture</button>
</div>

<div class="card">
<h2>Image Settings</h2>

<div class="controls">

<div class="control">
<label>Frame Size</label>
<select onchange="control('framesize',this.value)">
<option value="10">QQVGA</option>
<option value="8">QVGA</option>
<option value="6">VGA</option>
<option value="5">SVGA</option>
<option value="4">XGA</option>
<option value="3">HD</option>
<option value="0">UXGA</option>
</select>
</div>

<div class="control">
<label>JPEG Quality</label>
<input type="range" min="10" max="63" value="12"
oninput="qualityValue.innerText=this.value"
onchange="control('quality',this.value)">
<span id="qualityValue">12</span>
</div>

<div class="control">
<label>Brightness</label>
<input type="range" min="-2" max="2" value="0"
oninput="brightnessValue.innerText=this.value"
onchange="control('brightness',this.value)">
<span id="brightnessValue">0</span>
</div>

<div class="control">
<label>Contrast</label>
<input type="range" min="-2" max="2" value="0"
oninput="contrastValue.innerText=this.value"
onchange="control('contrast',this.value)">
<span id="contrastValue">0</span>
</div>

<div class="control">
<label>Saturation</label>
<input type="range" min="-2" max="2" value="0"
oninput="saturationValue.innerText=this.value"
onchange="control('saturation',this.value)">
<span id="saturationValue">0</span>
</div>

<div class="control">
<label>Sharpness</label>
<input type="range" min="-2" max="2" value="0"
oninput="sharpnessValue.innerText=this.value"
onchange="control('sharpness',this.value)">
<span id="sharpnessValue">0</span>
</div>

<div class="control">
<label>Special Effect</label>
<select onchange="control('special_effect',this.value)">
<option value="0">None</option>
<option value="1">Negative</option>
<option value="2">Grayscale</option>
<option value="3">Red Tint</option>
<option value="4">Green Tint</option>
<option value="5">Blue Tint</option>
<option value="6">Sepia</option>
</select>
</div>

<div class="control">
<label>White Balance</label>
<select onchange="control('wb_mode',this.value)">
<option value="0">Auto</option>
<option value="1">Sunny</option>
<option value="2">Cloudy</option>
<option value="3">Office</option>
<option value="4">Home</option>
</select>
</div>

<div class="control">
<label>Mirror</label>
<select onchange="control('hmirror',this.value)">
<option value="0">Normal</option>
<option value="1">Mirror</option>
</select>
</div>

<div class="control">
<label>Flip</label>
<select onchange="control('vflip',this.value)">
<option value="0">Normal</option>
<option value="1">Flip</option>
</select>
</div>

<div class="control">
<label>Auto Exposure</label>
<select onchange="control('aec',this.value)">
<option value="1">ON</option>
<option value="0">OFF</option>
</select>
</div>

<div class="control">
<label>Auto Gain</label>
<select onchange="control('agc',this.value)">
<option value="1">ON</option>
<option value="0">OFF</option>
</select>
</div>

</div>
</div>

<div class="card">
<h2>Advanced Camera</h2>

<div class="controls">

<div class="control">
<label>AE Level</label>
<input type="range" min="-2" max="2" value="0"
onchange="control('ae_level',this.value)">
</div>

<div class="control">
<label>Gain Ceiling</label>
<input type="range" min="0" max="6" value="0"
onchange="control('gainceiling',this.value)">
</div>

<div class="control">
<label>AGC Gain</label>
<input type="range" min="0" max="30" value="0"
onchange="control('agc_gain',this.value)">
</div>

<div class="control">
<label>AEC Value</label>
<input type="range" min="0" max="1200" value="300"
onchange="control('aec_value',this.value)">
</div>

<div class="control">
<label>LED Intensity</label>
<input type="range" min="0" max="255" value="0"
onchange="control('led_intensity',this.value)">
</div>

<div class="control">
<label>XCLK</label>
<input type="number" min="1" max="40" value="20"
onchange="control('xclk',this.value)">
</div>

</div>
</div>

<div class="card full">
<h2>Server / Debug</h2>
<pre id="debug">Waiting...</pre>
</div>

</div>
</div>

<script>

async function control(varName,value){
  try{
    const r=await fetch(
      '/control?var='+encodeURIComponent(varName)+
      '&val='+encodeURIComponent(value)
    );

    const data=await r.json();
    log(data);
  }catch(e){
    log({error:e.message});
  }
}

async function capture(){
  window.open('/capture','_blank');
}

async function updateStatus(){
  try{
    const r=await fetch('/status');
    const data=await r.json();

    const online=data.connected;

    document.getElementById("dot")
      .className="dot "+(online?"online":"");

    document.getElementById("connection").innerText =
      online ? "Camera Online" : "Camera Offline";

    document.getElementById("camState").innerText =
      online ? "Online" : "Offline";

    document.getElementById("viewerCount").innerText =
      data.viewers || 0;

    document.getElementById("frameSize").innerText =
      data.frameSize ?
      Math.round(data.frameSize/1024)+" KB" : "0 KB";

    document.getElementById("debug").innerText =
      JSON.stringify(data,null,2);

  }catch(e){
    document.getElementById("connection").innerText =
      "Server Error";
  }
}

setInterval(updateStatus,1000);
updateStatus();

</script>

</body>
</html>`);
});

/* =========================
   STATUS
========================= */

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    camera: !!cameraSocket,
    timestamp: Date.now()
  });
});

app.get("/status", (req, res) => {
  res.json({
    connected: !!cameraSocket,
    connectedAt: cameraConnectedAt,
    viewers: viewers.size,
    frameSize: latestFrame ? latestFrame.length : 0,
    camera: cameraStatus
  });
});

/* =========================
   MJPEG STREAM
========================= */

app.get("/stream", (req, res) => {

  res.writeHead(200, {
    "Content-Type": "multipart/x-mixed-replace; boundary=frame",
    "Cache-Control": "no-cache",
    "Connection": "close",
    "Pragma": "no-cache"
  });

  viewers.add(res);

  let closed = false;

  const sendFrame = () => {
    if (closed || !latestFrame) return;

    try {
      res.write(
        "--frame\\r\\n" +
        "Content-Type: image/jpeg\\r\\n" +
        "Content-Length: " + latestFrame.length +
        "\\r\\n\\r\\n"
      );

      res.write(latestFrame);
      res.write("\\r\\n");

    } catch {
      cleanup();
    }
  };

  const timer = setInterval(sendFrame, 100);

  function cleanup(){
    if(closed) return;

    closed = true;
    clearInterval(timer);
    viewers.delete(res);

    try {
      res.end();
    } catch {}
  }

  req.on("close", cleanup);
});

/* =========================
   CAPTURE
========================= */

app.get("/capture", (req, res) => {

  if (!latestFrame) {
    return res.status(503).send("No camera frame available");
  }

  res.set({
    "Content-Type": "image/jpeg",
    "Cache-Control": "no-cache"
  });

  res.send(latestFrame);
});

/* =========================
   CAMERA CONTROL
========================= */

function sendCameraCommand(command) {

  if (
    !cameraSocket ||
    cameraSocket.readyState !== WebSocket.OPEN
  ) {
    return false;
  }

  cameraSocket.send(JSON.stringify(command));
  return true;
}

app.get("/control", (req, res) => {

  const variable = req.query.var;
  const value = req.query.val;

  if (!variable || value === undefined) {
    return res.status(400).json({
      error: "Missing var or val"
    });
  }

  const ok = sendCameraCommand({
    type: "control",
    var: variable,
    val: Number(value)
  });

  res.json({
    ok,
    command: {
      type: "control",
      var: variable,
      val: Number(value)
    }
  });
});

/* =========================
   XCLK
========================= */

app.get("/xclk", (req, res) => {

  const value = Number(req.query.xclk ?? req.query.val);

  if (!Number.isFinite(value)) {
    return res.status(400).json({
      error: "Invalid xclk"
    });
  }

  const ok = sendCameraCommand({
    type: "control",
    var: "xclk",
    val: value
  });

  res.json({ ok, xclk: value });
});

/* =========================
   REGISTER
========================= */

app.get("/reg", (req, res) => {

  const reg = Number(req.query.reg);
  const mask = Number(req.query.mask ?? 0xFF);
  const value = Number(req.query.val);

  if (!Number.isFinite(reg) || !Number.isFinite(value)) {
    return res.status(400).json({
      error: "Invalid register parameters"
    });
  }

  const ok = sendCameraCommand({
    type: "register",
    reg,
    mask,
    val: value
  });

  res.json({
    ok,
    reg,
    mask,
    val: value
  });
});

/* =========================
   GET REGISTER
========================= */

app.get("/greg", async (req, res) => {

  const reg = Number(req.query.reg);
  const mask = Number(req.query.mask ?? 0xFF);

  if (!Number.isFinite(reg)) {
    return res.status(400).json({
      error: "Invalid register"
    });
  }

  if (
    !cameraSocket ||
    cameraSocket.readyState !== WebSocket.OPEN
  ) {
    return res.status(503).json({
      error: "Camera offline"
    });
  }

  const requestId =
    Date.now().toString(36) +
    Math.random().toString(36).slice(2);

  const timeout = setTimeout(() => {
    pendingRegisters.delete(requestId);

    if (!res.headersSent) {
      res.status(504).json({
        error: "Camera register timeout"
      });
    }
  }, 5000);

  pendingRegisters.set(requestId, {
    res,
    timeout
  });

  cameraSocket.send(JSON.stringify({
    type: "get_register",
    id: requestId,
    reg,
    mask
  }));
});

/* =========================
   PLL
========================= */

app.get("/pll", (req, res) => {

  const values = [
    "bypass",
    "mul",
    "sys",
    "root",
    "pre",
    "seld5",
    "pclken",
    "pclk"
  ];

  const command = {
    type: "pll"
  };

  for (const key of values) {
    command[key] = Number(req.query[key] ?? 0);
  }

  const ok = sendCameraCommand(command);

  res.json({
    ok,
    command
  });
});

/* =========================
   RESOLUTION / RAW WINDOW
========================= */

app.get("/resolution", (req, res) => {

  const values = [
    "sx",
    "sy",
    "ex",
    "ey",
    "offx",
    "offy",
    "tx",
    "ty",
    "ox",
    "oy",
    "scale",
    "binning"
  ];

  const command = {
    type: "resolution"
  };

  for (const key of values) {
    command[key] = Number(req.query[key] ?? 0);
  }

  const ok = sendCameraCommand(command);

  res.json({
    ok,
    command
  });
});

/* =========================
   JSON COMMAND
========================= */

app.use(express.json());

app.post("/command", (req, res) => {

  if (!req.body || typeof req.body !== "object") {
    return res.status(400).json({
      error: "Invalid JSON"
    });
  }

  const ok = sendCameraCommand(req.body);

  res.json({
    ok,
    command: req.body
  });
});

/* =========================
   WEBSOCKET
========================= */

const pendingRegisters = new Map();

server.on("upgrade", (request, socket, head) => {

  const url = new URL(
    request.url,
    `http://${request.headers.host}`
  );

  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, ws => {

    const role = url.searchParams.get("role") || "viewer";

    wss.emit("connection", ws, request, role);
  });
});

wss.on("connection", (ws, request, role) => {

  console.log("WebSocket connected:", role);

  if (role === "camera") {

    if (cameraSocket &&
        cameraSocket.readyState === WebSocket.OPEN) {
      cameraSocket.close();
    }

    cameraSocket = ws;
    cameraConnectedAt = Date.now();

    sendCameraCommand({
      type: "server",
      message: "camera_connected"
    });

    ws.on("message", data => {

      if (Buffer.isBuffer(data)) {

        latestFrame = Buffer.from(data);

        for (const viewer of viewers) {
          try {
            viewer.write(
              "--frame\\r\\n" +
              "Content-Type: image/jpeg\\r\\n" +
              "Content-Length: " + latestFrame.length +
              "\\r\\n\\r\\n"
            );

            viewer.write(latestFrame);
            viewer.write("\\r\\n");

          } catch {}
        }

        return;
      }

      try {

        const msg = JSON.parse(data.toString());

        if (msg.type === "camera_status") {
          cameraStatus = msg;
        }

        if (
          msg.type === "register_result" ||
          msg.type === "greg_result"
        ) {

          const id = msg.id;

          if (id && pendingRegisters.has(id)) {

            const pending = pendingRegisters.get(id);

            clearTimeout(pending.timeout);
            pendingRegisters.delete(id);

            pending.res.json(msg);
          }
        }

      } catch (err) {
        console.log("Invalid camera message");
      }
    });

    ws.on("close", () => {

      console.log("Camera disconnected");

      if (cameraSocket === ws) {
        cameraSocket = null;
        cameraConnectedAt = null;
      }
    });

    ws.on("error", err => {
      console.log("Camera WebSocket error:", err.message);
    });

    return;
  }

  /* Viewer WebSocket */

  viewers.add(ws);

  ws.send(JSON.stringify({
    type: "server",
    message: "viewer_connected"
  }));

  ws.on("close", () => {
    viewers.delete(ws);
  });

  ws.on("error", () => {
    viewers.delete(ws);
  });
});

/* =========================
   SERVER
========================= */

server.listen(PORT, "0.0.0.0", () => {

  console.log("================================");
  console.log(" ESP32-CAM SERVER");
  console.log("================================");
  console.log("Port:", PORT);
  console.log("Web UI: /");
  console.log("Stream: /stream");
  console.log("Capture: /capture");
  console.log("Status: /status");
  console.log("================================");
});
