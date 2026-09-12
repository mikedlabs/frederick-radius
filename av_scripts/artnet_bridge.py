import socket
import struct
import time
import math
import threading
from pythonosc import dispatcher
from pythonosc import osc_server
from pythonosc import udp_client
from boids import BoidsFlock

# ==========================================
# WILDFRAME - ART-NET DMX BRIDGE
# ==========================================
# Translates Semantic OSC triggers into raw UDP Art-Net DMX packets.
# Broadcasts to 255.255.255.255:6454 (or a specific IP) for real lighting fixtures.
# ==========================================

class ArtNetNode:
    def __init__(self, target_ip='127.0.0.1', target_port=6454, universe=0):
        self.target_ip = target_ip
        self.target_port = target_port
        self.universe = universe
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # Enable broadcast if needed
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        
        # 512 channels, 0-initialized
        self.dmx_data = bytearray(512)

    def send_dmx(self):
        # Proper Art-Net Header:
        header = struct.pack(
            '<8sH', b'Art-Net\x00', 0x5000
        ) + struct.pack(
            '>HBBBBH', 14, 0, 0, self.universe, 0, 512
        )
        packet = header + self.dmx_data
        self.sock.sendto(packet, (self.target_ip, self.target_port))

    def update_channel(self, channel, value):
        if 1 <= channel <= 512:
            self.dmx_data[channel - 1] = max(0, min(255, int(value)))

    def blackout(self):
        self.dmx_data = bytearray(512)
        self.send_dmx()

class WildframeDMXController:
    def __init__(self):
        # We will broadcast to local network so lighting software can pick it up
        self.artnet = ArtNetNode(target_ip='255.255.255.255', target_port=6454, universe=0)
        self.resolume_client = udp_client.SimpleUDPClient("127.0.0.1", 7000)
        self.ui_client = udp_client.SimpleUDPClient("127.0.0.1", 7002)
        self.global_intensity = 1.0
        
        # Auto-pilot tracking
        self.last_activity = time.time()
        self.autopilot_active = False
        
        self.boids = BoidsFlock(num_boids=4)

        self.artnet.blackout()
        
        # Start the Engine thread
        self.engine_thread = threading.Thread(target=self._engine_loop, daemon=True)
        self.engine_thread.start()

    def _engine_loop(self):
        while True:
            now = time.time()
            inactive_time = now - self.last_activity
            
            if inactive_time > 60.0:
                if not self.autopilot_active:
                    print("🤖 [AUTO-PILOT] DJ inactive for 60s. Engaging autonomous LFOs.")
                    self.autopilot_active = True
                    self.ui_client.send_message("/dmx/state", "AUTO-PILOT (LFO)")
                
                # Generate LFO (0.0 to 1.0)
                lfo_val = (math.sin(now * 0.5) + 1) / 2
                
                # Send to DMX Moving Heads
                dmx_val = int(lfo_val * 255)
                self.artnet.update_channel(50, dmx_val)
                self.artnet.send_dmx()
                
                # Send to Resolume Visuals
                self.resolume_client.send_message("/a9/colorfx/filter", lfo_val)
                self.resolume_client.send_message("/a9/colorfx/space", lfo_val)
                
            else:
                if self.autopilot_active:
                    print("👤 [AUTO-PILOT] DJ Activity detected. Returning control.")
                    self.autopilot_active = False
                    self.ui_client.send_message("/dmx/state", "MANUAL (BOIDS)")
            
            # --- BOIDS PHYSICS UPDATE ---
            self.boids.update()
            positions = self.boids.get_positions()
            
            # Map Boid 0 to Head 1 (Ch 50, 51)
            self.artnet.update_channel(50, int(positions[0][0] * 255))
            self.artnet.update_channel(51, int(positions[0][1] * 255))
            
            # Map Boid 1 to Head 2 (Ch 60, 61)
            self.artnet.update_channel(60, int(positions[1][0] * 255))
            self.artnet.update_channel(61, int(positions[1][1] * 255))
            
            # Map Boid 2 to Head 3 (Ch 70, 71)
            self.artnet.update_channel(70, int(positions[2][0] * 255))
            self.artnet.update_channel(71, int(positions[2][1] * 255))
            
            # Map Boid 3 to Head 4 (Ch 80, 81)
            self.artnet.update_channel(80, int(positions[3][0] * 255))
            self.artnet.update_channel(81, int(positions[3][1] * 255))
            
            self.artnet.send_dmx()
                    
            time.sleep(0.05) # 20Hz update rate

    def handle_transient(self, address, *args):
        # Kick or snare hit -> Strobe flash on Channels 10-15
        velocity = float(args[0])
        val = int(255 * velocity * self.global_intensity)
        self.ui_client.send_message("/dmx/state", f"TRANSIENT FLASH ({val})")
        for ch in range(10, 16):
            self.artnet.update_channel(ch, val)
        self.artnet.send_dmx()
        
        # Very hacky auto-decay for the strobe effect
        time.sleep(0.05)
        for ch in range(10, 16):
            self.artnet.update_channel(ch, 0)
        self.artnet.send_dmx()

    def handle_drop(self, address, *args):
        # Blinders on Channels 20-30
        print(f"🔥 [DMX: BLINDERS] FULL WHITE! ALL FIXTURES 100%!")
        self.ui_client.send_message("/dmx/state", "BLINDERS (FULL WHITE)")
        for ch in range(20, 31):
            self.artnet.update_channel(ch, 255)
        self.artnet.send_dmx()

    def handle_breakdown(self, address, *args):
        # Deep colors on Channels 1-3 (RGB)
        print(f"⏬ [DMX: COLOR] Fading to Deep Blue.")
        self.ui_client.send_message("/dmx/state", "BREAKDOWN (DEEP BLUE)")
        self.artnet.update_channel(1, 0)   # R
        self.artnet.update_channel(2, 0)   # G
        self.artnet.update_channel(3, 255) # B
        self.artnet.send_dmx()

    def handle_buildup(self, address, *args):
        # Tension Orange on Channels 1-3
        print(f"📈 [DMX: COLOR] Fading to Warning Orange.")
        self.ui_client.send_message("/dmx/state", "BUILDUP (WARNING ORANGE)")
        self.artnet.update_channel(1, 255) # R
        self.artnet.update_channel(2, 60)  # G
        self.artnet.update_channel(3, 0)   # B
        self.artnet.send_dmx()

    def handle_blackout(self, address, *args):
        print(f"🤫 [DMX: PRE-DROP] TENSION SILENCE BLACKOUT!")
        self.ui_client.send_message("/dmx/state", "BLACKOUT")
        self.artnet.blackout()
        self.artnet.send_dmx()

    def handle_a9_beatfx(self, address, *args):
        self.last_activity = time.time()
        level = float(args[0])
        self.global_intensity = level
        print(f"🎛️ [DMX: MASTER] Global intensity scaled to {level * 100:.1f}%")
        
    def handle_flux(self, address, *args):
        flux = float(args[0])
        self.boids.set_panic(flux)
        
    def handle_crowd_energy(self, address, *args):
        energy = float(args[0])
        # Base speed is 0.05, max speed is 0.15 depending on crowd energy
        self.boids.speed_limit = 0.05 + (energy * 0.1)

    def handle_a9_colorfx(self, address, *args):
        self.last_activity = time.time()
        fx_val = float(args[0])
        # Map 0.0-1.0 to DMX 0-255 for Pan (Channel 50)
        dmx_val = int(fx_val * 255)
        self.artnet.update_channel(50, dmx_val)
        self.artnet.send_dmx()
        print(f"🌀 [DMX: MOVING HEADS] Pan Modulated: {dmx_val}")

    def on_command(self, address, *args):
        pass

