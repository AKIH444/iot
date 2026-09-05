const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 10000;

// ---------------------------------------------------------
// SETTINGS
// ---------------------------------------------------------

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------
// WEBSOCKET SERVER
// ---------------------------------------------------------

const wss = new WebSocket.Server({
    server: server,
    path: "/ws"
});

let cameraSocket = null;
let latestFrame = null;
let lastFrameTime = 0;

let cameraStatus = {
    connected: false,
    ip: "",
    lastFrame: 0,
    xclk: 0,
    pixformat: 0,
    framesize: 0,
    quality: 0,
    brightness: 0,
    contrast: 0,
    saturation: 0,
    sharpness: 0,
    special_effect: 0,
    wb_mode: 0,
    awb: 0,
    awb_gain: 0,
    aec: 0,
    aec2: 0,
    ae_level: 0,
    aec_value: 0,
    agc: 0,
    agc_gain: 0,
    gainceiling: 0,
    bpc: 0,
    wpc: 0,
    raw_gma: 0,
    lenc: 0,
    hmirror: 0,
    vflip: 0,
    dcw: 0,
    colorbar: 0,
    led_intensity: 0
};

// ---------------------------------------------------------
// WEBSOCKET CONNECTION
// ---------------------------------------------------------

wss.on("connection", (ws, req) => {

    const url = new URL(req.url, `http://${req.headers.host}`);
    const role = url.searchParams.get("role");

    console.log("WebSocket connection");

    // -----------------------------------------------------
    // CAMERA CONNECTION
    // -----------------------------------------------------

    if (role === "camera") {

        console.log("Camera attempting connection");

        // IMPORTANT:
        // If an old camera socket still exists,
        // close it instead of rejecting the new camera.
        if (cameraSocket && cameraSocket !== ws) {

            console.log("Closing old camera connection");

            try {
                cameraSocket.terminate();
            } catch (e) {
                console.log("Old camera termination error:", e.message);
            }

            cameraSocket = null;
        }

        cameraSocket = ws;

        cameraStatus.connected = true;

        if (req.socket.remoteAddress) {
            cameraStatus.ip = req.socket.remoteAddress;
        }

        console.log("Camera connected");

        ws.send(JSON.stringify({
            type: "server",
            message: "camera_connected"
        }));

        ws.on("message", (data, isBinary) => {

            // -------------------------------------------------
            // BINARY DATA = JPEG FRAME
            // -------------------------------------------------

            if (isBinary || Buffer.isBuffer(data)) {

                const buffer = Buffer.from(data);

                // Basic JPEG validation
                if (
                    buffer.length >= 4 &&
                    buffer[0] === 0xFF &&
                    buffer[1] === 0xD8 &&
                    buffer[buffer.length - 2] === 0xFF &&
                    buffer[buffer.length - 1] === 0xD9
                ) {

                    latestFrame = buffer;
                    lastFrameTime = Date.now();

                    cameraStatus.lastFrame = lastFrameTime;
                }

                return;
            }

            // -------------------------------------------------
            // TEXT MESSAGE
            // -------------------------------------------------

            try {

                const message = JSON.parse(data.toString());

                // Camera status response
                if (message.type === "status") {

                    cameraStatus = {
                        ...cameraStatus,
                        ...message
                    };

                    cameraStatus.connected = true;
                    cameraStatus.lastFrame = lastFrameTime;

                    return;
                }

                // Generic message
                console.log("Camera message:", message);

            } catch (error) {

                console.log(
                    "Invalid camera message:",
                    data.toString()
                );
            }
        });

        ws.on("close", () => {

            console.log("Camera WebSocket closed");

            // Only clear it if this is still
            // the active camera socket.
            if (cameraSocket === ws) {

                cameraSocket = null;
                cameraStatus.connected = false;

                console.log("Camera marked offline");
            }
        });

        ws.on("error", (error) => {

            console.log(
                "Camera WebSocket error:",
                error.message
            );
        });

        return;
    }

    // -----------------------------------------------------
    // UNKNOWN ROLE
    // -----------------------------------------------------

    console.log("Unknown WebSocket role:", role);

    ws.close();
});

