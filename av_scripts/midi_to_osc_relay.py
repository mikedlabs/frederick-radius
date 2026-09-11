import time
import argparse
try:
    import mido
    from pythonosc import udp_client
except ImportError:
    print("Please install dependencies: pip install mido python-rtmidi python-osc")
    exit(1)

# ==========================================
# WILDFRAME - REMOTE MIDI TO OSC RELAY
# Run this on the Mac Mini with the Novation controllers!
# ==========================================

def start_relay(target_ip="192.168.0.XXX", target_port=9000):
    print(f"🚀 Starting MIDI -> OSC Relay to {target_ip}:{target_port}")
    
    # Setup OSC Client to send to the Main Brain
    client = udp_client.SimpleUDPClient(target_ip, target_port)
    
    # List available MIDI input ports
    print("\n🎹 Available MIDI Inputs:")
    ports = mido.get_input_names()
    for p in ports:
        print(f" - {p}")
        
    if not ports:
        print("❌ No MIDI devices found! Please plug in the Novation controllers.")
        return

    # We will listen to ALL available MIDI ports
    print("\n🎧 Listening for MIDI data... (Press CTRL+C to stop)")
    try:
        # Open all ports (this is a simple multiplexer)
        inports = [mido.open_input(p) for p in ports]
        
        while True:
            for port in inports:
                for msg in port.iter_pending():
                    if msg.type == 'control_change':
                        print(f"🎛️  [{port.name}] CC {msg.control} -> {msg.value}")
                        # Send OSC: /midi/cc <channel> <control> <value>
                        client.send_message("/midi/remote/cc", [msg.channel, msg.control, msg.value])
                    elif msg.type == 'note_on':
                        print(f"🎵 [{port.name}] Note On {msg.note} V:{msg.velocity}")
                        client.send_message("/midi/remote/note_on", [msg.channel, msg.note, msg.velocity])
                    elif msg.type == 'note_off':
                        print(f"🔇 [{port.name}] Note Off {msg.note}")
                        client.send_message("/midi/remote/note_off", [msg.channel, msg.note])
            time.sleep(0.001)
            
    except KeyboardInterrupt:
        print("\n🛑 Stopping Relay.")
    finally:
        for port in inports:
            port.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Relay local MIDI to remote OSC.")
    parser.add_argument("--ip", type=str, required=True, help="IP Address of the Main System (The Brain)")
    args = parser.parse_args()
    
    start_relay(target_ip=args.ip)
