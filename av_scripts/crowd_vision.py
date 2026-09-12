import time
import math
import random
import threading
from pythonosc import udp_client

try:
    from flask import Flask, Response
    app = Flask(__name__)
    output_frame = None
    frame_lock = threading.Lock()
except ImportError:
    pass

def generate_stream():
    global output_frame, frame_lock
    while True:
        with frame_lock:
            if output_frame is None:
                time.sleep(0.1)
                continue
            (flag, encodedImage) = cv2.imencode(".jpg", output_frame)
            if not flag:
                time.sleep(0.1)
                continue
        yield(b'--frame\r\n' b'Content-Type: image/jpeg\r\n\r\n' + bytearray(encodedImage) + b'\r\n')
        time.sleep(0.05)

@app.route("/video_feed")
def video_feed():
    return Response(generate_stream(), mimetype="multipart/x-mixed-replace; boundary=frame")


try:
    import cv2
    import numpy as np
    OPENCV_AVAILABLE = True
except ImportError:
    OPENCV_AVAILABLE = False
    print("⚠️ [CROWD VISION] cv2 not found. Falling back to simulated crowd energy.")
    print("To enable real camera tracking, run: pip install opencv-python")

class CrowdVision:
    def __init__(self):
        # We send crowd energy to artnet bridge (8010) and to UI (7002) and Resolume (7000)
        self.artnet_client = udp_client.SimpleUDPClient("127.0.0.1", 8010)
        self.ui_client = udp_client.SimpleUDPClient("127.0.0.1", 7002)
        self.resolume_client = udp_client.SimpleUDPClient("127.0.0.1", 7000)
        
        self.energy = 0.0
        self.running = True

    def _send_osc(self, address, value):
        self.artnet_client.send_message(address, value)
        self.ui_client.send_message(address, value)
        self.resolume_client.send_message(address, value)

    def start(self):
        print("=======================================")
        print("👁️  WILDFRAME CROWD VISION ACTIVE")
        print("Tracking physical motion in the venue...")
        print("=======================================")
        
        # Start Flask in background
        try:
            threading.Thread(target=lambda: app.run(host="0.0.0.0", port=5001, debug=False, use_reloader=False), daemon=True).start()
        except Exception as e:
            print(f"Flask failed to start: {e}")
        
        if OPENCV_AVAILABLE:
            self._run_real_camera()
        else:
            self._run_simulated()

    def _run_real_camera(self):
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("⚠️ [CROWD VISION] No webcam found. Falling back to simulation.")
            self._run_simulated()
            return
            
        ret, frame1 = cap.read()
        ret, frame2 = cap.read()
        
        if not ret:
            print("⚠️ [CROWD VISION] Failed to read from webcam. Falling back to simulation.")
            self._run_simulated()
            return

        print("🎥 Webcam connected. Tracking motion delta...")
        
        while self.running:
            # Calculate absolute difference between consecutive frames
            diff = cv2.absdiff(frame1, frame2)
            gray = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
            blur = cv2.GaussianBlur(gray, (5,5), 0)
            _, thresh = cv2.threshold(blur, 20, 255, cv2.THRESH_BINARY)
            dilated = cv2.dilate(thresh, None, iterations=3)
            
            # Find contours (motion blobs)
            contours, _ = cv2.findContours(dilated, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
            
            motion_pixels = 0
            for contour in contours:
                if cv2.contourArea(contour) > 500: # filter out noise
                    motion_pixels += cv2.contourArea(contour)
                    (x, y, w, h) = cv2.boundingRect(contour)
                    cv2.rectangle(frame1, (x, y), (x + w, y + h), (0, 255, 0), 2)
                    
            # Normalize motion to an energy metric (0.0 to 1.0)
            # Assuming max motion area is roughly 100000 pixels depending on resolution
            raw_energy = min(1.0, motion_pixels / 100000.0)
            
            # Smooth the energy
            self.energy += (raw_energy - self.energy) * 0.1
            
            self._send_osc("/camera/crowd_energy", self.energy)
            
            # Draw HUD
            cv2.putText(frame1, f"ENERGY: {self.energy*100:.1f}%", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            cv2.putText(frame1, "TERMINATOR VISION ONLINE", (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            
            global output_frame, frame_lock
            with frame_lock:
                output_frame = frame1.copy()
            
            # Prepare next frame
            frame1 = frame2
            ret, frame2 = cap.read()
            if not ret:
                break
                
            time.sleep(0.05) # 20fps

        cap.release()

    def _run_simulated(self):
        while self.running:
            # Simulate crowd energy based on a slow sine wave plus some noise
            now = time.time()
            base = (math.sin(now * 0.1) + 1) / 2  # 0 to 1
            noise = random.uniform(0, 0.2)
            
            raw_energy = min(1.0, base + noise)
            self.energy += (raw_energy - self.energy) * 0.1
            
            self._send_osc("/camera/crowd_energy", self.energy)
            time.sleep(0.05)

if __name__ == "__main__":
    cv = CrowdVision()
    try:
        cv.start()
    except KeyboardInterrupt:
        cv.running = False
        print("\nShutting down Crowd Vision...")
