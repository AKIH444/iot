const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 10000;

// ----------------------------------------------------
// HTTP server
// ----------------------------------------------------

app.get("/", (req, res) => {
    res.send(`
        <html>
        <head>
            <title>ESP32 Camera Server</title>
        </head>
        <body>
            <h1>ESP32 Camera Server</h1>
            <p>Server is running.</p>
            <p>Camera stream: <a href="/stream">/stream</a></p>
        </body>
        </html>
    `);
});

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        cameraConnected: cameraSocket !== null
    });
});

// ----------------------------------------------------
// MJPEG stream
// ----------------------------------------------------

let latestFrame = null;

const viewers = new Set();

app.get("/stream", (req, res) => {

    console.log("Viewer connected");

    res.writeHead(200, {
        "Content-Type": "multipart/x-mixed-replace; boundary=frame",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Connection": "close",
        "Access-Control-Allow-Origin": "*"
    });

    viewers.add(res);

    // Send current frame immediately
    if (latestFrame) {
        sendFrame(res, latestFrame);
    }

    req.on("close", () => {
        console.log("Viewer disconnected");
        viewers.delete(res);
    });
});

function sendFrame(res, frame) {

    try {

        res.write(
            "--frame\r\n" +
            "Content-Type: image/jpeg\r\n" +
            "Content-Length: " + frame.length + "\r\n\r\n"
        );

        res.write(frame);

        res.write("\r\n");

    } catch (error) {
        viewers.delete(res);
    }
}

// ----------------------------------------------------
// WebSocket server
// ----------------------------------------------------

const wss = new WebSocket.Server({
    server: server,
    path: "/ws"
});

let cameraSocket = null;

wss.on("connection", (ws, req) => {

    console.log("WebSocket connection");

    // Only allow one camera
    if (cameraSocket !== null) {

        console.log("Camera already connected");

        ws.close(1013, "Camera already connected");

        return;
    }

    cameraSocket = ws;

    console.log("ESP32-CAM connected");

    ws.on("message", (data, isBinary) => {

        if (!isBinary) {
            console.log("Text message:", data.toString());
            return;
        }

        // JPEG frame received
        latestFrame = Buffer.from(data);

        // Send frame to every browser
        for (const viewer of viewers) {
            sendFrame(viewer, latestFrame);
        }
    });

    ws.on("close", () => {

        console.log("ESP32-CAM disconnected");

        if (cameraSocket === ws) {
            cameraSocket = null;
        }
    });

    ws.on("error", (error) => {

        console.log("WebSocket error:", error);

        if (cameraSocket === ws) {
            cameraSocket = null;
        }
    });
});

// ----------------------------------------------------
// WebSocket heartbeat
// ----------------------------------------------------

setInterval(() => {

    wss.clients.forEach((ws) => {

        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        }

    });

}, 30000);

// ----------------------------------------------------
// Start server
// ----------------------------------------------------

server.listen(PORT, "0.0.0.0", () => {

    console.log(`Server running on port ${PORT}`);

});
