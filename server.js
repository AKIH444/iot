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

// ============================================================
// BASIC
// ============================================================

app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
    res.json({
        status: "online",
        camera: cameraSocket && cameraSocket.readyState === WebSocket.OPEN,
        viewers: viewers.size
    });
});

app.get("/health", (req, res) => {
    res.status(200).send("OK");
});

// ============================================================
// CAMERA STATUS
// ============================================================

app.get("/status", (req, res) => {
    res.json({
        camera_connected:
            cameraSocket &&
            cameraSocket.readyState === WebSocket.OPEN,

        connected_at: cameraConnectedAt,

        ...cameraStatus
    });
});

// ============================================================
// MJPEG STREAM
// ============================================================

app.get("/stream", (req, res) => {
    res.writeHead(200, {
        "Content-Type":
            "multipart/x-mixed-replace; boundary=frame",
        "Cache-Control": "no-cache",
        "Connection": "close",
        "Access-Control-Allow-Origin": "*"
    });

    viewers.add(res);

    req.on("close", () => {
        viewers.delete(res);
    });
});

// ============================================================
// SINGLE CAPTURE
// ============================================================

app.get("/capture", (req, res) => {
    if (!latestFrame) {
        return res.status(503).send("No camera frame available");
    }

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Access-Control-Allow-Origin", "*");

    res.end(latestFrame);
});

// ============================================================
// SEND COMMAND TO CAMERA
// ============================================================

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

function commandResponse(res, command) {
    if (!sendCameraCommand(command)) {
        return res.status(503).json({
            error: "Camera not connected"
        });
    }

    res.json({
        success: true,
        command
    });
}

// ============================================================
// NORMAL CAMERA CONTROL
// Same style as Espressif CameraWebServer
// ============================================================

app.get("/control", (req, res) => {
    const variable = req.query.var;
    const value = Number(req.query.val);

    if (!variable || Number.isNaN(value)) {
        return res.status(400).json({
            error: "Use /control?var=brightness&val=1"
        });
    }

    return commandResponse(res, {
        type: "control",
        var: variable,
        val: value
    });
});

// ============================================================
// XCLK
// Example:
// /xclk?xclk=20
// ============================================================

app.get("/xclk", (req, res) => {
    const xclk = Number(req.query.xclk);

    if (Number.isNaN(xclk)) {
        return res.status(400).json({
            error: "Invalid xclk"
        });
    }

    return commandResponse(res, {
        type: "control",
        var: "xclk",
        val: xclk
    });
});

// ============================================================
// REGISTER WRITE
// /reg?reg=211&mask=255&val=1
// ============================================================

app.get("/reg", (req, res) => {
    const reg = Number(req.query.reg);
    const mask = Number(req.query.mask);
    const val = Number(req.query.val);

    if (
        Number.isNaN(reg) ||
        Number.isNaN(mask) ||
        Number.isNaN(val)
    ) {
        return res.status(400).json({
            error: "Invalid register parameters"
        });
    }

    return commandResponse(res, {
        type: "register",
        reg,
        mask,
        val
    });
});

// ============================================================
// REGISTER READ
// /greg?reg=211&mask=255
// ============================================================

app.get("/greg", (req, res) => {
    const reg = Number(req.query.reg);
    const mask = Number(req.query.mask);

    if (
        Number.isNaN(reg) ||
        Number.isNaN(mask)
    ) {
        return res.status(400).json({
            error: "Invalid register parameters"
        });
    }

    if (
        !cameraSocket ||
        cameraSocket.readyState !== WebSocket.OPEN
    ) {
        return res.status(503).json({
            error: "Camera not connected"
        });
    }

    const requestId = Date.now().toString();

    const handler = (data) => {
        try {
            const message = JSON.parse(data.toString());

            if (
                message.type === "register_result" &&
                Number(message.reg) === reg &&
                Number(message.mask) === mask
            ) {
                clearTimeout(timeout);
                cameraSocket.off("message", handler);

                res.json(message);
            }
        } catch (err) {
            // Ignore non-JSON messages
        }
    };

    const timeout = setTimeout(() => {
        if (cameraSocket) {
            cameraSocket.off("message", handler);
        }

        if (!res.headersSent) {
            res.status(504).json({
                error: "Camera register read timeout"
            });
        }
    }, 5000);

    cameraSocket.on("message", handler);

    cameraSocket.send(
        JSON.stringify({
            type: "get_register",
            reg,
            mask,
            requestId
        })
    );
});

// ============================================================
// PLL
//
// /pll?bypass=0&mul=4&sys=1&root=0&pre=0
//      &seld5=0&pclken=0&pclk=0
// ============================================================

