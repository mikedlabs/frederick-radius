import sys
import time
import math
import random
import threading
import threading
from collections import deque
from pythonosc import dispatcher
from pythonosc import osc_server
from pythonosc import udp_client

# ==========================================
# WILDFRAME - REALTIME STRUCTURAL AUDIO ANALYZER
# ==========================================
# Listens for live waveform density/velocity data from ShowKontrol.
# Uses a sliding window algorithm to mathematically detect
# transients, breakdowns, buildups, and drops in real-time.
# ==========================================

class AudioAnalyzer:
    def __init__(self):
        self.resolume_client = udp_client.SimpleUDPClient("127.0.0.1", 7000)
        self.ui_client = udp_client.SimpleUDPClient("127.0.0.1", 7002)
        self.brain_client = udp_client.SimpleUDPClient("127.0.0.1", 9000)
        self.artnet_client = udp_client.SimpleUDPClient("127.0.0.1", 8010)
        
        # Sliding window history (approx 100 frames)
        self.history_len = 100
        self.density_history = deque(maxlen=self.history_len)
        self.velocity_history = deque(maxlen=self.history_len)
        
        # Psycho-Acoustic state
        self.last_centroid = 0.5
        self.last_velocity = 0.0
        
        # State tracking
        self.state = "neutral"  # neutral, breakdown, buildup, drop
        self.state_timer = time.time()
        
        # Phrase Clock parameters
        self.bpm = 128.0
        self.phrase_phase = 0.0
        self.phrase_thread = threading.Thread(target=self._phrase_loop, daemon=True)
        self.phrase_thread.start()
        
    def _phrase_loop(self):
        # 1 phrase = 4 bars = 16 beats
        # Phase goes from 0.0 to 1.0 over 16 beats
        while True:
            beats_per_sec = self.bpm / 60.0
            phrase_duration_sec = 16.0 / beats_per_sec
            now = time.time()
            self.phrase_phase = (now % phrase_duration_sec) / phrase_duration_sec
            self._send_osc("/audio/fft/master_phase", self.phrase_phase)
            time.sleep(1/60.0) # 60fps clock
        
    def _calc_stats(self, window):
        if not window:
            return 0.0, 0.0
        mean = sum(window) / len(window)
        variance = sum((x - mean) ** 2 for x in window) / len(window)
        std_dev = math.sqrt(variance)
        return mean, std_dev

    def _send_osc(self, address, value):
        self.resolume_client.send_message(address, value)
        self.ui_client.send_message(address, value)
        self.artnet_client.send_message(address, value)

    def process_waveform(self, address, *args):
        """
        Receives raw waveform density from ShowKontrol.
        Expects a float between 0.0 and 1.0 representing waveform density.
        """
        density = float(args[0])
        self.density_history.append(density)
        self._analyze_structure()
        
        # Raw density routing
        self._send_osc("/audio/raw/density", density)

    def process_velocity(self, address, *args):
        """
        Receives velocity data from ShowKontrol.
        Expects a float between 0.0 and 1.0 representing audio transient velocity.
        """
        velocity = float(args[0])
        self.velocity_history.append(velocity)
        
        mean_v, std_v = self._calc_stats(self.velocity_history)
        
        # Transient Detection (Kick/Snare hit)
        # If current velocity is greater than the mean + 2 standard deviations
        if len(self.velocity_history) > 10 and velocity > (mean_v + 1.5 * std_v) and velocity > 0.6:
            self._send_osc("/audio/cues/transient", velocity)
            
            # If it's massive, send to brain as well
            if velocity > 0.85:
                self.brain_client.send_message("/audio/cues/transient/massive", velocity)

        # Raw velocity routing
        self._send_osc("/audio/raw/velocity", velocity)

        # ==========================================
        # 🧠 PSYCHO-ACOUSTIC MATH EXTRACTION
        # ==========================================
        # 1. Spectral Flux (Chaos) - the absolute delta of velocity
        flux = abs(velocity - self.last_velocity)
        self.last_velocity = velocity
        self._send_osc("/audio/fft/flux", min(1.0, flux * 2.5))

        # 2. Harmonic vs Percussive Ratio (0.0 = Percussive, 1.0 = Harmonic)
        # If variance is high, it's choppy (percussive). If variance is low, it's sustained (harmonic).
        hvsp = max(0.0, 1.0 - (std_v * 4.0)) 
        self._send_osc("/audio/fft/harmonic_ratio", hvsp)

        # 3. Spectral Centroid (Brightness)
        # Tends to follow velocity but is smoothed. Spikes heavily on snare hits.
        target_centroid = min(1.0, mean_v + (velocity * 0.5))
        self.last_centroid += (target_centroid - self.last_centroid) * 0.2
        self._send_osc("/audio/fft/centroid", self.last_centroid)

        # 4. Sub-Bass LFE Envelope (Inertia)
        # LFE is sluggish and heavily tied to overall density rather than sharp transients
        if len(self.density_history) > 0:
            lfe = self.density_history[-1] * (0.8 if self.state != "drop" else 1.0)
            self._send_osc("/audio/fft/sub_bass", min(1.0, lfe))

        # 5. Phase / Stereo Width
        # Widens massively during buildups and drops. Narrows during breakdowns.
        if self.state == "breakdown":
            width = 0.2 + (math.sin(time.time()) * 0.1)
        elif self.state == "drop":
            width = 0.8 + (math.sin(time.time() * 2) * 0.2)
        else:
            width = 0.5 + (math.sin(time.time() * 0.5) * 0.3)
        self._send_osc("/audio/fft/stereo_width", min(1.0, max(0.0, width)))


    def _analyze_structure(self):
        """
        Analyzes the density history to detect structural changes.
        """
        if len(self.density_history) < 30:
            return  # Need more data
            
        mean_d, std_d = self._calc_stats(self.density_history)
        current = self.density_history[-1]
        
        now = time.time()
        
        # State transitions have a 2-second cooldown to avoid flickering
        if now - self.state_timer < 2.0:
            return

        # 1. Breakdown Detection
        # If the density stays very low compared to history
        if current < (mean_d - std_d) and current < 0.3:
            if self.state != "breakdown":
                self.state = "breakdown"
                self.state_timer = now
                print("⏬ [Analyzer] STRUCTURAL CUE: Breakdown detected!")
                self._send_osc("/audio/cues/structure", "breakdown")
                self._send_osc("/audio/cues/breakdown", 1.0)
                
        # 2. Buildup Detection
        # If density is climbing steadily from a breakdown
        elif self.state == "breakdown" and current > (mean_d) and current < 0.7:
            self.state = "buildup"
            self.state_timer = now
            print("📈 [Analyzer] STRUCTURAL CUE: Buildup detected!")
            self._send_osc("/audio/cues/structure", "buildup")
            self._send_osc("/audio/cues/buildup", 1.0)
            
        # 2.5 Tension Silence Predictor (Pre-Drop Blackout)
        # If we are in a buildup, and density suddenly flatlines to near zero
        elif self.state == "buildup" and current < 0.15:
            self.state = "tension"
            self.state_timer = now
            print("🤫 [Analyzer] TENSION SILENCE DETECTED! PRE-DROP BLACKOUT!")
            self._send_osc("/audio/cues/structure", "blackout")
            self._send_osc("/audio/cues/blackout", 1.0)
            
        # 3. Drop Detection
        # Sudden massive jump to high density (usually accompanied by a huge transient)
        elif current > (mean_d + std_d) and current > 0.75:
            if self.state != "drop":
                self.state = "drop"
                self.state_timer = now
                print("🔥 [Analyzer] STRUCTURAL CUE: Massive DROP detected!")
                self._send_osc("/audio/cues/structure", "drop")
                self._send_osc("/audio/cues/drop", 1.0)
                
        # 4. Return to Neutral
        elif 0.3 <= current <= 0.75 and (mean_d - 0.1) < current < (mean_d + 0.1):
            if self.state != "neutral":
                self.state = "neutral"
                self.state_timer = now
                print("〰️ [Analyzer] STRUCTURAL CUE: Neutral groove.")
                self._send_osc("/audio/cues/structure", "neutral")


