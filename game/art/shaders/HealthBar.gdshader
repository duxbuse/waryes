shader_type spatial;
render_mode unshaded, cull_disabled, billboard;

uniform float progress : hint_range(0.0, 1.0) = 1.0;
uniform vec4 color_fill : source_color = vec4(0.0, 1.0, 0.0, 1.0);
uniform vec4 color_bg : source_color = vec4(0.2, 0.2, 0.2, 1.0);

void fragment() {
    float border = 0.05;
    
    // Logic: 0..1 U coordinates
    float p = UV.x;
    
    // Border logic (optional, for crisp look)
    // If we want a 1px border around everything
    bool is_border = UV.x < 0.01 || UV.x > 0.99 || UV.y < 0.05 || UV.y > 0.95;
    
    if (is_border) {
        ALBEDO = vec3(0.0); // Black Border
    }
    else {
        if (p <= progress) {
            ALBEDO = color_fill.rgb;
        } else {
            ALBEDO = color_bg.rgb;
        }
    }
}