app.get("/pll", (req, res) => {
    const params = [
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

    for (const param of params) {
        const value = Number(req.query[param]);

        if (Number.isNaN(value)) {
            return res.status(400).json({
                error: `Missing/invalid parameter: ${param}`
            });
        }

        command[param] = value;
    }

    return commandResponse(res, command);
});

// ============================================================
// RAW SENSOR WINDOW
//
// /resolution?sx=0&sy=0&ex=1600&ey=1200
// &offx=0&offy=0&tx=1600&ty=1200
// &ox=320&oy=240&scale=1&binning=1
// ============================================================

app.get("/resolution", (req, res) => {
    const params = [
        "sx",
        "sy",
        "ex",
        "ey",
        "offx",
        "offy",
        "tx",
        "ty",
        "ox",
        "oy"
    ];

    const command = {
        type: "resolution"
    };

    for (const param of params) {
        const value = Number(req.query[param]);

        if (Number.isNaN(value)) {
            return res.status(400).json({
                error: `Missing/invalid parameter: ${param}`
            });
        }

        command[param] = value;
    }

    command.scale =
        Number(req.query.scale || 0) === 1;

    command.binning =
        Number(req.query.binning || 0) === 1;

    return commandResponse(res, command);
});

// ============================================================
// DIRECT JSON COMMAND
// Useful for advanced camera controls
// ============================================================

app.post("/command", (req, res) => {
    if (!req.body || !req.body.type) {
        return res.status(400).json({
            error: "Missing command type"
        });
    }

    return commandResponse(res, req.body);
});

// ============================================================
// CAMERA WEBSOCKET
// ============================================================

server.on("upgrade", (request, socket, head) => {
    const url = new URL(
        request.url,
        `http://${request.headers.host}`
    );

    if (url.pathname !== "/ws") {
        socket.destroy();
        return;
    }

    wss.handleUpgrade(
        request,
        socket,
        head,
        (ws) => {
            wss.emit("connection", ws, request);
        }
    );
});

wss.on("connection", (ws, request) => {
    const url = new URL(
        request.url,
        `http://${request.headers.host}`
    );

    const role = url.searchParams.get("role");

    // ========================================================
    // CAMERA
    // ========================================================

    if (role === "camera") {

        // Kill previous stale camera connection
        if (
            cameraSocket &&
            cameraSocket.readyState === WebSocket.OPEN
        ) {
            try {
                cameraSocket.send(
                    JSON.stringify({
                        type: "server",
                        message: "replaced_by_new_camera"
                    })
                );
            } catch (e) {}

            try {
                cameraSocket.close();
            } catch (e) {}
        }

        cameraSocket = ws;
        cameraConnectedAt = new Date().toISOString();

        console.log("Camera connected");

        ws.send(
            JSON.stringify({
                type: "server",
                message: "camera_connected"
            })
        );

        ws.on("message", (data, isBinary) => {

            // ==================================================
            // JPEG FRAME
            // ==================================================

            if (isBinary || Buffer.isBuffer(data)) {

                latestFrame = Buffer.from(data);

                const header =
                    Buffer.from(
                        "--frame\r\n" +
                        "Content-Type: image/jpeg\r\n" +
                        "Content-Length: " +
                        latestFrame.length +
                        "\r\n\r\n"
                    );

                const footer =
                    Buffer.from("\r\n");

                for (const viewer of viewers) {

                    try {
                        viewer.write(header);
                        viewer.write(latestFrame);
                        viewer.write(footer);
                    } catch (err) {
                        viewers.delete(viewer);

                        try {
                            viewer.end();
                        } catch (e) {}
                    }
                }

                return;
            }

            // ==================================================
            // CAMERA JSON MESSAGE
            // ==================================================

            try {
                const message =
                    JSON.parse(data.toString());

                console.log(
                    "Camera message:",
                    message
                );

                if (message.type === "status") {
                    cameraStatus = {
                        ...cameraStatus,
                        ...message
                    };
                }

            } catch (err) {
                console.log(
                    "Invalid camera JSON:",
                    err.message
                );
            }
        });

        ws.on("close", () => {

            if (cameraSocket === ws) {
                cameraSocket = null;
                cameraConnectedAt = null;

                console.log("Camera disconnected");
            }
        });

        ws.on("error", (err) => {
            console.log(
                "Camera WebSocket error:",
                err.message
            );

            if (cameraSocket === ws) {
                cameraSocket = null;
                cameraConnectedAt = null;
            }
        });

        return;
    }

    // ========================================================
    // VIEWER WEBSOCKET
    // ========================================================

    ws.send(
        JSON.stringify({
            type: "server",
            message: "viewer_connected"
        })
    );
});

// ============================================================
// START SERVER
// ============================================================

server.listen(PORT, "0.0.0.0", () => {
    console.log(
        `Server running on port ${PORT}`
    );
});
