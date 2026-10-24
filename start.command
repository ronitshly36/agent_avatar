#!/bin/bash
# Double-click to start Bolt. Keep this window open while you use it.
cd "$(dirname "$0")"
PORT=8765
URL="http://localhost:$PORT"
if curl -s -o /dev/null "$URL"; then
  open "$URL"; exit 0
fi
(sleep 1; open "$URL") &
echo "Bolt is running at $URL — close this window to stop it."
python3 -m http.server "$PORT" --bind 127.0.0.1
