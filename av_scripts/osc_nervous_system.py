import argparse
import math
import time
import asyncio
import json
import os
import websockets
from dotenv import load_dotenv
from pythonosc import dispatcher
from pythonosc import osc_server
from pythonosc import udp_client

from rich.console import Console
from rich.live import Live
from rich.table import Table
from rich.panel import Panel
from rich.layout import Layout
from rich import box

# Load environment variables (creating a default .env if not exists)
load_dotenv()
RESOLUME_IP = os.getenv("RESOLUME_IP", "127.0.0.1")
RESOLUME_PORT = int(os.getenv("RESOLUME_PORT", 7000))
MADMAPPER_IP = os.getenv("MADMAPPER_IP", "127.0.0.1")
MADMAPPER_PORT = int(os.getenv("MADMAPPER_PORT", 8010))
COMPANION_IP = os.getenv("COMPANION_IP", "127.0.0.1")
COMPANION_PORT = int(os.getenv("COMPANION_PORT", 12321))
LISTEN_IP = os.getenv("LISTEN_IP", "0.0.0.0")
LISTEN_PORT = int(os.getenv("LISTEN_PORT", 9000))
WS_PORT = int(os.getenv("WS_PORT", 9001))

console = Console()

# ==========================================
# WILDFRAME NERVOUS SYSTEM - OSC ROUTER
# ==========================================
# This script acts as the central brain between
# Resolume, MadMapper, and Show Control.
# ==========================================

class WildframeBrain:
    def __init__(self, debug=False):
        self.debug = debug
        # Setup OSC Clients to talk TO the software
        self.resolume_client = udp_client.SimpleUDPClient(RESOLUME_IP, RESOLUME_PORT)
        self.madmapper_client = udp_client.SimpleUDPClient(MADMAPPER_IP, MADMAPPER_PORT)
        self.companion_client = udp_client.SimpleUDPClient(COMPANION_IP, COMPANION_PORT)
        
        # State tracking
        self.current_scene = 1
        self.audio_peak_threshold = 0.8
        self.last_flash_time = 0
        self.last_kick_level = 0.0
        self.last_cc = {}
        self.recent_logs = []
        
        # Easing state
        self.smoothed_cc = {}
        
        # Websocket connected clients
        self.connected_clients = set()
        
    def log(self, message):
        timestamp = time.strftime("%H:%M:%S")
        self.recent_logs.append(f"[{timestamp}] {message}")
        if len(self.recent_logs) > 10:
            self.recent_logs.pop(0)

    async def broadcast_state(self, message_type, data):
        """Broadcasts data to all connected websocket clients"""
        if not self.connected_clients:
            return
        msg = json.dumps({"type": message_type, "data": data})
        tasks = [asyncio.create_task(client.send(msg)) for client in self.connected_clients]
        if tasks:
            await asyncio.wait(tasks)

    # --- HANDLERS FOR INCOMING DATA ---

    def handle_show_control_scene(self, address, *args):
        """Receives /show/scene triggers from Bitfocus Companion"""
        scene_id = args[0]
        self.log(f"[bold cyan]SHOW CONTROL[/bold cyan] Triggered Scene {scene_id}")
        self.current_scene = scene_id
        
        # Bi-directional wild shit:
        # 1. Tell Resolume to change decks
        self.resolume_client.send_message(f"/composition/decks/{scene_id}/select", 1)
        
        # 2. Tell MadMapper to change to a specific preset
        self.madmapper_client.send_message(f"/preset/Scene_{scene_id}", 1)
        
        # Broadcast
        asyncio.create_task(self.broadcast_state("scene_change", {"scene": scene_id}))
        
    def handle_resolume_fft(self, address, *args):
        """Receives audio FFT peaks from Resolume (e.g., Kick Drum)"""
        peak_level = args[0]
        self.last_kick_level = peak_level
        
        # Broadcast raw level to web clients for visualizer
        asyncio.create_task(self.broadcast_state("fft_kick", {"level": peak_level}))
        
        # If kick drum hits hard, trigger MadMapper spatial strobe!
        if peak_level > self.audio_peak_threshold:
            now = time.time()
            if now - self.last_flash_time > 0.1: # Rate limit
                self.log(f"[bold red]BASS DROP[/bold red] ({peak_level:.2f}) - Strobing LED Slice 1")
                # Turn on the custom ISF Cyber Pulse shader in MadMapper
                self.madmapper_client.send_message("/surfaces/LED_Slice_1/opacity", 1.0)
                
                # Bi-directional feedback: Flash a button on the Stream Deck!
                self.companion_client.send_message("/press/bank/1/1", 1)
                
                self.last_flash_time = now
                asyncio.create_task(self.broadcast_state("strobe", {"flash": True}))

    def handle_madmapper_spatial(self, address, *args):
        """Receives spatial tracking or slice data back from MadMapper"""
        x_pos = args[0]
        y_pos = args[1]
        
        # Route this into a Resolume Wire Patch to make particle generators follow the wall
        self.resolume_client.send_message("/composition/wire/particle_x", x_pos)
        self.resolume_client.send_message("/composition/wire/particle_y", y_pos)
        asyncio.create_task(self.broadcast_state("spatial", {"x": x_pos, "y": y_pos}))

    def handle_midi_cc(self, address, *args):
        """Receives raw MIDI CCs from the Pi Hub and translates them (with easing)"""
        channel = args[0]
        val = args[1]
        target_val = val / 127.0
        
        # Simple easing (low-pass filter)
        current_val = self.smoothed_cc.get(channel, target_val)
        smoothed = current_val + (target_val - current_val) * 0.3
        self.smoothed_cc[channel] = smoothed
        
        self.last_cc[channel] = smoothed
        asyncio.create_task(self.broadcast_state("midi_cc", {"channel": channel, "value": smoothed}))
        
        # Route Fader 1 to Resolume Master Speed AND MadMapper Shader distortion
        if channel == 1:
            self.resolume_client.send_message("/composition/speed", smoothed)
            self.madmapper_client.send_message("/surfaces/LED_Slice_1/fx/cyber_pulse/distortion", smoothed)

    def handle_remote_midi_cc(self, address, *args):
        channel, control, val = args[0], args[1], args[2]
        self.resolume_client.send_message(f"/composition/layers/1/video/opacity", val / 127.0)

    def handle_remote_midi_note(self, address, *args):
        channel, note, velocity = args[0], args[1], args[2]
        if velocity > 0:
            self.madmapper_client.send_message("/surfaces/LED_Slice_1/opacity", 1.0)
            self.log("[bold yellow]MIDI NOTE[/bold yellow] Flash triggered via remote pad")

    def handle_debug_all(self, address, *args):
        """Sniffer mode to print all incoming OSC"""
        if self.debug:
            self.log(f"[dim]{address} {args}[/dim]")