// ---------------------------------------------------------
// SEND COMMAND TO ESP32
// ---------------------------------------------------------

function sendCameraCommand(command) {

    if (!cameraSocket) {
        return {
            success: false,
            error: "Camera not connected"
        };
    }

    if (cameraSocket.readyState !== WebSocket.OPEN) {

        return {
            success: false,
            error: "Camera WebSocket not open"
        };
    }

    try {

        cameraSocket.send(
            JSON.stringify(command)
        );

        return {
            success: true
        };

    } catch (error) {

        return {
            success: false,
            error: error.message
        };
    }
}

// ---------------------------------------------------------
// HOME PAGE
// ---------------------------------------------------------

app.get("/", (req, res) => {

    res.send(`
<!DOCTYPE html>
<html>
<head>

<meta charset="UTF-8">

<title>ESP32-CAM Control</title>

<style>

body {
    font-family: Arial, sans-serif;
    background: #111;
    color: white;
    margin: 0;
    padding: 20px;
}

h1 {
    margin-top: 0;
}

h2 {
    border-bottom: 1px solid #444;
    padding-bottom: 8px;
}

.container {
    max-width: 1200px;
    margin: auto;
}

.video {
    width: 100%;
    max-width: 800px;
    background: black;
    display: block;
    margin-bottom: 20px;
}

.status {
    padding: 12px;
    background: #222;
    margin-bottom: 20px;
}

.connected {
    color: #00ff88;
}

.disconnected {
    color: #ff4444;
}

.section {
    background: #1c1c1c;
    padding: 15px;
    margin-bottom: 15px;
    border-radius: 8px;
}

.control {
    display: grid;
    grid-template-columns: 220px 1fr 100px;
    gap: 10px;
    align-items: center;
    margin: 8px 0;
}

input,
select,
button {
    padding: 8px;
    border-radius: 4px;
    border: none;
}

input[type="range"] {
    width: 100%;
}

button {
    cursor: pointer;
    background: #333;
    color: white;
}

button:hover {
    background: #555;
}

pre {
    background: #000;
    padding: 10px;
    overflow-x: auto;
}

@media(max-width:700px) {

    .control {
        grid-template-columns: 1fr;
    }

}

</style>

</head>

<body>

<div class="container">

<h1>ESP32-CAM Control</h1>

<div class="status">

Camera:

<strong id="connection">Checking...</strong>

<br>

Last frame:

<span id="lastFrame">-</span>

</div>

<img
    id="stream"
    class="video"
    src="/stream"
>

<div class="section">

<h2>Camera Settings</h2>

<div class="control">
<label>Frame Size</label>

<select id="framesize">
<option value="0">96x96</option>
<option value="1">QQVGA 160x120</option>
<option value="2">QCIF 176x144</option>
<option value="3">HQVGA 240x176</option>
<option value="4">QVGA 320x240</option>
<option value="5">CIF 400x296</option>
<option value="6">HVGA 480x320</option>
<option value="7">VGA 640x480</option>
<option value="8">SVGA 800x600</option>
<option value="9">XGA 1024x768</option>
<option value="10">HD 1280x720</option>
<option value="11">SXGA 1280x1024</option>
<option value="12">UXGA 1600x1200</option>
</select>

<button onclick="setControl('framesize')">
Apply
</button>
</div>

<div class="control">
<label>JPEG Quality</label>
<input id="quality" type="range" min="10" max="63" value="10">
<span id="qualityValue">10</span>
</div>

<div class="control">
<label>Brightness</label>
<input id="brightness" type="range" min="-2" max="2" value="0">
<span id="brightnessValue">0</span>
</div>

<div class="control">
<label>Contrast</label>
<input id="contrast" type="range" min="-2" max="2" value="0">
<span id="contrastValue">0</span>
</div>

<div class="control">
<label>Saturation</label>
<input id="saturation" type="range" min="-2" max="2" value="0">
<span id="saturationValue">0</span>
</div>

<div class="control">
<label>Gain Ceiling</label>

<select id="gainceiling">

<option value="0">2X</option>
<option value="1">4X</option>
<option value="2">8X</option>
<option value="3">16X</option>
<option value="4">32X</option>
<option value="5">64X</option>
<option value="6">128X</option>

</select>

<button onclick="setControl('gainceiling')">
Apply
</button>
</div>

<div class="control">
<label>Special Effect</label>

<select id="special_effect">

<option value="0">No Effect</option>
<option value="1">Negative</option>
<option value="2">Grayscale</option>
<option value="3">Red Tint</option>
<option value="4">Green Tint</option>
<option value="5">Blue Tint</option>
<option value="6">Sepia</option>

</select>

<button onclick="setControl('special_effect')">
Apply
</button>
</div>

<div class="control">
<label>White Balance Mode</label>

<select id="wb_mode">

<option value="0">Auto</option>
<option value="1">Sunny</option>
<option value="2">Cloudy</option>
<option value="3">Office</option>
<option value="4">Home</option>

</select>

<button onclick="setControl('wb_mode')">
Apply
</button>
</div>

<div class="control">
<label>AE Level</label>
<input id="ae_level" type="range" min="-2" max="2" value="0">
<span id="ae_levelValue">0</span>
</div>

<div class="control">
<label>AGC Gain</label>
<input id="agc_gain" type="range" min="0" max="30" value="0">
<span id="agc_gainValue">0</span>
</div>

<div class="control">
<label>AEC Value</label>
<input id="aec_value" type="range" min="0" max="1200" value="300">
<span id="aec_valueValue">300</span>
</div>

<div class="control">
<label>LED Intensity</label>
<input id="led_intensity" type="range" min="0" max="255" value="0">
<span id="led_intensityValue">0</span>
</div>

</div>

<div class="section">

<h2>Image Controls</h2>

${[
    ["colorbar", "Color Bar"],
    ["awb", "Auto White Balance"],
    ["awb_gain", "AWB Gain"],
    ["agc", "Auto Gain Control"],
    ["aec", "Auto Exposure"],
    ["aec2", "AEC DSP"],
    ["hmirror", "Horizontal Mirror"],
    ["vflip", "Vertical Flip"],
    ["dcw", "DCW"],
    ["bpc", "Black Pixel Correction"],
    ["wpc", "White Pixel Correction"],
    ["raw_gma", "Raw Gamma"],
    ["lenc", "Lens Correction"]
].map(([id, label]) => `

<div class="control">

<label>${label}</label>

<select id="${id}">

<option value="0">OFF</option>
<option value="1">ON</option>

</select>

<button onclick="setControl('${id}')">
Apply
</button>

</div>

`).join("")}

</div>

<div class="section">

<h2>XCLK</h2>

<div class="control">

<label>XCLK Frequency</label>

<select id="xclk">

<option value="10">10 MHz</option>
<option value="20">20 MHz</option>

</select>

<button onclick="setXclk()">
Apply
</button>

</div>

</div>

<div class="section">

<h2>Advanced Sensor Register</h2>

<div class="control">

<label>Register</label>

<input id="reg" placeholder="Register">

</div>

<div class="control">

<label>Mask</label>

<input id="regMask" placeholder="Mask">

</div>

<div class="control">

<label>Value</label>

<input id="regValue" placeholder="Value">

</div>

<button onclick="setRegister()">
Write Register
</button>

<button onclick="getRegister()">
Read Register
</button>

<pre id="registerResult"></pre>

</div>

<div class="section">

<h2>PLL</h2>

<div class="control">
<label>Bypass</label>
<input id="pll_bypass" type="number" value="0">
</div>

<div class="control">
<label>Multiplier</label>
<input id="pll_multiplier" type="number" value="0">
</div>

<div class="control">
<label>Sys Divider</label>
<input id="pll_sys" type="number" value="0">
</div>

<div class="control">
<label>Root Divider</label>
<input id="pll_root" type="number" value="0">
</div>

<div class="control">
<label>Pre Divider</label>
<input id="pll_pre" type="number" value="0">
</div>

<div class="control">
<label>PLL Divider</label>
<input id="pll_pll" type="number" value="0">
</div>

<button onclick="setPLL()">
Apply PLL
</button>

</div>

<div class="section">

<h2>Raw Sensor Resolution</h2>

<div class="control">
<label>Start X</label>
<input id="res_start_x" type="number" value="0">
</div>

<div class="control">
<label>Start Y</label>
<input id="res_start_y" type="number" value="0">
</div>

<div class="control">
<label>End X</label>
<input id="res_end_x" type="number" value="0">
</div>

<div class="control">
<label>End Y</label>
<input id="res_end_y" type="number" value="0">
</div>

<div class="control">
<label>Offset X</label>
<input id="res_offset_x" type="number" value="0">
</div>

<div class="control">
<label>Offset Y</label>
<input id="res_offset_y" type="number" value="0">
</div>

<div class="control">
<label>Output Width</label>
<input id="res_width" type="number" value="0">
</div>

<div class="control">
<label>Output Height</label>
<input id="res_height" type="number" value="0">
</div>

<div class="control">
<label>Scale</label>
<input id="res_scale" type="number" value="0">
</div>

<div class="control">
<label>Bin</label>
<input id="res_bin" type="number" value="0">
</div>

<button onclick="setResolution()">
Apply Resolution
</button>

</div>

<div class="section">

<h2>Actions</h2>

<button onclick="capture()">
Capture Photo
</button>

<button onclick="getStatus()">
Refresh Status
</button>

<pre id="status"></pre>

</div>

</div>

<script>

const controls = [
    "quality",
    "brightness",
    "contrast",
    "saturation",
    "ae_level",
    "agc_gain",
    "aec_value",
    "led_intensity"
];

controls.forEach(id => {

    const element = document.getElementById(id);
    const output = document.getElementById(id + "Value");

    if (element && output) {

        element.addEventListener("input", () => {
            output.textContent = element.value;
        });

    }

});

async function setControl(variable) {

    const element =
        document.getElementById(variable);

    if (!element) return;

    const value = element.value;

    try {

        const response = await fetch(
            "/control?var=" +
            encodeURIComponent(variable) +
            "&val=" +
            encodeURIComponent(value)
        );

        const result = await response.json();

        console.log(result);

    } catch (error) {

        console.error(error);

    }
}

async function setXclk() {

    const value =
        document.getElementById("xclk").value;

    const response = await fetch(
        "/xclk?xclk=" + value
    );

    console.log(await response.json());
}

async function setRegister() {

    const reg =
        document.getElementById("reg").value;

    const mask =
        document.getElementById("regMask").value;

    const val =
        document.getElementById("regValue").value;

    const response = await fetch(
        "/reg?reg=" +
        encodeURIComponent(reg) +
        "&mask=" +
        encodeURIComponent(mask) +
        "&val=" +
        encodeURIComponent(val)
    );

    document.getElementById(
        "registerResult"
    ).textContent =
        JSON.stringify(
            await response.json(),
            null,
            2
        );
}

async function getRegister() {

    const reg =
        document.getElementById("reg").value;

    const mask =
        document.getElementById("regMask").value;

    const response = await fetch(
        "/greg?reg=" +
        encodeURIComponent(reg) +
        "&mask=" +
        encodeURIComponent(mask)
    );

    document.getElementById(
        "registerResult"
    ).textContent =
        JSON.stringify(
            await response.json(),
            null,
            2
        );
}

async function setPLL() {

    const params = new URLSearchParams({

        bypass:
            document.getElementById("pll_bypass").value,

        multiplier:
            document.getElementById("pll_multiplier").value,

        sys:
            document.getElementById("pll_sys").value,

        root:
            document.getElementById("pll_root").value,

        pre:
            document.getElementById("pll_pre").value,

        pll:
            document.getElementById("pll_pll").value
    });

    const response =
        await fetch("/pll?" + params);

    console.log(await response.json());
}

async function setResolution() {

    const params = new URLSearchParams({

        start_x:
            document.getElementById("res_start_x").value,

        start_y:
            document.getElementById("res_start_y").value,

        end_x:
            document.getElementById("res_end_x").value,

        end_y:
            document.getElementById("res_end_y").value,

        offset_x:
            document.getElementById("res_offset_x").value,

        offset_y:
            document.getElementById("res_offset_y").value,

        width:
            document.getElementById("res_width").value,

        height:
            document.getElementById("res_height").value,

        scale:
            document.getElementById("res_scale").value,

        bin:
            document.getElementById("res_bin").value
    });

    const response =
        await fetch("/resolution?" + params);

    console.log(await response.json());
}

async function getStatus() {

    try {

        const response =
            await fetch("/status");

        const data =
            await response.json();

        document.getElementById(
            "status"
        ).textContent =
            JSON.stringify(
                data,
                null,
                2
            );

        document.getElementById(
            "connection"
        ).textContent =
            data.connected
                ? "CONNECTED"
                : "DISCONNECTED";

        document.getElementById(
            "connection"
        ).className =
            data.connected
                ? "connected"
                : "disconnected";

        if (data.lastFrame) {

            document.getElementById(
                "lastFrame"
            ).textContent =
                new Date(
                    data.lastFrame
                ).toLocaleTimeString();

        }

    } catch (error) {

        console.error(error);

    }
}

async function capture() {

    window.open(
        "/capture",
        "_blank"
    );

}

setInterval(
    getStatus,
    3000
);

getStatus();

</script>

</body>
</html>
    `);
});

