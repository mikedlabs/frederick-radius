/*
{
  "CATEGORIES" : [
    "Generator"
  ],
  "DESCRIPTION" : "A cybernetic pulsing grid shader designed for MadMapper projection mapping.",
  "ISFVSN" : "2.0",
  "INPUTS" : [
    {
      "NAME" : "speed",
      "TYPE" : "float",
      "MAX" : 5.0,
      "DEFAULT" : 1.5,
      "MIN" : 0.0
    },
    {
      "NAME" : "grid_size",
      "TYPE" : "float",
      "MAX" : 100.0,
      "DEFAULT" : 20.0,
      "MIN" : 2.0
    },
    {
      "NAME" : "glow_color",
      "TYPE" : "color",
      "DEFAULT" : [
        0.0,
        1.0,
        0.8,
        1.0
      ]
    },
    {
      "NAME" : "distortion",
      "TYPE" : "float",
      "MAX" : 1.0,
      "DEFAULT" : 0.5,
      "MIN" : 0.0
    }
  ]
}
*/

void main() {
    // Normalize coordinates based on render size
    vec2 uv = gl_FragCoord.xy / RENDERSIZE.xy;
    uv = uv * 2.0 - 1.0; // center
    uv.x *= RENDERSIZE.x / RENDERSIZE.y; // aspect ratio correct

    float t = TIME * speed;
    
    // Create a dynamic, scrolling grid perfect for mapping on architectural surfaces
    vec2 grid_uv = uv * grid_size;
    
    // Adding non-linear warp for a cool liquid-grid effect
    grid_uv.x += sin(grid_uv.y * 0.1 + t) * distortion * 5.0;
    grid_uv.y += t * 3.0;
    
    // Generate grid lines
    vec2 grid = abs(fract(grid_uv - 0.5) - 0.5) / fwidth(grid_uv);
    float line = min(grid.x, grid.y);
    
    // Add pulsing organic distortion radiating from center
    float dist = length(uv);
    float pulse = sin(dist * 12.0 - t * 5.0) * 0.5 + 0.5;
    
    // Calculate final glow intensity
    float glow = 1.0 / (line * 1.5 + 0.1) * pulse;
    
    // Mix the color
    vec4 final_color = glow_color * glow;
    
    // Add some noise to the alpha for texture
    final_color.a = clamp(glow, 0.0, 1.0);
    
    gl_FragColor = final_color;
}
