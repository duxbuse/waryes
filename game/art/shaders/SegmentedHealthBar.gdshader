shader_type spatial;
render_mode unshaded, cull_disabled;

uniform vec4 aligned_color : source_color = vec4(1.0, 1.0, 1.0, 1.0); // White by default
uniform float segments : hint_range(1.0, 100.0) = 10.0;
uniform float fill_amount : hint_range(0.0, 1.0) = 1.0;
uniform float gap_width : hint_range(0.0, 0.1) = 0.02;

void fragment() {
    float segment_width = 1.0 / segments;
    float current_segment = floor(UV.x * segments);
    
    // Calculate local UV within the segment to detect gaps
    // UV.x goes 0->1.
    // We want gaps between segments.
    // If we have N segments, we have N blocks.
    // Logic: check if we are in the "gap" portion of a segment.
    
    // Normalize UV to 0-1 within the segment
    float segment_local_x = fract(UV.x * segments);
    
    // Simple gap logic: if near the edge of the segment?
    // Let's say gap is on the right side of each segment except the last.
    // Actually, simpler: if UV.x is within a gap region.
    
    // Better math:
    // We want 'segments' number of white blocks.
    // Each block has width W. Gap is G.
    // Total width = segments * W + (segments - 1) * G
    // In UV space (0..1), simply masking is easier.
    
    // Check if we are in a gap
    // Use modulo?
    // If we treat 0..1 as `segments` range.
    float x_scaled = UV.x * segments;
    float x_fract = fract(x_scaled);
    
    // Gap logic: if x_fract > (1.0 - gap_width_relative)
    // gap_width is uniform, but effective gap width depends on segment count if we use that logic.
    // Let's use the uniform gap_width directly on UV space?
    // No, easier to just cut off the end of each segment.
    
    if (x_fract > (1.0 - gap_width * segments)) {
        discard; // This is a gap
    }
    
    // Fill logic
    // We want to fill discrete segments
    // If current_segment index < (fill_amount * segments) -> Full
    // But fill_amount might be partial segment? The prompt says "white and broken into bars". usually fully filled bars.
    // "each bar represents 2 hp".
    // So fill_amount should logically be quantized to segments in the script, or we check against threshold.
    
    float segment_threshold = (current_segment) / segments;
    
    if (segment_threshold >= fill_amount) {
         // This segment is empty
         discard; // Or draw background/empty color? Prompt says "white... broken into bars". implies empty space is empty or black.
         // Image shows black background for empty Health.
    }
    
    ALBEDO = aligned_color.rgb;
    ALPHA = aligned_color.a;
}