// ---------------------------------------------------------
// MJPEG STREAM
// ---------------------------------------------------------

app.get("/stream", (req, res) => {

    res.writeHead(200, {
        "Content-Type":
            "multipart/x-mixed-replace; boundary=frame",

        "Cache-Control":
            "no-cache, no-store, must-revalidate",

        "Pragma": "no-cache",

        "Connection": "close"
    });

    const interval = setInterval(() => {

        if (!latestFrame) {
            return;
        }

        try {

            res.write(
                "--frame\r\n" +
                "Content-Type: image/jpeg\r\n" +
                "Content-Length: " +
                latestFrame.length +
                "\r\n\r\n"
            );

            res.write(latestFrame);
            res.write("\r\n");

        } catch (error) {

            clearInterval(interval);

        }

    }, 100);

    req.on("close", () => {

        clearInterval(interval);

    });
});

// ---------------------------------------------------------
// CAPTURE
// ---------------------------------------------------------

app.get("/capture", (req, res) => {

    if (!latestFrame) {

        return res.status(503).json({
            error: "No frame available"
        });

    }

    res.set({
        "Content-Type": "image/jpeg",
        "Content-Length": latestFrame.length,
        "Cache-Control": "no-cache"
    });

    res.send(latestFrame);
});

// ---------------------------------------------------------
// STATUS
// ---------------------------------------------------------

