#!/bin/bash

echo "==========================================="
echo "   PROJECT WILDFRAME - LIVE DEMO SIMULATOR"
echo "==========================================="
echo "Starting Node.js Web HUD Server..."
node hud_project/server.js &
NODE_PID=$!

echo "Starting Mock Resolume..."
python av_scripts/mock_resolume.py &
RES_PID=$!

echo "Starting Mock MadMapper..."
python av_scripts/mock_madmapper.py &
MAD_PID=$!

echo "Starting Audio Analyzation Engine..."
python av_scripts/audio_analyzer.py &
AUDIO_PID=$!

echo "Starting The Brain (OSC Nervous System)..."
python av_scripts/osc_nervous_system.py &
BRAIN_PID=$!

echo "==========================================="
echo "All systems running! Open http://localhost:3000 in your browser or iPad."
echo "Press CTRL+C to stop all servers."
echo "==========================================="

# Keep script running and tail logs from background processes
wait
