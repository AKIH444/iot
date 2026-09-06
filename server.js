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
const pendingRegisters = new Map();

/* =========================
   UI
========================= */

app.get("/", (req, res) => {
res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ESP32-CAM</title>

<style>
*{box-sizing:border-box}

body{
margin:0;
font-family:Arial,sans-serif;
background:#080d18;
color:white;
}

header{
padding:18px 25px;
background:#111827;
border-bottom:1px solid #263247;
display:flex;
justify-content:space-between;
align-items:center;
}

h1{
margin:0;
font-size:22px;
}

.status{
display:flex;
align-items:center;
gap:8px;
}

.dot{
width:10px;
height:10px;
border-radius:50%;
background:#ef4444;
}

.dot.online{
background:#22c55e;
}

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
background:#111827;
border:1px solid #263247;
border-radius:14px;
padding:18px;
}

.card h2{
font-size:17px;
margin-top:0;
}

.camera{
width:100%;
background:#000;
border-radius:10px;
display:block;
min-height:300px;
object-fit:contain;
}

.stats{
display:grid;
grid-template-columns:1fr 1fr;
gap:10px;
}

.stat{
background:#1b2538;
padding:14px;
border-radius:10px;
}

.stat small{
color:#94a3b8;
}

.stat strong{
display:block;
font-size:18px;
margin-top:5px;
}

.controls{
display:grid;
grid-template-columns:1fr 1fr;
gap:12px;
}

.control{
background:#1b2538;
padding:12px;
border-radius:10px;
}

label{
display:block;
font-size:13px;
color:#94a3b8;
margin-bottom:8px;
}

input,select,button{
width:100%;
padding:9px;
border:0;
border-radius:7px;
background:#0b1220;
color:white;
}

input[type=range]{
padding:0;
}

button{
background:#2563eb;
cursor:pointer;
font-weight:bold;
}

button:hover{
background:#3b82f6;
}

.full{
grid-column:1/-1;
}

pre{
background:#050912;
padding:12px;
border-radius:8px;
overflow:auto;
max-height:250px;
font-size:12px;
}

@media(max-width:800px){
.grid{
grid-template-columns:1fr;
}

.controls{
grid-template-columns:1fr;
}
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

<img
id="stream"
class="camera"
src="/stream"
alt="Waiting for camera..."
>

</div>

<div class="card">

<h2>Camera Status</h2>

<div class="stats">

<div class="stat">
<small>Camera</small>
<strong id="camState">Offline</strong>
</div>

<div class="stat">
<small>Viewers</small>
<strong id="viewerCount">0</strong>
</div>

<div class="stat">
<small>Frame</small>
<strong id="frameSize">0 KB</strong>
</div>

<div class="stat">
<small>FPS</small>
<strong id="fps">~10</strong>
</div>

</div>

<br>

<button onclick="capture()">📸 Capture Picture</button>

</div>


<div class="card">

<h2>Image Settings</h2>

<div class="controls">

<div class="control">
<label>Frame Size</label>
<select onchange="control('framesize',this.value)">
<option value="10">QQVGA</option>
<option value="8" selected>QVGA</option>
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
onchange="control('quality',this.value)">
</div>

<div class="control">
<label>Brightness</label>
<input type="range" min="-2" max="2" value="0"
onchange="control('brightness',this.value)">
</div>

<div class="control">
<label>Contrast</label>
<input type="range" min="-2" max="2" value="0"
onchange="control('contrast',this.value)">
</div>

<div class="control">
<label>Saturation</label>
<input type="range" min="-2" max="2" value="0"
onchange="control('saturation',this.value)">
</div>

<div class="control">
<label>Sharpness</label>
<input type="range" min="-2" max="2" value="0"
onchange="control('sharpness',this.value)">
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

<h2>Advanced</h2>

<div class="controls">

<div class="control">
<label>AE Level</label>
<input type="range" min="-2" max="2" value="0"
onchange="control('ae_level',this.value)">
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

</div>
</div>


<div class="card full">

<h2>Debug</h2>

<pre id="debug">Waiting...</pre>

</div>

</div>
</div>


<script>

async function control(variable,value){

try{

const response=await fetch(
"/control?var="+
encodeURIComponent(variable)+
"&val="+
encodeURIComponent(value)
);

const data=await response.json();

console.log(data);

}catch(error){

console.error(error);

}

}


function capture(){

window.open("/capture","_blank");

}


async function updateStatus(){

try{

const response=await fetch("/status");

const data=await response.json();

const online=data.connected;

document.getElementById("dot").className=
"dot "+(online?"online":"");

document.getElementById("connection").innerText=
online?"Camera Online":"Camera Offline";

document.getElementById("camState").innerText=
online?"Online":"Offline";

document.getElementById("viewerCount").innerText=
data.viewers;

document.getElementById("frameSize").innerText=
data.frameSize
?Math.round(data.frameSize/1024)+" KB"
:"0 KB";

document.getElementById("debug").innerText=
JSON.stringify(data,null,2);

}catch(error){

document.getElementById("connection").innerText=
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

app.get("/health",(req,res)=>{

res.json({
ok:true,
camera:!!cameraSocket,
timestamp:Date.now()
});

});


app.get("/status",(req,res)=>{

res.json({

connected:!!cameraSocket,

connectedAt:cameraConnectedAt,

viewers:viewers.size,

frameSize:latestFrame
?latestFrame.length
:0,

camera:cameraStatus

});

});


/* =========================
   MJPEG STREAM
========================= */

app.get("/stream",(req,res)=>{

res.writeHead(200,{

"Content-Type":
"multipart/x-mixed-replace; boundary=frame",

"Cache-Control":
"no-cache,no-store,must-revalidate",

"Pragma":"no-cache",

"Connection":"keep-alive",

"Access-Control-Allow-Origin":"*"

});

viewers.add(res);

req.on("close",()=>{

viewers.delete(res);

});

});


/* =========================
   SEND FRAME TO VIEWERS
========================= */

function broadcastFrame(frame){

for(const viewer of viewers){

try{

viewer.write(
"--frame\r\n"+
"Content-Type: image/jpeg\r\n"+
"Content-Length: "+frame.length+
"\r\n"+
"Cache-Control: no-cache\r\n"+
"\r\n"
);

viewer.write(frame);

viewer.write("\r\n");

}catch(error){

viewers.delete(viewer);

try{
viewer.end();
}catch{}

}

}

}


/* =========================
   CAPTURE
========================= */

app.get("/capture",(req,res)=>{

if(!latestFrame){

return res
.status(503)
.send("No camera frame available");

}

res.setHeader("Content-Type","image/jpeg");

res.setHeader(
"Cache-Control",
"no-cache,no-store,must-revalidate"
);

res.send(latestFrame);

});


/* =========================
   CAMERA CONTROL
========================= */

function sendCameraCommand(command){

if(
!cameraSocket ||
cameraSocket.readyState!==WebSocket.OPEN
){

return false;

}

cameraSocket.send(JSON.stringify(command));

return true;

}


app.get("/control",(req,res)=>{

const variable=req.query.var;

const value=req.query.val;

if(!variable || value===undefined){

return res.status(400).json({
error:"Missing var or val"
});

}

const numberValue=Number(value);

const ok=sendCameraCommand({

type:"control",

var:variable,

val:Number.isNaN(numberValue)
?value
:numberValue

});

res.json({

ok,

command:{
type:"control",
var:variable,
val:numberValue
}

});

});


/* =========================
   XCLK
========================= */

app.get("/xclk",(req,res)=>{

const value=Number(
req.query.xclk ??
req.query.val
);

const ok=sendCameraCommand({

type:"control",

var:"xclk",

val:value

});

res.json({
ok,
xclk:value
});

});


/* =========================
   REGISTER
========================= */

app.get("/reg",(req,res)=>{

const reg=Number(req.query.reg);

const mask=Number(
req.query.mask ?? 255
);

const value=Number(req.query.val);

const ok=sendCameraCommand({

type:"register",

reg,

mask,

val:value

});

res.json({
ok,
reg,
mask,
val:value
});

});


/* =========================
   GET REGISTER
========================= */

app.get("/greg",(req,res)=>{

const reg=Number(req.query.reg);

const mask=Number(
req.query.mask ?? 255
);

if(
!cameraSocket ||
cameraSocket.readyState!==WebSocket.OPEN
){

return res.status(503).json({
error:"Camera offline"
});

}

const id=
Date.now().toString(36)+
Math.random().toString(36).slice(2);

const timeout=setTimeout(()=>{

pendingRegisters.delete(id);

if(!res.headersSent){

res.status(504).json({
error:"Register timeout"
});

}

},5000);

pendingRegisters.set(id,{
res,
timeout
});

cameraSocket.send(JSON.stringify({

type:"get_register",

id,

reg,

mask

}));

});


/* =========================
   PLL
========================= */

app.get("/pll",(req,res)=>{

const keys=[
"bypass",
"mul",
"sys",
"root",
"pre",
"seld5",
"pclken",
"pclk"
];

const command={
type:"pll"
};

for(const key of keys){

command[key]=Number(
req.query[key] ?? 0
);

}

const ok=sendCameraCommand(command);

res.json({
ok,
command
});

});


/* =========================
   RESOLUTION
========================= */

app.get("/resolution",(req,res)=>{

const keys=[
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

const command={
type:"resolution"
};

for(const key of keys){

command[key]=Number(
req.query[key] ?? 0
);

}

const ok=sendCameraCommand(command);

res.json({
ok,
command
});

});


/* =========================
   POST COMMAND
========================= */

app.use(express.json());

app.post("/command",(req,res)=>{

const ok=sendCameraCommand(req.body);

res.json({
ok,
command:req.body
});

});


/* =========================
   WEBSOCKET UPGRADE
========================= */

server.on("upgrade",(request,socket,head)=>{

const url=new URL(
request.url,
"http://localhost"
);

if(url.pathname!=="/ws"){

socket.destroy();

return;

}

const role=
url.searchParams.get("role")
||"viewer";

wss.handleUpgrade(
request,
socket,
head,
ws=>{

wss.emit(
"connection",
ws,
request,
role
);

});

});


/* =========================
   WEBSOCKET CONNECTION
========================= */

wss.on("connection",(ws,request,role)=>{

console.log(
"WebSocket connected:",
role
);


/* CAMERA */

if(role==="camera"){

if(
cameraSocket &&
cameraSocket.readyState===WebSocket.OPEN
){

cameraSocket.close();

}

cameraSocket=ws;

cameraConnectedAt=Date.now();

ws.send(JSON.stringify({

type:"server",

message:"camera_connected"

}));


ws.on("message",(data)=>{

/* BINARY JPEG */

if(Buffer.isBuffer(data)){

latestFrame=Buffer.from(data);

broadcastFrame(latestFrame);

return;

}


/* JSON */

try{

const message=
JSON.parse(data.toString());

console.log(
"Camera:",
message.type
);


if(message.type==="camera_status"){

cameraStatus=message;

}


if(
message.type==="register_result" ||
message.type==="greg_result"
){

const id=message.id;

if(
id &&
pendingRegisters.has(id)
){

const pending=
pendingRegisters.get(id);

clearTimeout(
pending.timeout
);

pendingRegisters.delete(id);

pending.res.json(message);

}

}

}catch(error){

console.log(
"Invalid camera JSON"
);

}

});


ws.on("close",()=>{

console.log(
"Camera disconnected"
);

if(cameraSocket===ws){

cameraSocket=null;

cameraConnectedAt=null;

}

});


ws.on("error",(error)=>{

console.log(
"Camera error:",
error.message
);

});

return;

}


/* VIEWER */

ws.send(JSON.stringify({

type:"server",

message:"viewer_connected"

}));


ws.on("close",()=>{

console.log(
"Viewer disconnected"
);

});

});


/* =========================
   SERVER
========================= */

server.listen(
PORT,
"0.0.0.0",
()=>{

console.log(
"ESP32-CAM server running"
);

console.log(
"Port:",
PORT
);

console.log(
"Stream:",
"/stream"
);

console.log(
"Capture:",
"/capture"
);

});