app.get("/status", (req, res) => {

    res.json({
        ...cameraStatus,

        connected:
            cameraSocket !== null &&
            cameraSocket.readyState === WebSocket.OPEN,

        lastFrame:
            lastFrameTime,

        frameAge:
            lastFrameTime
                ? Date.now() - lastFrameTime
                : null
    });
});

// ---------------------------------------------------------
// CONTROL
// ---------------------------------------------------------

app.get("/control", (req, res) => {

    const variable = req.query.var;
    const value = Number(req.query.val);

    if (!variable || Number.isNaN(value)) {

        return res.status(400).json({
            success: false,
            error: "Invalid var or val"
        });

    }

    const allowed = [

        "framesize",
        "quality",
        "contrast",
        "brightness",
        "saturation",
        "gainceiling",
        "colorbar",
        "awb",
        "agc",
        "aec",
        "hmirror",
        "vflip",
        "awb_gain",
        "agc_gain",
        "aec_value",
        "aec2",
        "dcw",
        "bpc",
        "wpc",
        "raw_gma",
        "lenc",
        "special_effect",
        "wb_mode",
        "ae_level",
        "led_intensity"

    ];

    if (!allowed.includes(variable)) {

        return res.status(400).json({
            success: false,
            error: "Unknown camera variable"
        });

    }

    const result = sendCameraCommand({
        type: "control",
        var: variable,
        val: value
    });

    res.json(result);
});

