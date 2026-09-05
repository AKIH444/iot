const WebSocket = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');

const PORT = process.env.PORT || 8080;
const RTMP_URL = process.env.RTMP_URL; // e.g., rtmp://a.rtmp.youtube.com/live2/your-key

if (!RTMP_URL) {
  console.error('RTMP_URL environment variable is required');
  process.exit(1);
}

const wss = new WebSocket.Server({ port: PORT });
console.log(`WebSocket server listening on port ${PORT}`);

let ffmpeg = null;
let frameCount = 0;

function startFFmpeg() {
  const args = [
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-i', '-',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-pix_fmt', 'yuv420p',
    '-f', 'flv',
    RTMP_URL
  ];

  ffmpeg = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });

  ffmpeg.stdin.on('error', (err) => console.error('FFmpeg stdin error:', err));
  ffmpeg.stderr.on('data', (data) => {
    // Log only if verbose
    if (process.env.DEBUG) console.error(`FFmpeg: ${data}`);
  });
  ffmpeg.on('close', (code) => {
    console.log(`FFmpeg process exited with code ${code}`);
    ffmpeg = null;
  });
}

wss.on('connection', (ws) => {
  console.log('ESP32 connected');
  if (!ffmpeg) startFFmpeg();

  ws.on('message', (data) => {
    if (ffmpeg && ffmpeg.stdin.writable) {
      ffmpeg.stdin.write(data);
      frameCount++;
      if (frameCount % 100 === 0) console.log(`Frames processed: ${frameCount}`);
    }
  });

  ws.on('close', () => {
    console.log('ESP32 disconnected');
  });
});

// Keep FFmpeg alive even if no connection (optional)
setInterval(() => {
  if (!ffmpeg) startFFmpeg();
}, 5000);
