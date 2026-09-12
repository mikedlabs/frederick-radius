#!/bin/bash
# ==========================================
# WILDFRAME ENGINE - ONE-CLICK LAUNCHER
# ==========================================

echo "======================================="
echo "🚀 INITIATING WILDFRAME AV ENGINE 🚀"
echo "======================================="

# 1. Kill any existing instances to prevent port conflicts
echo "[1/4] Cleaning up old processes..."
pkill -f "tsx watch src/index.ts" || true
pkill -f "vite" || true
pkill -f "python.*audio_analyzer.py" || true
pkill -f "python.*artnet_bridge.py" || true
pkill -f "python.*crowd_vision.py" || true
pkill -f "python.*llm_designer.py" || true

# Free up ports
lsof -t -i:9001 | xargs kill -9 2>/dev/null || true
lsof -t -i:9002 | xargs kill -9 2>/dev/null || true
lsof -t -i:8010 | xargs kill -9 2>/dev/null || true
lsof -t -i:3000 | xargs kill -9 2>/dev/null || true
lsof -t -i:8010 | xargs kill -9 2>/dev/null || true

# 2. Start the Node.js A9-to-Resolume Bridge (Simulated Hardware)
echo "[2/7] Booting A9-to-Resolume Bridge..."
cd /Users/miked/a9-to-resolume
npm run dev -- --simulate &
BRIDGE_PID=$!

# Wait for bridge to initialize
sleep 2

# 3. Start the React Frontend GUI
echo "[3/7] Booting Wildframe God Mode GUI..."
npm run gui:dev &
GUI_PID=$!

# Wait for GUI to initialize
sleep 2

# 4. Setup Python Virtual Environment and Start AI Audio Analyzer
echo "[4/7] Booting Intelligent Audio Analyzer..."
cd /Users/miked/Desktop/frederick-radius
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
    ./venv/bin/pip install python-osc numpy
fi
cd av_scripts
../venv/bin/python audio_analyzer.py --simulate &
ANALYZER_PID=$!

# Wait for analyzer to initialize
sleep 2

# 5. Start the Art-Net DMX Bridge
echo "[5/7] Booting Art-Net DMX Engine..."
../venv/bin/python artnet_bridge.py &
ARTNET_PID=$!

# Wait for DMX Bridge
sleep 1

# 6. Start Crowd Vision
echo "[6/7] Booting OpenCV Crowd Vision..."
../venv/bin/python crowd_vision.py &
CROWD_PID=$!

# Wait for Vision
sleep 1

# 7. Start LLM Scene Designer
echo "[7/7] Booting LLM Scene Designer..."
../venv/bin/python llm_designer.py &
LLM_PID=$!

echo "======================================="
echo "✅ WILDFRAME ENGINE IS ONLINE ✅"
echo "======================================="
echo "1. Bridge: Port 3000 (OSC 7000)"
echo "2. GUI:    http://localhost:5173"
echo "3. AI:     Port 9001 -> 7000"
echo "4. DMX:    Port 8010"
echo "======================================="
echo "Opening God Mode Dashboard in your browser..."
open http://localhost:5173

echo "Press [CTRL+C] to shut down the entire system."

# Handle shutdown gracefully
trap "echo 'Shutting down Wildframe...'; kill $BRIDGE_PID $GUI_PID $ANALYZER_PID $ARTNET_PID $CROWD_PID $LLM_PID; exit" SIGINT SIGTERM

# Wait indefinitely
wait
