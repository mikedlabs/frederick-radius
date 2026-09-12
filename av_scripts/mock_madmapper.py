import time
from pythonosc import dispatcher
from pythonosc import osc_server

# ==========================================
# WILDFRAME - MADMAPPER DMX LIGHTING BRIDGE
# ==========================================
# Listens for semantic OSC cues from the Audio Analyzer and DJM-A9.
# Translates these semantic cues into DMX values for physical lighting fixtures
# (Moving Heads, LED Pars, Strobes).
# ==========================================

class MadMapperBridge:
    def __init__(self):
        self.global_intensity = 1.0

    def handle_transient(self, address, *args):
        # Kick or snare hit -> Strobe flash
        velocity = float(args[0])
        print(f"⚡ [DMX: STROBES] FLASH! (Intensity: {velocity * self.global_intensity:.2f})")

    def handle_drop(self, address, *args):
        print(f"🔥 [DMX: BLINDERS] FULL WHITE! ALL FIXTURES 100%!")
        print(f"💥 [DMX: MOVING HEADS] SNAP TO CROWD, FAST PAN/TILT!")

    def handle_breakdown(self, address, *args):
        print(f"⏬ [DMX: COLOR] Fading to Deep Blue/Purple. Slowing down moving heads.")

    def handle_buildup(self, address, *args):
        print(f"📈 [DMX: COLOR] Fading to Warning Orange/Red. Increasing strobe rate.")

    def handle_a9_beatfx(self, address, *args):
        level = float(args[0])
        self.global_intensity = level
        print(f"🎛️ [DMX: MASTER] Global intensity scaled to {level * 100:.1f}% by DJM-A9 Beat FX")

    def handle_a9_colorfx(self, address, *args):
        # Assuming address is something like /a9/colorfx/filter
        fx_val = float(args[0])
        print(f"🌀 [DMX: MOVING HEADS] Modulating Pan/Tilt macros based on Color FX: {fx_val:.2f}")

    def on_command(self, address, *args):
        # Fallback for unmapped commands
        pass

def start_madmapper_bridge():
    bridge = MadMapperBridge()
    disp = dispatcher.Dispatcher()
    
    # Audio Analyzer Cues
    disp.map("/audio/cues/transient", bridge.handle_transient)
    disp.map("/audio/cues/drop", bridge.handle_drop)
    disp.map("/audio/cues/breakdown", bridge.handle_breakdown)
    disp.map("/audio/cues/buildup", bridge.handle_buildup)
    
    # DJM-A9 Hardware Cues
    disp.map("/a9/beatfx/level", bridge.handle_a9_beatfx)
    disp.map("/a9/colorfx/*", bridge.handle_a9_colorfx)

    disp.set_default_handler(bridge.on_command)
    
    server = osc_server.ThreadingOSCUDPServer(("0.0.0.0", 8010), disp)
    print("=======================================")
    print("🗺️  WILDFRAME MADMAPPER DMX BRIDGE")
    print("Listening for Audio Cues & A9 on 0.0.0.0:8010")
    print("=======================================")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down MadMapper Bridge...")

if __name__ == "__main__":
    start_madmapper_bridge()
