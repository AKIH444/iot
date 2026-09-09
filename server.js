const http = require("http");
const express = require("express");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT || 8080);
const CAMERA_TOKEN =
  process.env.CAMERA_TOKEN || "change-this-secret-token";

// Keep this comfortably above your expected JPEG size.
// VGA JPEGs are normally far below this.
const MAX_FRAME_BYTES = Number(
  process.env.MAX_FRAME_BYTES || 2 * 1024 * 1024
);

const app = express();

// Important when running behind Cloudflare / another reverse proxy.
app.set("trust proxy", true);

// We intentionally parse ONLY image/jpeg as raw binary.
app.use(
  "/upload",
  express.raw({
    type: "image/jpeg",
    limit: MAX_FRAME_BYTES,
  })
);

let latestFrame = null;
let latestFrameAt = 0;
let latestCameraId = null;

let framesReceived = 0;
let bytesReceived = 0;

const viewerClients = new Set();

function setCors(res) {
  // Lets a Firebase-hosted dashboard call /status.
  // For production, replace "*" with your exact Firebase domain.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
}

app.get("/", (req, res) => {
  setCors(res);
  res.json({
    ok: true,
    service: "esp32cam-relay",
    websocket: "/ws",
    upload: "/upload",
    status: "/status",
    snapshot: "/snapshot.jpg",
  });
});

app.get("/health", (req, res) => {
  setCors(res);
  res.json({ ok: true });
});

app.get("/status", (req, res) => {
  setCors(res);

  const ageMs =
    latestFrameAt === 0 ? null : Date.now() - latestFrameAt;

  res.json({
    ok: true,
    camera_online: ageMs !== null && ageMs < 5000,
    camera_id: latestCameraId,
    last_frame_age_ms: ageMs,
    frames_received: framesReceived,
    bytes_received: bytesReceived,
    viewers: viewerClients.size,
  });
});

app.get("/snapshot.jpg", (req, res) => {
  setCors(res);

  if (!latestFrame) {
    return res.status(503).json({
      ok: false,
      error: "No frame received yet",
    });
  }

  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Content-Length", String(latestFrame.length));
  res.end(latestFrame);
});

app.post("/upload", (req, res) => {
  const token = req.get("X-Camera-Token") || "";
  const cameraId = req.get("X-Camera-Id") || "unknown";

  if (token !== CAMERA_TOKEN) {
    return res.status(401).json({
      ok: false,
      error: "Invalid camera token",
    });
  }

  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({
      ok: false,
      error: "Expected a non-empty image/jpeg body",
    });
  }

  // Very small sanity check for JPEG SOI marker: FF D8
  if (req.body.length < 2 || req.body[0] !== 0xff || req.body[1] !== 0xd8) {
    return res.status(415).json({
      ok: false,
      error: "Body does not look like a JPEG",
    });
  }

  latestFrame = Buffer.from(req.body);
  latestFrameAt = Date.now();
  latestCameraId = cameraId;

  framesReceived++;
  bytesReceived += latestFrame.length;

  // Broadcast the JPEG as ONE binary WebSocket message.
  for (const client of viewerClients) {
    if (client.readyState === WebSocket.OPEN) {
      // Drop this viewer's frame if its socket is already heavily backed up.
      // This prevents a slow browser from growing server memory indefinitely.
      if (client.bufferedAmount < MAX_FRAME_BYTES * 2) {
        client.send(latestFrame, { binary: true });
      }
    }
  }

  // Small response = less work for ESP32.
  res.status(204).end();
});

const server = http.createServer(app);

const wss = new WebSocketServer({
  server,
  path: "/ws",
  perMessageDeflate: false,
  maxPayload: MAX_FRAME_BYTES,
});

wss.on("connection", (ws) => {
  viewerClients.add(ws);

  // Immediately show the newest frame to a newly opened viewer.
  if (latestFrame && ws.readyState === WebSocket.OPEN) {
    ws.send(latestFrame, { binary: true });
  }

  ws.on("close", () => {
    viewerClients.delete(ws);
  });

  ws.on("error", (err) => {
    console.error("WebSocket viewer error:", err.message);
    viewerClients.delete(ws);
  });
});

// Heartbeat: kill dead browser sockets.
const heartbeat = setInterval(() => {
  for (const ws of viewerClients) {
    if (ws.isAlive === false) {
      viewerClients.delete(ws);
      ws.terminate();
      continue;
    }

    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`ESP32-CAM relay listening on port ${PORT}`);
  console.log(`POST JPEG frames to http://<server>:${PORT}/upload`);
  console.log(`Browser WebSocket: ws://<server>:${PORT}/ws`);
});

function shutdown() {
  clearInterval(heartbeat);

  for (const ws of viewerClients) {
    try {
      ws.close(1001, "Server shutting down");
    } catch (_) {}
  }

  server.close(() => process.exit(0));

  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
