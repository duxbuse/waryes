shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_disabled, unshaded;

uniform vec4 neutral_color : source_color = vec4(0.2, 0.2, 0.2, 0.3);
uniform vec4 fill_color : source_color = vec4(0.0, 0.0, 1.0, 0.5);
uniform float progress : hint_range(0.0, 1.0) = 0.0;
uniform vec3 start_pos_local = vec3(0.0);
uniform float max_radius = 30.0; // Diameter of zone approx

varying vec3 local_pos;

void vertex() {
    local_pos = VERTEX;
}

void fragment() {
    // Calculate distance on the XZ plane (ignoring height)
    float dist = distance(local_pos.xz, start_pos_local.xz);
    
    // Calculate current fill radius
    // We want to ensure it covers the whole zone (radius ~15) from any edge point
    // Max distance across a radius 15 circle is 30.
    float current_radius = progress * max_radius * 1.5; 
    // * 1.5 to be safe and ensure full coverage even from far edge
    
    vec4 f_color;
    if (dist < current_radius) {
        f_color = fill_color;
    } else {
        f_color = neutral_color;
    }
    
    ALBEDO = f_color.rgb;
    ALPHA = f_color.a;
}
