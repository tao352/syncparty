# 🎬 SyncParty — Ultra-Smooth Private Watch Party

An open-source, self-hosted, private alternative to **Kosmi.io**. Watch local video files or screen streams in real-time with friends over WebRTC with full playback sync, granular quality & bitrate controls, subtitles, and interactive hangout features.

---

## ✨ Features & Advantages over Kosmi

1. **Zero Upload / Local File Streaming:**
   - Drag and drop any video (`.mp4`, `.webm`, `.mkv`) from your computer directly into the player.
   - The browser streams video + audio directly via WebRTC `captureStream()` without uploading files to any cloud server.
2. **Screen & Window Sharing:**
   - Fallback option to share any desktop window (e.g. VLC player, browser tab) with system audio.
3. **Granular Quality & Bitrate Controls:**
   - Adjust resolution: **1080p (Cinema)**, **720p (Balanced)**, **480p (Saver)**.
   - Adjust framerate: **60 FPS** or **30 FPS**.
   - Dynamic Bitrate Slider: **1.5 Mbps** to **10.0 Mbps** to prevent lag or buffering on slow networks.
4. **Subtitles Support (`.srt` / `.vtt`):**
   - Drag & drop subtitle files directly over the video player.
5. **Private & Secure Rooms:**
   - Host private rooms protected by an optional **Room Passcode**.
   - Direct invite links (e.g., `http://localhost:4000/?room=my-party`).
6. **Hangout & Social:**
   - Real-time text chat with participant badges.
   - Floating emoji reactions that animate over the video stream.
   - Low-latency voice chat with **Audio Ducking** (automatically ducks video sound slightly when someone speaks).

---

## 🚀 Quick Start (Running Locally)

### 1. Run the App (Single Command)
```bash
npm start
```
Open [http://localhost:4000](http://localhost:4000) in your browser.

---

## 🌐 Inviting Friends Over the Internet (Free & Easy)

To allow friends outside your home network to join without opening router ports or buying a domain, use **Cloudflare Tunnel** (100% free and secure):

1. **Using Cloudflare Tunnel (Recommended):**
   ```bash
   npx cloudflared tunnel --url http://localhost:4000
   ```
   Cloudflare will give you a free, secure `https://xxx.trycloudflare.com` URL. Send that link to your friends!

2. **Or Using Ngrok:**
   ```bash
   npx ngrok http 4000
   ```

---

## 🛠️ Project Architecture

- **Signaling Server:** `server/server.js` (Express 5, Socket.io, WebRTC relay, in-memory room management).
- **Client Frontend:** `client/` (React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons).
- **WebRTC Engine:**
  - `client/src/hooks/useWebRTC.ts`: P2P connection handling, sender bitrate tuning (`RTCRtpSender.setParameters`), and audio ducking.
  - `client/src/hooks/useSyncEngine.ts`: Host authority timestamp heartbeat and guest drift correction.

---

## 💻 Development Mode (with Hot Reload)

To work on frontend code with instant Vite HMR:
```bash
# Terminal 1: Run Server
npm run dev:server

# Terminal 2: Run Vite Client
npm run dev:client
```
Open [http://localhost:3000](http://localhost:3000).
