shader_type spatial;
render_mode unshaded, cull_disabled;

uniform float progress : hint_range(0.0, 1.0) = 0.0;
uniform vec4 back_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform vec4 fill_color : source_color = vec4(0.0, 1.0, 0.0, 1.0);

uniform float inner_radius = 0.3;
uniform float outer_radius = 0.5;

void fragment() {
    vec2 center = vec2(0.5);
    vec2 uv = UV - center;
    // Calculate angle in 0..1 range (0 at top, clockwise)
    float angle = atan(uv.x, -uv.y); 
    if (angle < 0.0) angle += 6.28318;
    
    float angle_norm = angle / 6.28318;
    
    float dist = length(uv);
    
    // Ring shape
    if (dist < inner_radius || dist > outer_radius) discard;
    
    if (angle_norm < progress) {
        ALBEDO = fill_color.rgb;
    } else {
        ALBEDO = back_color.rgb;
    }
}
