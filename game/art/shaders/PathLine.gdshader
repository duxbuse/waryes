shader_type spatial;
render_mode unshaded, cull_disabled;

uniform vec4 color : source_color = vec4(0.0, 1.0, 0.0, 0.5);
uniform bool dotted = false;
uniform float frequency = 10.0;
uniform float speed = 0.0;

void fragment() {
    vec4 final_color = color * COLOR; // Multiply uniform by vertex color
    
    if (dotted) {
        // Simple alpha striping based on UV.x (length) 
        // UV.x needs to be scaled by line length in C# if possible, 
        // or we rely on the implementation passing correct UVs.
        // ImmediateMesh usually maps UV.x from 0 to 1 along the strip?
        // If not, we might need a world position based approach.
        
        float pos = UV.x * frequency + TIME * speed;
        if (sin(pos * 3.14159 * 2.0) < 0.0) {
            discard;
        }
    }
    ALBEDO = final_color.rgb;
    ALPHA = final_color.a;
}
