// server.js

const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {

    // --------------------------------------------------------
    // CORS
    // --------------------------------------------------------

    res.setHeader(
        "Access-Control-Allow-Origin",
        "*"
    );

    res.setHeader(
        "Cache-Control",
        "no-cache, no-store, must-revalidate"
    );


    // --------------------------------------------------------
    // STATUS
    // --------------------------------------------------------

    if (req.url === "/status") {

        const uptime = process.uptime();

        res.writeHead(
            200,
            {
                "Content-Type":
                    "application/json"
            }
        );

        res.end(
            JSON.stringify({
                online: true,
                cameraConnected:
                    cameraSocket !== null,
                uptime: uptime,
                frames: framesReceived,
                fps: currentFPS
            })
        );

        return;
    }


    // --------------------------------------------------------
    // MJPEG STREAM
    // --------------------------------------------------------

    if (req.url === "/stream") {

        res.writeHead(
            200,
            {
                "Content-Type":
                    "multipart/x-mixed-replace; boundary=frame",

                "Cache-Control":
                    "no-cache, no-store, must-revalidate",

                "Pragma":
                    "no-cache",

                "Access-Control-Allow-Origin":
                    "*",

                "Connection":
                    "keep-alive"
            }
        );


        streamClients.add(res);


        req.on(
            "close",
            () => {

                streamClients.delete(res);

            }
        );


        return;
    }


    // --------------------------------------------------------
    // HOME
    // --------------------------------------------------------

    if (
        req.url === "/" ||
        req.url === "/index.html"
    ) {

        res.writeHead(
            200,
            {
                "Content-Type":
                    "text/html"
            }
        );

        res.end(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>ESP32-CAM</title>

<style>

body {
    margin: 0;
    background: #111;
    color: white;
    font-family: Arial, sans-serif;
    text-align: center;
}

h1 {
    margin: 20px;
}

img {
    max-width: 95vw;
    max-height: 85vh;
    object-fit: contain;
}

</style>

</head>

<body>

<h1>ESP32-CAM Live</h1>

<img src="/stream">

</body>
</html>
        `);

        return;
    }


    res.writeHead(
        404,
        {
            "Content-Type":
                "text/plain"
        }
    );

    res.end("Not found");
});


// ============================================================
// WEBSOCKET SERVER
// ============================================================

const wss = new WebSocket.Server({
    server: server
});


// Current ESP32 connection
let cameraSocket = null;


// Latest JPEG frame
let latestFrame = null;


// Connected browser clients
const streamClients = new Set();


// Statistics
let framesReceived = 0;

let currentFPS = 0;

let fpsCounter = 0;

let fpsStart = Date.now();


// ============================================================
// WEBSOCKET CONNECTION
// ============================================================

wss.on(
    "connection",
    (ws, req) => {

        console.log(
            "WebSocket client connected:",
            req.socket.remoteAddress
        );


        // Only one camera is expected.
        // If another ESP32 connects,
        // replace the previous camera.

        if (cameraSocket !== null) {

            try {
                cameraSocket.close();
            } catch (e) {}

        }


        cameraSocket = ws;


        ws.on(
            "message",
            (data, isBinary) => {

                if (!isBinary) {

                    console.log(
                        "Camera message:",
                        data.toString()
                    );

                    return;
                }


                const frame =
                    Buffer.from(data);


                if (
                    frame.length === 0
                ) {

                    return;
                }


                latestFrame = frame;


                framesReceived++;

                fpsCounter++;


                // ------------------------------------------------
                // FPS calculation
                // ------------------------------------------------

                const now = Date.now();

                const elapsed =
                    now - fpsStart;


                if (
                    elapsed >= 1000
                ) {

                    currentFPS =
                        fpsCounter /
                        (elapsed / 1000);

                    fpsCounter = 0;

                    fpsStart = now;


                    console.log(
                        "FPS:",
                        currentFPS.toFixed(1),
                        "Frame:",
                        frame.length,
                        "bytes",
                        "Viewers:",
                        streamClients.size
                    );
                }


                // ------------------------------------------------
                // Send JPEG to all browser clients
                // ------------------------------------------------

                for (
                    const client
                    of streamClients
                ) {

                    if (
                        client.destroyed
                    ) {

                        streamClients.delete(
                            client
                        );

                        continue;
                    }


                    try {

                        client.write(
                            "--frame\r\n" +
                            "Content-Type: image/jpeg\r\n" +
                            "Content-Length: " +
                            frame.length +
                            "\r\n\r\n"
                        );


                        client.write(
                            frame
                        );


                        client.write(
                            "\r\n"
                        );

                    } catch (err) {

                        streamClients.delete(
                            client
                        );
                    }
                }
            }
        );


        ws.on(
            "close",
            () => {

                console.log(
                    "WebSocket client disconnected."
                );


                if (
                    cameraSocket === ws
                ) {

                    cameraSocket = null;
                }
            }
        );


        ws.on(
            "error",
            (err) => {

                console.log(
                    "WebSocket error:",
                    err.message
                );

            }
        );


        // Tell ESP32 it is accepted
        ws.send(
            "CAMERA_CONNECTED"
        );
    }
);


// ============================================================
// SERVER
// ============================================================

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "================================="
        );

        console.log(
            "ESP32-CAM Streaming Server"
        );

        console.log(
            "================================="
        );

        console.log(
            "Port:",
            PORT
        );

        console.log(
            "Stream: /stream"
        );

        console.log(
            "Status: /status"
        );
    }
);
