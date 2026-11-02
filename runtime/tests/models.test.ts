import { expect, it } from 'vitest';
import { decodeModelData, validateGLB, validateSceneModels, pngDimensions } from '../src/models.js';
import { modelFixture } from '../../tests/fixtures/model-fixture.mjs';
import { imageDataURL } from '../../tests/fixtures/image-fixture.mjs';

it('accepts a bounded self-contained static textured GLB', () => {
  const fixture = modelFixture();
  expect(validateGLB(fixture.bytes)).toEqual({nodes:1,meshes:1,textures:1});
  expect(() => validateSceneModels({model_1:fixture.source})).not.toThrow();
  expect(decodeModelData(fixture.source)).toEqual(new Uint8Array(fixture.bytes));
});

it('rejects network/file references, compression, animations and unsafe structure before a loader runs', () => {
  for (const mutate of [
    doc => {doc.buffers[0].uri = 'https://example.invalid/model.bin';},
    doc => {doc.images[0].uri = 'file:///private.png';},
    doc => {doc.extensionsUsed = ['KHR_draco_mesh_compression'];},
    doc => {doc.animations = [{}];},
    doc => {doc.accessors[0].count = 1e9;},
    doc => {doc.accessors[0].type = 'constructor';},
    doc => {doc.nodes[0].children = [0];},
    doc => {doc.bufferViews[0].byteLength = 1e9;},
    doc => {doc.images[0].mimeType = 'image/svg+xml';},
    (_,binary) => {binary.writeFloatLE(NaN,0);},
  ]) expect(() => validateGLB(modelFixture(mutate).bytes)).toThrow();
  expect(() => validateSceneModels({model_3:modelFixture().source})).toThrow();
  expect(() => decodeModelData('https://example.invalid/model.glb')).toThrow();
  expect(() => validateGLB(new Uint8Array(4*1024*1024+1))).toThrow();
});

it('bounds decompressed PNG dimensions before decoding textures', () => {
  const png = new Uint8Array(33);
  png.set([137,80,78,71,13,10,26,10],0); png.set([73,72,68,82],12);
  const view = new DataView(png.buffer);
  view.setUint32(16,50000); view.setUint32(20,50000);
  expect(() => pngDimensions(png)).toThrow(/pixels/);
  const animated = Uint8Array.from(atob(imageDataURL.split(',')[1]), value => value.charCodeAt(0));
  animated.set([97,99,84,76],37);
  expect(() => pngDimensions(animated)).toThrow(/Animated PNG/);
});

it('checks triangle attribute formats, index values and material/sampler semantics', () => {
  const indexed = (doc, binary) => {
    doc.bufferViews.push({buffer:0,byteOffset:36,byteLength:3});
    binary.set([0,1,2],36);
    doc.accessors.push({bufferView:4,componentType:5121,count:3,type:'SCALAR'});
    doc.meshes[0].primitives[0].indices = 3;
  };
  expect(() => validateGLB(modelFixture(indexed).bytes)).not.toThrow();
  for (const mutate of [
    doc => {doc.accessors[0].componentType = 5123;},
    doc => {delete doc.accessors[0].min;},
    doc => {doc.accessors[1].type = 'VEC2';},
    doc => {doc.accessors[1].count = 2;},
    doc => {doc.accessors[2].normalized = true;},
    doc => {doc.accessors[0].normalized = 'yes';},
    doc => {doc.meshes[0].primitives[0].indices = 0;},
    (doc,binary) => {indexed(doc,binary);binary[36] = 3;},
    (doc,binary) => {indexed(doc,binary);binary[36] = 255;},
    (doc,binary) => {indexed(doc,binary);doc.bufferViews[4].byteStride = 4;},
    doc => {doc.materials[0].pbrMetallicRoughness.metallicFactor = 2;},
    doc => {doc.materials[0].alphaMode = 'OTHER';},
    doc => {doc.materials[0].doubleSided = 'yes';},
    doc => {doc.materials[0].normalTexture = null;},
    doc => {doc.materials[0].pbrMetallicRoughness.baseColorTexture.texCoord = 1;},
    doc => {doc.samplers = [{magFilter:9987}];},
    doc => {doc.samplers = [{wrapS:'repeat'}];},
    doc => {doc.nodes[0].rotation = [0,0,0,0];},
    doc => {doc.nodes[0].matrix = new Array(16).fill(0);doc.nodes[0].translation = [0,0,0];},
    doc => {doc.scenes[0].nodes = [0,0];},
    doc => {doc.extensionsUsed = true;},
    doc => {doc.scenes.push({nodes:[0]});},
  ]) expect(() => validateGLB(modelFixture(mutate).bytes)).toThrow();
});

it('bounds expanded node instances rather than only unique accessor bytes', () => {
  const fixture = modelFixture(doc => {
    doc.meshes[0].primitives = new Array(3).fill(doc.meshes[0].primitives[0]);
    doc.nodes = new Array(100).fill({mesh:0});
    doc.scenes[0].nodes = doc.nodes.map((_,i) => i);
  });
  expect(() => validateGLB(fixture.bytes)).toThrow(/instance/);
});