def start_analyzer():
    analyzer = AudioAnalyzer()
    disp = dispatcher.Dispatcher()
    
    # Map incoming OSC routes from Show Control
    disp.map("/show/audio/waveform", analyzer.process_waveform)
    disp.map("/show/audio/velocity", analyzer.process_velocity)
    
    def print_unknown(address, *args):
        # Commenting this out to avoid spam if ShowKontrol sends weird stuff
        pass
        
    disp.set_default_handler(print_unknown)

    server = osc_server.ThreadingOSCUDPServer(("0.0.0.0", 9001), disp)
    print("=======================================", flush=True)
    print("🔊 WILDFRAME STRUCTURAL AUDIO ANALYZER ACTIVE", flush=True)
    print("Listening for ShowKontrol Waveforms on 0.0.0.0:9001", flush=True)
    print("=======================================", flush=True)
    
    # Simulation Thread
    if "--simulate" in sys.argv:
        print("🧪 RUNNING IN SIMULATION MODE (Generating Fake Audio Data)")
        def simulator():
            while True:
                # Fake a beat every ~0.5 seconds (120BPM)
                density = 0.5 + (math.sin(time.time() * math.pi * 4) * 0.4) + random.uniform(-0.1, 0.1)
                velocity = max(0, math.sin(time.time() * math.pi * 4)) ** 8  # sharp spikes
                
                analyzer.process_waveform("/simulate/density", density)
                analyzer.process_velocity("/simulate/velocity", velocity)
                
                # Occasional massive transient
                if random.random() < 0.05:
                    analyzer.process_velocity("/simulate/velocity", 1.2)
                    
                time.sleep(0.05) # 20Hz update
        threading.Thread(target=simulator, daemon=True).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down Audio Analyzer...")

if __name__ == "__main__":
    start_analyzer()
