struct VSOut {
    @builtin(position) position: vec4f,
    @location(0) texCoords: vec2f,
};

struct Uniforms {
    mvp: mat4x4f,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var ourSampler: sampler;
@group(0) @binding(2) var ourTexture: texture_2d<f32>;

@vertex
fn main_vs(@location(0) inPos: vec3f, @location(1) inTexCoords: vec2f) -> VSOut {
    var vsOut: VSOut;
    vsOut.position = uniforms.mvp * vec4f(inPos, 1.0);
    vsOut.texCoords = inTexCoords;
    return vsOut;
}

@fragment
fn main_fs(input: VSOut) -> @location(0) vec4f {
    return textureSample(ourTexture, ourSampler, input.texCoords);
}