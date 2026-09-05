const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 10000;

// =====================================================
// CAMERA STATE
// =====================================================

let cameraSocket = null;
let latestFrame = null;

const viewers = new Set();

// =====================================================
// BASIC HTTP
// =====================================================

app.get("/", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>ESP32 Camera Server</title>
        </head>

        <body>
            <h1>ESP32 Camera Server</h1>

            <p>Server is running.</p>

            <p>
                Camera stream:
                <a href="/stream">/stream</a>
            </p>

            <p>
                Health:
                <a href="/health">/health</a>
            </p>
        </body>
        </html>
    `);
});

// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/health", (req, res) => {

    res.json({
        status: "ok",
        cameraConnected:
            cameraSocket !== null &&
            cameraSocket.readyState === WebSocket.OPEN,
        viewers: viewers.size
    });

});

// =====================================================
// MJPEG STREAM
// =====================================================

app.get("/stream", (req, res) => {

    console.log("Viewer connected");

    res.writeHead(200, {
        "Content-Type":
            "multipart/x-mixed-replace; boundary=frame",

        "Cache-Control":
            "no-cache, no-store, must-revalidate",

        "Pragma": "no-cache",

        "Connection": "close",

        "Access-Control-Allow-Origin": "*"
    });

    viewers.add(res);

    // Send latest frame immediately
    if (latestFrame) {
        sendFrame(res, latestFrame);
    }

    req.on("close", () => {

        console.log("Viewer disconnected");

        viewers.delete(res);

    });

});

// =====================================================
// SEND JPEG FRAME
// =====================================================

function sendFrame(res, frame) {

    try {

        res.write(
            "--frame\r\n" +
            "Content-Type: image/jpeg\r\n" +
            "Content-Length: " +
            frame.length +
            "\r\n\r\n"
        );

        res.write(frame);

        res.write("\r\n");

    } catch (error) {

        console.log("Viewer write error");

        viewers.delete(res);

    }

}

// =====================================================
// WEBSOCKET SERVER
// =====================================================

const wss = new WebSocket.Server({
    server: server,
    path: "/ws"
});

wss.on("connection", (ws, req) => {

    console.log("WebSocket connection");

    // =================================================
    // NEW CAMERA CONNECTION
    // =================================================

    if (cameraSocket !== null) {

        console.log(
            "Replacing old camera connection"
        );

        try {

            cameraSocket.close(
                1000,
                "Replaced by new connection"
            );

        } catch (error) {

            console.log(
                "Error closing old camera"
            );

        }

        cameraSocket = null;
    }

    // New connection becomes camera
    cameraSocket = ws;

    console.log("ESP32-CAM connected");

    // =================================================
    // RECEIVE DATA
    // =================================================

    ws.on("message", (data, isBinary) => {

        if (!isBinary) {

            console.log(
                "Camera message:",
                data.toString()
            );

            return;
        }

        // ---------------------------------------------
        // JPEG frame
        // ---------------------------------------------

        latestFrame = Buffer.from(data);

        // Send to all viewers
        for (const viewer of viewers) {

            sendFrame(
                viewer,
                latestFrame
            );

        }

    });

    // =================================================
    // DISCONNECTED
    // =================================================

    ws.on("close", () => {

        console.log(
            "ESP32-CAM WebSocket closed"
        );

        // Only clear cameraSocket if THIS
        // connection is still the active one.

        if (cameraSocket === ws) {

            cameraSocket = null;

            console.log(
                "Camera connection cleared"
            );

        }

    });

    // =================================================
    // ERROR
    // =================================================

    ws.on("error", (error) => {

        console.log(
            "WebSocket error:",
            error.message
        );

        if (cameraSocket === ws) {

            cameraSocket = null;

        }

    });

});

// =====================================================
// WEBSOCKET HEARTBEAT
// =====================================================

setInterval(() => {

    wss.clients.forEach((ws) => {

        if (ws.readyState === WebSocket.OPEN) {

            ws.ping();

        }

    });

}, 30000);

// =====================================================
// START SERVER
// =====================================================

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Server running on port ${PORT}`
        );

    }
);