// ---------------------------------------------------------
// XCLK
// ---------------------------------------------------------

app.get("/xclk", (req, res) => {

    const xclk =
        Number(req.query.xclk);

    if (Number.isNaN(xclk)) {

        return res.status(400).json({
            success: false,
            error: "Invalid XCLK"
        });

    }

    const result =
        sendCameraCommand({
            type: "xclk",
            xclk: xclk
        });

    res.json(result);
});

// ---------------------------------------------------------
// SENSOR REGISTER WRITE
// ---------------------------------------------------------

app.get("/reg", (req, res) => {

    const reg =
        Number(req.query.reg);

    const mask =
        Number(req.query.mask);

    const val =
        Number(req.query.val);

    if (
        Number.isNaN(reg) ||
        Number.isNaN(mask) ||
        Number.isNaN(val)
    ) {

        return res.status(400).json({
            success: false,
            error: "Invalid register values"
        });

    }

    const result =
        sendCameraCommand({

            type: "reg",

            reg: reg,

            mask: mask,

            val: val
        });

    res.json(result);
});

// ---------------------------------------------------------
// SENSOR REGISTER READ
// ---------------------------------------------------------

app.get("/greg", (req, res) => {

    const reg =
        Number(req.query.reg);

    const mask =
        Number(req.query.mask);

    if (
        Number.isNaN(reg) ||
        Number.isNaN(mask)
    ) {

        return res.status(400).json({
            success: false,
            error: "Invalid register values"
        });

    }

    const result =
        sendCameraCommand({

            type: "greg",

            reg: reg,

            mask: mask
        });

    res.json(result);
});

