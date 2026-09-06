<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Camera Control Center</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #0f172a; color: #f8fafc; }
    .card { background-color: #1e293b; border: 1px solid #334155; }
  </style>
</head>
<body class="min-h-screen p-4 md:p-8 font-sans">
  <div class="max-w-7xl mx-auto space-y-6">
    
    <header class="flex flex-col md:flex-row justify-between items-start md:items-center p-4 rounded-xl card shadow-lg gap-4">
      <div>
        <h1 class="text-2xl font-bold text-white flex items-center gap-2">
          <span>📹</span> Camera Dashboard
        </h1>
        <p class="text-xs text-slate-400">ESP32 Stream & Hardware Control Panel</p>
      </div>
      <div class="flex items-center gap-4 text-sm">
        <div class="flex items-center gap-2">
          <span id="status-dot" class="w-3 h-3 rounded-full bg-red-500 animate-pulse"></span>
          <span id="status-text" class="font-medium text-slate-300">Disconnected</span>
        </div>
        <div class="bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300">
          Viewers: <span id="viewer-count" class="font-bold text-indigo-400">0</span>
        </div>
      </div>
    </header>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      <main class="lg:col-span-2 space-y-4">
        <div class="relative card rounded-2xl overflow-hidden shadow-2xl bg-black aspect-video flex items-center justify-center border border-slate-800">
          <img id="stream-view" src="/stream" alt="Live Camera Stream" class="w-full h-full object-contain hidden" onload="this.classList.remove('hidden')">
          <div id="stream-placeholder" class="text-center p-6">
            <svg class="w-12 h-12 text-slate-600 mx-auto mb-2 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
            <p class="text-slate-400">Waiting for live video feed...</p>
          </div>
        </div>

        <div class="flex gap-4">
          <a href="/capture" target="_blank" class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 px-4 rounded-xl text-center transition shadow-lg shadow-indigo-600/20">
            📸 Snap Photo Frame
          </a>
          <button onclick="fetchStatus()" class="bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium py-2.5 px-4 rounded-xl transition border border-slate-700">
            🔄 Refresh Status
          </button>
        </div>
      </main>

      <aside class="space-y-6">
        
        <div class="card p-5 rounded-2xl shadow-lg space-y-4">
          <h2 class="text-lg font-semibold text-white border-b border-slate-700 pb-2">Image Controls</h2>
          
          <div class="space-y-3">
            <div>
              <div class="flex justify-between text-xs text-slate-400 mb-1">
                <label for="brightness">Brightness</label>
                <span id="val-brightness">0</span>
              </div>
              <input type="range" id="brightness" min="-2" max="2" value="0" class="w-full accent-indigo-500 bg-slate-700 rounded-lg h-2 cursor-pointer" onchange="sendControl('brightness', this.value)">
            </div>

            <div>
              <div class="flex justify-between text-xs text-slate-400 mb-1">
                <label for="contrast">Contrast</label>
                <span id="val-contrast">0</span>
              </div>
              <input type="range" id="contrast" min="-2" max="2" value="0" class="w-full accent-indigo-500 bg-slate-700 rounded-lg h-2 cursor-pointer" onchange="sendControl('contrast', this.value)">
            </div>

            <div>
              <div class="flex justify-between text-xs text-slate-400 mb-1">
                <label for="saturation">Saturation</label>
                <span id="val-saturation">0</span>
              </div>
              <input type="range" id="saturation" min="-2" max="2" value="0" class="w-full accent-indigo-500 bg-slate-700 rounded-lg h-2 cursor-pointer" onchange="sendControl('saturation', this.value)">
            </div>
          </div>
        </div>

        <div class="card p-5 rounded-2xl shadow-lg space-y-4">
          <h2 class="text-lg font-semibold text-white border-b border-slate-700 pb-2">Register Operations</h2>
          <form onsubmit="handleRegister(event)" class="space-y-3">
            <div class="grid grid-cols-3 gap-2">
              <input type="number" id="reg-address" placeholder="Reg" class="bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500" required>
              <input type="number" id="reg-mask" placeholder="Mask" value="255" class="bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500" required>
              <input type="number" id="reg-val" placeholder="Val" class="bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-500">
            </div>
            <div class="flex gap-2">
              <button type="button" onclick="readRegister()" class="flex-1 bg-slate-700 hover:bg-slate-600 text-xs py-2 rounded-lg font-medium transition">Read</button>
              <button type="submit" class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-xs py-2 rounded-lg font-medium transition">Write</button>
            </div>
          </form>
          <div id="reg-result" class="text-xs font-mono p-2 bg-slate-900/50 rounded border border-slate-800 text-slate-400 min-h-[32px] break-all">Result: -</div>
        </div>

      </aside>
    </div>
  </div>

  <script>
    async function fetchStatus() {
      try {
        const res = await fetch('/status');
        const data = await res.json();
        
        const dot = document.getElementById('status-dot');
        const text = document.getElementById('status-text');
        
        if (data.camera_connected) {
          dot.className = "w-3 h-3 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50";
          text.textContent = "Camera Live";
          text.className = "font-medium text-emerald-400";
        } else {
          dot.className = "w-3 h-3 rounded-full bg-red-500 animate-pulse";
          text.textContent = "Disconnected";
          text.className = "font-medium text-slate-400";
        }
      } catch (err) {
        console.error("Failed to fetch status:", err);
      }
    }

    async function sendControl(variable, value) {
      document.getElementById(`val-${variable}`).textContent = value;
      fetch(`/control?var=${variable}&val=${value}`);
    }

    async function readRegister() {
      const reg = document.getElementById('reg-address').value;
      const mask = document.getElementById('reg-mask').value;
      const out = document.getElementById('reg-result');
      
      if (!reg || !mask) return;
      out.textContent = "Reading...";
      
      try {
        const res = await fetch(`/greg?reg=${reg}&mask=${mask}`);
        const data = await res.json();
        out.textContent = JSON.stringify(data);
      } catch (err) {
        out.textContent = "Error reading register";
      }
    }

    async function handleRegister(e) {
      e.preventDefault();
      const reg = document.getElementById('reg-address').value;
      const mask = document.getElementById('reg-mask').value;
      const val = document.getElementById('reg-val').value;
      const out = document.getElementById('reg-result');
      
      try {
        const res = await fetch(`/reg?reg=${reg}&mask=${mask}&val=${val}`);
        const data = await res.json();
        out.textContent = JSON.stringify(data);
      } catch (err) {
        out.textContent = "Error writing register";
      }
    }

    // Auto-poll status
    fetchStatus();
    setInterval(fetchStatus, 5000);
  </script>
</body>
</html>
