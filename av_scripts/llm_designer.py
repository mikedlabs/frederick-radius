import time
import json
import threading
from pythonosc import dispatcher
from pythonosc import osc_server
from pythonosc import udp_client

class LLMSceneDesigner:
    def __init__(self):
        self.resolume_client = udp_client.SimpleUDPClient("127.0.0.1", 7000)
        self.ui_client = udp_client.SimpleUDPClient("127.0.0.1", 7002)
        
        # Keep track of the currently loaded metadata per deck
        self.deck_metadata = {
            1: {"title": "Unknown", "artist": "Unknown"},
            2: {"title": "Unknown", "artist": "Unknown"},
            3: {"title": "Unknown", "artist": "Unknown"},
            4: {"title": "Unknown", "artist": "Unknown"}
        }

    def _send_osc(self, address, value):
        self.resolume_client.send_message(address, value)
        self.ui_client.send_message(address, value)

    def handle_deck_state(self, address, *args):
        if not args:
            return
        state = str(args[0])
        
        # e.g. /sk/deck1/state -> deck 1
        try:
            deck = int(address.split("/")[2].replace("deck", ""))
        except:
            deck = 1
            
        if state == "play":
            title = self.deck_metadata[deck]["title"]
            artist = self.deck_metadata[deck]["artist"]
            
            if title == "Unknown":
                print(f"📡 [LLM Designer] Deck {deck} State PLAY detected but no title found. Using generic fallback.")
                title = "Generic Electronic Track"
            else:
                print(f"📡 [LLM Designer] Deck {deck} PLAY detected. Triggering LLM for {title} by {artist}.")
                
            threading.Thread(target=self._mock_llm_generation, args=(title, artist)).start()

    def handle_track_title(self, address, *args):
        if not args: return
        title = str(args[0])
        try:
            deck = int(address.split("/")[2].replace("deck", ""))
            self.deck_metadata[deck]["title"] = title
            print(f"💿 [LLM Designer] Deck {deck} Title Loaded: {title}")
        except:
            pass

    def handle_track_artist(self, address, *args):
        if not args: return
        artist = str(args[0])
        try:
            deck = int(address.split("/")[2].replace("deck", ""))
            self.deck_metadata[deck]["artist"] = artist
            print(f"💿 [LLM Designer] Deck {deck} Artist Loaded: {artist}")
        except:
            pass

    def handle_track_loaded(self, address, *args):
        if not args:
            print(f"📡 [LLM Designer] Track unloaded or empty: {address}")
            return
        
        title = str(args[0])
        artist = str(args[1]) if len(args) > 1 else "Unknown"
        
        print(f"💿 [LLM Designer] Track Loaded: {title} by {artist}")
        print(f"🧠 [LLM Designer] Querying Contextual AI for Scene Generation...")
        
        # Simulate LLM Network latency
        threading.Thread(target=self._mock_llm_generation, args=(title, artist)).start()

    def _mock_llm_generation(self, title, artist):
        time.sleep(2.0) # LLM Thinking...
        
        # Simple mock logic based on track name
        title_lower = title.lower()
        
        if "laser" in title_lower or "dubstep" in title_lower:
            scene = {
                "color1": "#00ff00", # Toxic Green
                "color2": "#800080", # Deep Purple
                "vibe": "Sci-Fi Aggressive"
            }
        elif "love" in title_lower or "heaven" in title_lower:
            scene = {
                "color1": "#ff69b4", # Hot Pink
                "color2": "#00d4ff", # Cyan
                "vibe": "Euphoric Trance"
            }
        elif "dark" in title_lower or "techno" in title_lower:
            scene = {
                "color1": "#ff0000", # Blood Red
                "color2": "#111111", # Dark Gray
                "vibe": "Underground Techno"
            }
        else:
            scene = {
                "color1": "#ffa500", # Orange
                "color2": "#0000ff", # Blue
                "vibe": "Energetic Groove"
            }
            
        print(f"🎨 [LLM Designer] Generated Scene: {scene['vibe']} ({scene['color1']}, {scene['color2']})")
        
        # Send OSC to Resolume and UI
        self._send_osc("/llm/track/title", title)
        self._send_osc("/llm/track/artist", artist)
        self._send_osc("/llm/scene/color1", scene['color1'])
        self._send_osc("/llm/scene/color2", scene['color2'])
        self._send_osc("/llm/scene/vibe", scene['vibe'])


def start_llm_designer():
    designer = LLMSceneDesigner()
    disp = dispatcher.Dispatcher()
    
    # Map incoming OSC routes from CDJs
    disp.map("/dj/track_loaded", designer.handle_track_loaded)
    
    # Map ShowKontrol deck loads
    disp.map("/sk/deck1/track", designer.handle_track_loaded)
    disp.map("/sk/deck2/track", designer.handle_track_loaded)
    disp.map("/sk/deck3/track", designer.handle_track_loaded)
    disp.map("/sk/deck4/track", designer.handle_track_loaded)
    
    disp.map("/sk/deck1/title", designer.handle_track_title)
    disp.map("/sk/deck2/title", designer.handle_track_title)
    disp.map("/sk/deck3/title", designer.handle_track_title)
    disp.map("/sk/deck4/title", designer.handle_track_title)

    disp.map("/sk/deck1/artist", designer.handle_track_artist)
    disp.map("/sk/deck2/artist", designer.handle_track_artist)
    disp.map("/sk/deck3/artist", designer.handle_track_artist)
    disp.map("/sk/deck4/artist", designer.handle_track_artist)
    
    disp.map("/sk/deck1/state", designer.handle_deck_state)
    disp.map("/sk/deck2/state", designer.handle_deck_state)
    disp.map("/sk/deck3/state", designer.handle_deck_state)
    disp.map("/sk/deck4/state", designer.handle_deck_state)
    
    def print_unknown(address, *args):
        print(f"📡 [LLM Designer] Received Unmapped OSC: {address} {args}", flush=True)
    disp.set_default_handler(print_unknown)

    # Start the LLM Designer on port 9002
    server = osc_server.ThreadingOSCUDPServer(("0.0.0.0", 9002), disp)
    print("=======================================", flush=True)
    print("🧠  WILDFRAME LLM SCENE DESIGNER ACTIVE", flush=True)
    print("Listening for CDJ Track Metadata on 0.0.0.0:9002", flush=True)
    print("=======================================", flush=True)
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down LLM Scene Designer...")

if __name__ == "__main__":
    start_llm_designer()