def start_artnet_bridge():
    bridge = WildframeDMXController()
    disp = dispatcher.Dispatcher()
    
    # Map incoming OSC routes
    disp.map("/audio/cues/transient", bridge.handle_transient)
    disp.map("/audio/cues/drop", bridge.handle_drop)
    disp.map("/audio/cues/breakdown", bridge.handle_breakdown)
    disp.map("/audio/cues/buildup", bridge.handle_buildup)
    disp.map("/audio/cues/blackout", bridge.handle_blackout)
    disp.map("/a9/beatfx/level", bridge.handle_a9_beatfx)
    disp.map("/a9/colorfx/filter", bridge.handle_a9_colorfx)
    disp.map("/audio/fft/flux", bridge.handle_flux)
    disp.map("/camera/crowd_energy", bridge.handle_crowd_energy)
    
    # DJM-A9 Hardware Cues
    disp.map("/a9/beatfx/level", bridge.handle_a9_beatfx)
    disp.map("/a9/colorfx/*", bridge.handle_a9_colorfx)

    disp.set_default_handler(bridge.on_command)
    
    server = osc_server.ThreadingOSCUDPServer(("0.0.0.0", 8010), disp)
    print("=======================================")
    print("💡 WILDFRAME ART-NET DMX ENGINE")
    print("Broadcasting DMX Universe 0 to UDP 6454")
    print("Listening for Audio Cues & A9 on Port 8010")
    print("=======================================")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down Art-Net Bridge...")
        bridge.artnet.blackout()

if __name__ == "__main__":
    start_artnet_bridge()
