import time
import random
import threading
from pythonosc import dispatcher
from pythonosc import osc_server
from pythonosc import udp_client

def start_resolume_mock():
    print("🎬 MOCK RESOLUME ARENA STARTED [PORT 7000]")
    
    # Resolume sends FFT data to the Brain (Port 9000)
    client = udp_client.SimpleUDPClient("127.0.0.1", 9000)
    
    # Fake audio engine running in background
    def audio_engine():
        while True:
            time.sleep(random.uniform(1.0, 3.0)) # Random kick drum hits
            peak = random.uniform(0.6, 1.0)
            print(f"🔊 [Resolume] Audio Kick Peak: {peak:.2f}")
            client.send_message("/resolume/fft/kick", peak)
            
    threading.Thread(target=audio_engine, daemon=True).start()

    # Dispatcher to receive commands
    disp = dispatcher.Dispatcher()
    
    def on_command(address, *args):
        print(f"📼 [Resolume] Received Command: {address} = {args}")

    disp.set_default_handler(on_command)
    server = osc_server.ThreadingOSCUDPServer(("0.0.0.0", 7000), disp)
    server.serve_forever()

if __name__ == "__main__":
    start_resolume_mock()