async def websocket_handler(websocket, brain):
    brain.connected_clients.add(websocket)
    brain.log(f"[bold green]Websocket connected[/bold green] ({len(brain.connected_clients)} total)")
    try:
        await websocket.send(json.dumps({
            "type": "init",
            "data": {
                "scene": brain.current_scene,
                "cc": brain.last_cc
            }
        }))
        
        async for message in websocket:
            try:
                data = json.loads(message)
                if data.get("type") == "trigger_scene":
                    scene = data.get("scene")
                    brain.handle_show_control_scene("/show/scene", scene)
                elif data.get("type") == "strobe":
                    brain.madmapper_client.send_message("/surfaces/LED_Slice_1/opacity", 1.0)
                    brain.companion_client.send_message("/press/bank/1/1", 1)
                    await brain.broadcast_state("strobe", {"flash": True})
            except json.JSONDecodeError:
                pass
    finally:
        brain.connected_clients.remove(websocket)
        brain.log(f"[bold yellow]Websocket disconnected[/bold yellow]")

def generate_tui(brain: WildframeBrain) -> Layout:
    """Generates the Rich TUI layout"""
    layout = Layout()
    layout.split_column(
        Layout(name="header", size=3),
        Layout(name="main")
    )
    layout["main"].split_row(
        Layout(name="stats"),
        Layout(name="logs")
    )
    
    # Header
    layout["header"].update(Panel("[bold magenta]WILDFRAME NERVOUS SYSTEM - OSC ROUTER[/bold magenta]", border_style="magenta"))
    
    # Stats Table
    stats_table = Table(box=box.SIMPLE, expand=True)
    stats_table.add_column("Metric", style="cyan")
    stats_table.add_column("Value", style="green")
    
    stats_table.add_row("Current Scene", str(brain.current_scene))
    
    # Render kick level as a basic VU meter
    bars = int(brain.last_kick_level * 20)
    meter = ("#" * bars).ljust(20, "-")
    color = "red" if brain.last_kick_level > brain.audio_peak_threshold else "green"
    stats_table.add_row("FFT Kick Level", f"[{color}]{meter}[/{color}] ({brain.last_kick_level:.2f})")
    
    stats_table.add_row("Websocket Clients", str(len(brain.connected_clients)))
    
    cc_str = ", ".join([f"CH{k}:{v:.2f}" for k, v in list(brain.last_cc.items())[:3]])
    stats_table.add_row("Active MIDI CCs", cc_str if cc_str else "None")
    
    layout["stats"].update(Panel(stats_table, title="System State", border_style="blue"))
    
    # Logs
    log_text = "\n".join(brain.recent_logs)
    layout["logs"].update(Panel(log_text, title="Recent Activity", border_style="green"))
    
    return layout

async def ui_task(brain: WildframeBrain):
    """Background task to continually redraw the TUI"""
    with Live(generate_tui(brain), refresh_per_second=10) as live:
        while True:
            await asyncio.sleep(0.1)
            live.update(generate_tui(brain))

async def main():
    parser = argparse.ArgumentParser(description="Wildframe OSC Nervous System")
    parser.add_argument("--debug", action="store_true", help="Enable OSC sniffer mode")
    args = parser.parse_args()

    brain = WildframeBrain(debug=args.debug)
    brain.log("Initializing OSC Router...")
    
    # Setup OSC Dispatcher
    disp = dispatcher.Dispatcher()
    
    disp.map("/show/scene", brain.handle_show_control_scene)
    disp.map("/resolume/fft/kick", brain.handle_resolume_fft)
    disp.map("/madmapper/tracker/1", brain.handle_madmapper_spatial)
    disp.map("/midi/cc", brain.handle_midi_cc)
    disp.map("/midi/remote/cc", brain.handle_remote_midi_cc)
    disp.map("/midi/remote/note_on", brain.handle_remote_midi_note)
    
    # Debug sniffer
    disp.set_default_handler(brain.handle_debug_all)

    # Start Async OSC Server
    server = osc_server.AsyncIOOSCUDPServer((LISTEN_IP, LISTEN_PORT), disp, asyncio.get_running_loop())
    transport, protocol = await server.create_serve_endpoint()
    
    # Start WebSocket Server
    ws_server = await websockets.serve(lambda ws: websocket_handler(ws, brain), LISTEN_IP, WS_PORT)

    brain.log(f"OSC Listening on {LISTEN_IP}:{LISTEN_PORT}")
    brain.log(f"Routing to Resolume ({RESOLUME_PORT}) & MadMapper ({MADMAPPER_PORT})")
    
    # Run the UI task and block forever
    await asyncio.gather(ui_task(brain))

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        console.print("[bold red]Shutting down Nervous System...[/bold red]")
