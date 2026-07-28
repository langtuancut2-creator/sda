# SDA Export Server

Prerequisites:
- Node 18+
- ffmpeg installed and available in PATH (`ffmpeg -version`). Install via `sudo apt install ffmpeg` or `brew install ffmpeg`.

Install & run:
```bash
cd server
npm install
node server.js
```
Server listens default port 4000. You can set `PORT` env var.

Test with curl:
```bash
curl -X POST "http://localhost:4000/api/video/export" -F "video=@/path/to/input.mp4" -F "subtitle=@/path/to/subtitle.srt" --output exported.mp4
```
