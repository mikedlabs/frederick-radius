import requests
import json
import time
import math

class ResolumeController:
    """
    A controller to automate Resolume Arena via its REST API.
    This demonstrates how I can script decks, layers, and looks dynamically.
    """
    def __init__(self, host="127.0.0.1", port=8080):
        self.base_url = f"http://{host}:{port}/api/v1"
        self.headers = {"Content-Type": "application/json"}
        
    def test_connection(self):
        try:
            res = requests.get(f"{self.base_url}/product", timeout=2)
            if res.status_code == 200:
                print(f"✅ Connected to {res.json()['name']} version {res.json()['version']}")
                return True
            return False
        except Exception as e:
            print(f"❌ Failed to connect to Resolume REST API: {e}")
            return False

    def select_deck(self, deck_index):
        """Switches to the specified deck index."""
        url = f"{self.base_url}/composition/decks/{deck_index}/select"
        requests.put(url, headers=self.headers)
        print(f"📂 Switched to Deck {deck_index}")

    def trigger_clip(self, layer_index, clip_index):
        """Connects (triggers) a specific clip on a specific layer."""
        url = f"{self.base_url}/composition/layers/{layer_index}/clips/{clip_index}/connect"
        requests.post(url, headers=self.headers)
        print(f"▶️ Triggered Layer {layer_index}, Clip {clip_index}")

    def set_layer_opacity(self, layer_index, opacity):
        """Fades a layer to a specific opacity (0.0 to 1.0)."""
        url = f"{self.base_url}/composition/layers/{layer_index}/video/opacity"
        data = {"value": opacity}
        requests.put(url, json=data, headers=self.headers)

    def create_pulsing_look(self, deck_index):
        """
        Shows off a custom look generation by triggering clips 
        and automating layer opacities using a math sine wave.
        """
        print(f"\n🌟 Creating custom pulsing look on Deck {deck_index}...")
        self.select_deck(deck_index)
        
        # Start base layer and overlay layer
        self.trigger_clip(layer_index=1, clip_index=1)
        self.trigger_clip(layer_index=2, clip_index=2)
        
        # Create a dynamic pulsing effect by directly manipulating the API over 5 seconds
        print("〰️ Modulating layer opacities dynamically...")
        for i in range(50):
            # Calculate a sine wave pulse between 0.3 and 1.0
            pulse = (math.sin(i * 0.3) * 0.5 + 0.5) * 0.7 + 0.3
            self.set_layer_opacity(layer_index=2, opacity=pulse)
            time.sleep(0.1)
        
        print("✨ Look sequence completed!")

if __name__ == "__main__":
    print("--- 🚀 GEMINI RESOLUME AUTOMATION SCRIPT ---")
    resolume = ResolumeController()
    
    if resolume.test_connection():
        # Demonstrate creating a couple of custom looks
        resolume.create_pulsing_look(deck_index=1)
        resolume.create_pulsing_look(deck_index=2)
    else:
        print("\nNote: Make sure Resolume Arena is running and the REST API server is enabled on port 8080.")