// ---------------------------------------------------------
// PLL
// ---------------------------------------------------------

app.get("/pll", (req, res) => {

    const command = {

        type: "pll",

        bypass:
            Number(req.query.bypass || 0),

        multiplier:
            Number(req.query.multiplier || 0),

        sys:
            Number(req.query.sys || 0),

        root:
            Number(req.query.root || 0),

        pre:
            Number(req.query.pre || 0),

        pll:
            Number(req.query.pll || 0)
    };

    const result =
        sendCameraCommand(command);

    res.json(result);
});

// ---------------------------------------------------------
// RAW RESOLUTION
// ---------------------------------------------------------

app.get("/resolution", (req, res) => {

    const command = {

        type: "resolution",

        start_x:
            Number(req.query.start_x || 0),

        start_y:
            Number(req.query.start_y || 0),

        end_x:
            Number(req.query.end_x || 0),

        end_y:
            Number(req.query.end_y || 0),

        offset_x:
            Number(req.query.offset_x || 0),

        offset_y:
            Number(req.query.offset_y || 0),

        width:
            Number(req.query.width || 0),

        height:
            Number(req.query.height || 0),

        scale:
            Number(req.query.scale || 0),

        bin:
            Number(req.query.bin || 0)
    };

    const result =
        sendCameraCommand(command);

    res.json(result);
});

// ---------------------------------------------------------
// HEALTH CHECK
// ---------------------------------------------------------

app.get("/health", (req, res) => {

    res.json({
        status: "ok",

        camera:
            cameraSocket !== null &&
            cameraSocket.readyState === WebSocket.OPEN,

        frame:
            latestFrame !== null,

        uptime:
            process.uptime()
    });
});

// ---------------------------------------------------------
// START SERVER
// ---------------------------------------------------------

server.listen(PORT, "0.0.0.0", () => {

    console.log(
        `Server running on port ${PORT}`
    );

});
