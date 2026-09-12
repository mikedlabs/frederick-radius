import math
import random

class Boid:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        self.vx = random.uniform(-1, 1)
        self.vy = random.uniform(-1, 1)

class BoidsFlock:
    def __init__(self, num_boids=4, width=1.0, height=1.0):
        self.boids = [Boid(random.uniform(0, width), random.uniform(0, height)) for _ in range(num_boids)]
        self.width = width
        self.height = height
        
        # Flocking parameters
        self.speed_limit = 0.05
        self.visual_range = 0.3
        self.cohesion_factor = 0.005
        self.alignment_factor = 0.05
        self.separation_factor = 0.05
        self.min_distance = 0.1
        
        # Panic mode (Spectral Flux / Chaos)
        self.panic_multiplier = 1.0

    def set_panic(self, flux):
        # Normal flux is 0.0 to 1.0. Panic makes them move faster and scatter.
        self.panic_multiplier = 1.0 + (flux * 5.0)

    def update(self):
        for boid in self.boids:
            cx, cy = 0.0, 0.0
            vx_avg, vy_avg = 0.0, 0.0
            neighbors = 0
            
            sx, sy = 0.0, 0.0 # separation

            for other in self.boids:
                if boid == other:
                    continue
                
                dx = boid.x - other.x
                dy = boid.y - other.y
                dist = math.sqrt(dx*dx + dy*dy)
                
                if dist < self.visual_range:
                    cx += other.x
                    cy += other.y
                    vx_avg += other.vx
                    vy_avg += other.vy
                    neighbors += 1
                
                if dist < self.min_distance and dist > 0:
                    sx += (dx / dist)
                    sy += (dy / dist)

            if neighbors > 0:
                # Cohesion
                cx /= neighbors
                cy /= neighbors
                boid.vx += (cx - boid.x) * self.cohesion_factor
                boid.vy += (cy - boid.y) * self.cohesion_factor
                
                # Alignment
                vx_avg /= neighbors
                vy_avg /= neighbors
                boid.vx += (vx_avg - boid.vx) * self.alignment_factor
                
            # Separation
            boid.vx += sx * self.separation_factor
            boid.vy += sy * self.separation_factor
            
            # Boundary bounce
            margin = 0.1
            turn_factor = 0.02
            if boid.x < margin: boid.vx += turn_factor
            if boid.x > self.width - margin: boid.vx -= turn_factor
            if boid.y < margin: boid.vy += turn_factor
            if boid.y > self.height - margin: boid.vy -= turn_factor

            # Speed limit & Panic
            speed = math.sqrt(boid.vx*boid.vx + boid.vy*boid.vy)
            limit = self.speed_limit * self.panic_multiplier
            if speed > limit:
                boid.vx = (boid.vx / speed) * limit
                boid.vy = (boid.vy / speed) * limit
                
            boid.x += boid.vx
            boid.y += boid.vy

    def get_positions(self):
        # Returns list of (x, y) normalized 0.0 - 1.0
        return [(max(0, min(1, b.x / self.width)), max(0, min(1, b.y / self.height))) for b in self.boids]
