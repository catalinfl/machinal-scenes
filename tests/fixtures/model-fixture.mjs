import { imageDataURL } from './image-fixture.mjs';

export function modelFixture(mutate = () => {}) {
  const positions = Buffer.from(new Float32Array([-1,-0.8,0,1,-0.8,0,0,1,0]).buffer);
  const normals = Buffer.from(new Float32Array([0,0,1,0,0,1,0,0,1]).buffer);
  const uv = Buffer.from(new Float32Array([0,0,1,0,0.5,1]).buffer);
  const png = Buffer.from(imageDataURL.split(',')[1],'base64');
  const raw = Buffer.concat([positions,normals,uv,png]);
  const binary = Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4)]);
  const doc = { asset:{version:'2.0'},buffers:[{byteLength:binary.length}],bufferViews:[
    {buffer:0,byteOffset:0,byteLength:positions.length},
    {buffer:0,byteOffset:positions.length,byteLength:normals.length},
    {buffer:0,byteOffset:positions.length+normals.length,byteLength:uv.length},
    {buffer:0,byteOffset:positions.length+normals.length+uv.length,byteLength:png.length},
  ],accessors:[
    {bufferView:0,componentType:5126,count:3,type:'VEC3',min:[-1,-0.8,0],max:[1,1,0]},
    {bufferView:1,componentType:5126,count:3,type:'VEC3'},
    {bufferView:2,componentType:5126,count:3,type:'VEC2'},
  ],images:[{bufferView:3,mimeType:'image/png'}],textures:[{source:0}],materials:[{pbrMetallicRoughness:{baseColorTexture:{index:0},metallicFactor:0,roughnessFactor:1},doubleSided:true}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},material:0}]}],nodes:[{name:'subject',mesh:0}],scenes:[{nodes:[0]}],scene:0 };
  mutate(doc,binary);
  const json = Buffer.from(JSON.stringify(doc));
  const jsonBytes = Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67,0); header.writeUInt32LE(2,4); header.writeUInt32LE(28+jsonBytes.length+binary.length,8);
  header.writeUInt32LE(jsonBytes.length,12); header.writeUInt32LE(0x4e4f534a,16);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binary.length,0); binaryHeader.writeUInt32LE(0x004e4942,4);
  const bytes = Buffer.concat([header,jsonBytes,binaryHeader,binary]);
  return { bytes, source:'data:model/gltf-binary;base64,'+bytes.toString('base64') };
}

export const modelComponent = `<script>
import {SceneCanvas,SceneThree,createStudioLighting,loadSceneModel} from '@direction/scene-svelte';
let {models = {}} = $props();
async function setup({world,camera,resources}) {
  const subject = await loadSceneModel(models.model_1,resources);
  world.add(subject);
  createStudioLighting(world);
  camera.position.set(0,0,4); camera.lookAt(0,0,0);
  return {update(frame) {subject.rotation.y = frame.time*0.6;}};
}
</script><SceneCanvas background="#142030"><SceneThree {setup} /></SceneCanvas>`;
