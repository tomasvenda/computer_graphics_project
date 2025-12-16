struct VSOut {
    @builtin(position) position: vec4f,
    @location(0) texCoords: vec2f,
    @location(1) shadowPos: vec3f,
};

struct Uniforms {
    mvp: mat4x4f,
    lightMvp: mat4x4f,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var ourSampler: sampler;
@group(0) @binding(2) var ourTexture: texture_2d<f32>;
@group(0) @binding(3) var shadowMap: texture_depth_2d;
@group(0) @binding(4) var shadowSampler: sampler_comparison;

@vertex
fn main_vs(@location(0) inPos: vec3f, @location(1) inTexCoords: vec2f) -> VSOut {
    var vsOut: VSOut;
    vsOut.position = uniforms.mvp * vec4f(inPos, 1.0);
    vsOut.texCoords = inTexCoords;

    // Shadow coordinates (same mapping logic as the main scene)
    let posFromLight = uniforms.lightMvp * vec4f(inPos, 1.0);
    vsOut.shadowPos = vec3f(
        posFromLight.xy * vec2f(0.5, -0.5) + vec2f(0.5, 0.5),
        posFromLight.z
    );
    return vsOut;
}

@fragment
fn main_fs(input: VSOut) -> @location(0) vec4f {
    let tex = textureSample(ourTexture, ourSampler, input.texCoords);

    // Shadow factor via small PCF
    var shadow = 0.0;
    let size = textureDimensions(shadowMap);
    let texelSize = vec2f(1.0 / f32(size.x), 1.0 / f32(size.y));
    for (var y = -1; y <= 1; y++) {
        for (var x = -1; x <= 1; x++) {
            let offset = vec2f(f32(x), f32(y)) * texelSize;
            shadow += textureSampleCompare(
                shadowMap,
                shadowSampler,
                input.shadowPos.xy + offset,
                input.shadowPos.z - 0.005
            );
        }
    }
    shadow /= 9.0;

    // Outside the shadow map => fully lit
    if (input.shadowPos.x < 0.0 || input.shadowPos.x > 1.0 || input.shadowPos.y < 0.0 || input.shadowPos.y > 1.0) {
        shadow = 1.0;
    }

    // Keep the decal readable even in shadow
    let ambient = 0.5;
    let lit = ambient + (1.0 - ambient) * shadow;
    return vec4f(tex.rgb * lit, tex.a);
}