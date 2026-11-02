export const MODEL_DATA_PREFIX = 'data:model/gltf-binary;base64,';
export const MAX_MODEL_BYTES = 4 * 1024 * 1024;
export const MAX_MODEL_PIXELS = 4_000_000;

type RecordValue = Record<string, any>;

const unsupportedFeatures = ['extensions', 'extensionsUsed', 'extensionsRequired', 'animations', 'skins', 'targets', 'sparse'];

function record(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid GLB ${label}`);
  return value as RecordValue;
}

function integer(value: unknown, min: number, max: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw new Error(`Invalid GLB ${label}`);
  return value as number;
}

function list(value: unknown, max: number, label: string): any[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) throw new Error(`GLB ${label} exceeds supported limits`);
  return value;
}

function noExternalResources(value: unknown, depth = 0): void {
  if (depth > 32) throw new Error('GLB structure is too deeply nested');
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value) && value.length > 512) throw new Error('GLB metadata array exceeds limits');
  for (const [key, child] of Object.entries(value)) {
    if (key === 'uri') throw new Error('GLB must embed all resources; URI references are unsupported');
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Unsupported GLB metadata key');
    if (unsupportedFeatures.includes(key) && child !== undefined && child !== null &&
      (typeof child !== 'object' || Object.keys(child).length > 0)) throw new Error(`Unsupported GLB feature: ${key}`);
    noExternalResources(child, depth + 1);
  }
}

export function decodeModelData(source: string): Uint8Array {
  if (typeof source !== 'string' || !source.startsWith(MODEL_DATA_PREFIX) || source.length > MODEL_DATA_PREFIX.length + Math.ceil(MAX_MODEL_BYTES / 3) * 4) throw new Error('Use an approved embedded GLB of at most 4 MiB');
  const encoded = source.slice(MODEL_DATA_PREFIX.length);
  if (encoded.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('Invalid GLB base64 encoding');
  const decoded = atob(encoded);
  if (decoded.length === 0 || decoded.length > MAX_MODEL_BYTES) throw new Error('GLB exceeds its byte limit');
  return Uint8Array.from(decoded, character => character.charCodeAt(0));
}

export function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  const signature = [137,80,78,71,13,10,26,10];
  if (bytes.length < 33 || !signature.every((value, i) => bytes[i] === value) || String.fromCharCode(...bytes.subarray(12,16)) !== 'IHDR') throw new Error('Model textures must be embedded PNG images');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20);
  if (!width || !height || width * height > MAX_MODEL_PIXELS) throw new Error('Model texture exceeds 4 million pixels');
  if (view.getUint32(8) !== 13) throw new Error('Invalid PNG header');
  let imageData = false, ended = false, chunks = 0;
  for (let offset = 8; offset < bytes.length;) {
    if (++chunks > 1024 || offset + 12 > bytes.length) throw new Error('Invalid PNG chunk limits');
    const length = view.getUint32(offset);
    if (length > bytes.length - offset - 12) throw new Error('Invalid PNG chunk size');
    const type = String.fromCharCode(...bytes.subarray(offset+4, offset+8));
    if (['acTL', 'fcTL', 'fdAT'].includes(type)) throw new Error('Animated PNG textures are unsupported');
    if (type === 'IHDR' && offset !== 8) throw new Error('Duplicate PNG header');
    if (type === 'IDAT') imageData = true;
    offset += length + 12;
    if (type === 'IEND') {
      if (length !== 0 || offset !== bytes.length) throw new Error('Invalid PNG end');
      ended = true;
    }
  }
  if (!imageData || !ended) throw new Error('PNG texture needs complete image data');
  return { width, height };
}

function finiteVector(value: unknown, length: number, label: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length !== length || value.some(item => typeof item !== 'number' || !Number.isFinite(item) || Math.abs(item) > 1e6)) throw new Error(`Invalid GLB ${label}`);
}

function scalar(value: unknown, min: number, max: number, label: string): void {
  if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)) throw new Error(`Invalid GLB ${label}`);
}

function boolean(value: unknown, label: string): void {
  if (value !== undefined && typeof value !== 'boolean') throw new Error(`Invalid GLB ${label}`);
}

function choice(value: unknown, choices: readonly unknown[], label: string): void {
  if (value !== undefined && !choices.includes(value)) throw new Error(`Unsupported GLB ${label}`);
}

function color(value: unknown, length: number, label: string): void {
  finiteVector(value, length, label);
  if (value !== undefined) (value as number[]).forEach(component => scalar(component, 0, 1, label));
}

function validateMaterials(doc: RecordValue, imageCount: number): { materials: RecordValue[]; textures: RecordValue[] } {
  const samplers = list(doc.samplers, 16, 'samplers').map(item => record(item, 'sampler'));
  for (const sampler of samplers) {
    choice(sampler.magFilter, [9728, 9729], 'magnification filter');
    choice(sampler.minFilter, [9728, 9729, 9984, 9985, 9986, 9987], 'minification filter');
    choice(sampler.wrapS, [33071, 33648, 10497], 'sampler wrap');
    choice(sampler.wrapT, [33071, 33648, 10497], 'sampler wrap');
  }
  const textures = list(doc.textures, 8, 'textures').map(item => record(item, 'texture'));
  for (const texture of textures) {
    integer(texture.source, 0, imageCount - 1, 'texture source');
    if (texture.sampler !== undefined) integer(texture.sampler, 0, samplers.length - 1, 'texture sampler');
  }
  const textureInfo = (value: unknown) => {
    if (value === undefined) return;
    const info = record(value, 'texture info');
    integer(info.index, 0, textures.length - 1, 'material texture');
    if (info.texCoord !== undefined) integer(info.texCoord, 0, 1, 'texture coordinates');
  };
  const materials = list(doc.materials, 64, 'materials').map(item => record(item, 'material'));
  for (const material of materials) {
    const pbr = material.pbrMetallicRoughness === undefined ? {} : record(material.pbrMetallicRoughness, 'PBR material');
    color(pbr.baseColorFactor, 4, 'base color');
    scalar(pbr.metallicFactor, 0, 1, 'metallic factor');
    scalar(pbr.roughnessFactor, 0, 1, 'roughness factor');
    color(material.emissiveFactor, 3, 'emissive color');
    choice(material.alphaMode, ['OPAQUE', 'MASK', 'BLEND'], 'alpha mode');
    scalar(material.alphaCutoff, 0, 1, 'alpha cutoff');
    boolean(material.doubleSided, 'double sided');
    for (const info of [pbr.baseColorTexture, pbr.metallicRoughnessTexture, material.normalTexture, material.occlusionTexture, material.emissiveTexture]) textureInfo(info);
    if (material.normalTexture !== undefined) scalar(material.normalTexture.scale, -100, 100, 'normal scale');
    if (material.occlusionTexture !== undefined) scalar(material.occlusionTexture.strength, 0, 1, 'occlusion strength');
  }
  return { materials, textures };
}

export function validateGLB(bytes: Uint8Array): { nodes: number; meshes: number; textures: number } {
  if (bytes.byteLength < 28 || bytes.byteLength > MAX_MODEL_BYTES) throw new Error('Invalid GLB length');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0,true) !== 0x46546c67 || view.getUint32(4,true) !== 2 || view.getUint32(8,true) !== bytes.length) throw new Error('Use a valid GLB version 2 container');
  const jsonLength = view.getUint32(12,true);
  const binaryHeader = 20 + jsonLength;
  if (!jsonLength || jsonLength > 256 * 1024 || jsonLength % 4 || view.getUint32(16,true) !== 0x4e4f534a || binaryHeader + 8 > bytes.length) throw new Error('Invalid GLB JSON chunk');
  const binaryLength = view.getUint32(binaryHeader,true);
  if (binaryLength % 4 || view.getUint32(binaryHeader+4,true) !== 0x004e4942 || binaryHeader+8+binaryLength !== bytes.length) throw new Error('GLB needs exactly one embedded binary chunk');
  const doc = record(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(20,binaryHeader))), 'document');
  noExternalResources(doc);
  if (record(doc.asset,'asset').version !== '2.0') throw new Error('Unsupported GLB asset version');
  const buffers = list(doc.buffers,1,'buffers');
  if (buffers.length !== 1) throw new Error('GLB needs one embedded buffer');
  const bufferLength = integer(record(buffers[0], 'buffer').byteLength,1,binaryLength,'buffer size');
  if (binaryLength-bufferLength > 3) throw new Error('Invalid GLB buffer padding');
  const views = list(doc.bufferViews,256,'buffer views').map(item => {
    const entry = record(item,'buffer view');
    if (entry.buffer !== 0) throw new Error('Invalid GLB buffer reference');
    const offset = integer(entry.byteOffset ?? 0,0,bufferLength,'view offset');
    const length = integer(entry.byteLength,1,bufferLength-offset,'view length');
    const stride = entry.byteStride === undefined ? undefined : integer(entry.byteStride,4,252,'view stride');
    if (stride && stride % 4) throw new Error('Invalid GLB byte stride');
    choice(entry.target, [34962, 34963], 'buffer target');
    return { offset,length,stride };
  });
  let accessorValues = 0;
  const binaryStart = binaryHeader+8;
  const accessors = list(doc.accessors,256,'accessors').map(item => {
    const entry = record(item,'accessor');
    const source = views[integer(entry.bufferView,0,views.length-1,'accessor view')];
    const sizes: Record<number,number> = {5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
    const formats: Record<string,number> = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
    const size = sizes[integer(entry.componentType,5120,5126,'component type')];
    const components = typeof entry.type === 'string' && Object.hasOwn(formats,entry.type) ? formats[entry.type] : 0;
    if (!size || !components) throw new Error('Unsupported GLB accessor format');
    boolean(entry.normalized, 'normalized accessor');
    if (entry.normalized === true && [5125, 5126].includes(entry.componentType)) throw new Error('GLB float/uint32 accessors cannot be normalized');
    const count = integer(entry.count,1,100000,'accessor count');
    accessorValues += count*components;
    if (accessorValues > 1_000_000) throw new Error('GLB accessor budget exceeded');
    const offset = integer(entry.byteOffset ?? 0,0,source.length,'accessor offset');
    const stride = source.stride ?? size*components;
    if (stride < size*components || offset % size || source.offset % size || offset+(count-1)*stride+size*components > source.length) throw new Error('GLB accessor exceeds its buffer view');
    finiteVector(entry.min,components,'accessor minimum');
    finiteVector(entry.max,components,'accessor maximum');
    if (entry.min && entry.max && entry.min.some((min: number, i: number) => min > entry.max[i])) throw new Error('Invalid GLB accessor bounds');
    if (entry.componentType === 5126) {
      for (let i = 0; i < count; i++) for (let component = 0; component < components; component++) {
        const value = view.getFloat32(binaryStart+source.offset+offset+i*stride+component*size,true);
        if (!Number.isFinite(value) || Math.abs(value) > 1e6) throw new Error('GLB contains invalid floating-point vertex data');
      }
    }
    return { type: entry.type as string, componentType: entry.componentType as number, count,
      min: entry.min as number[] | undefined, max: entry.max as number[] | undefined,
      normalized: entry.normalized as boolean | undefined,
      offset: binaryStart + source.offset + offset, stride, sourceStride: source.stride };
  });
  const images = list(doc.images,8,'images');
  let pixels = 0;
  for (const item of images) {
    const image = record(item, 'image');
    if (image.mimeType !== 'image/png') throw new Error('GLB supports embedded PNG textures only');
    const source = views[integer(image.bufferView,0,views.length-1,'image view')];
    if (source.stride !== undefined) throw new Error('GLB image views cannot be interleaved');
    const dimensions = pngDimensions(bytes.subarray(binaryHeader+8+source.offset,binaryHeader+8+source.offset+source.length));
    pixels += dimensions.width * dimensions.height;
  }
  if (pixels > MAX_MODEL_PIXELS * 2) throw new Error('GLB total texture pixel budget exceeded');
  const { materials, textures } = validateMaterials(doc, images.length);
  const meshes = list(doc.meshes,64,'meshes');
  let primitives = 0;
  const meshCosts = meshes.map(item => {
    const mesh = record(item, 'mesh');
    if (mesh.weights !== undefined) throw new Error('GLB morph weights are unsupported');
    const entries = list(mesh.primitives,64,'primitives');
    if (!entries.length) throw new Error('GLB mesh needs triangle primitives');
    let vertices = 0;
    for (const item of entries) {
      const primitive = record(item, 'primitive');
      primitives++;
      if (primitives > 128) throw new Error('GLB primitive budget exceeded');
      if ((primitive.mode ?? 4) !== 4) throw new Error('GLB supports triangle primitives only');
      const attributes = record(primitive.attributes,'attributes');
      if (attributes.POSITION === undefined) throw new Error('GLB mesh needs positions');
      const position = accessors[integer(attributes.POSITION,0,accessors.length-1,'position accessor')];
      if (position.type !== 'VEC3' || position.componentType !== 5126 || !position.min || !position.max) throw new Error('GLB positions need float VEC3 data and bounds');
      for (const [name,index] of Object.entries(attributes)) {
        if (!['POSITION','NORMAL','TEXCOORD_0','TEXCOORD_1','COLOR_0','TANGENT'].includes(name)) throw new Error('Unsupported GLB mesh attribute');
        const accessor = accessors[integer(index,0,accessors.length-1,'mesh accessor')];
        const format = name.startsWith('TEXCOORD_') ? ['VEC2'] : name === 'TANGENT' ? ['VEC4'] : name === 'COLOR_0' ? ['VEC3', 'VEC4'] : ['VEC3'];
        const integerAttribute = name.startsWith('TEXCOORD_') || name === 'COLOR_0';
        if (!format.includes(accessor.type) || accessor.count !== position.count ||
          accessor.componentType !== 5126 && !(integerAttribute && [5121, 5123].includes(accessor.componentType) && accessor.normalized === true)) throw new Error('Unsupported GLB vertex attribute format/count');
      }
      let count = position.count;
      if (primitive.indices !== undefined) {
        const indices = accessors[integer(primitive.indices,0,accessors.length-1,'indices')];
        if (indices.type !== 'SCALAR' || ![5121, 5123, 5125].includes(indices.componentType) || indices.normalized || indices.sourceStride !== undefined) throw new Error('GLB indices need packed unsigned scalars');
        const restart = indices.componentType === 5121 ? 255 : indices.componentType === 5123 ? 65535 : 4294967295;
        for (let i = 0; i < indices.count; i++) {
          const offset = indices.offset + i * indices.stride;
          const value = indices.componentType === 5121 ? view.getUint8(offset) : indices.componentType === 5123 ? view.getUint16(offset, true) : view.getUint32(offset, true);
          if (value >= position.count || value === restart) throw new Error('GLB index exceeds vertex bounds');
        }
        count = indices.count;
      }
      if (count % 3) throw new Error('GLB triangle vertex/index count must be divisible by three');
      vertices += count;
      if (primitive.material !== undefined) {
        const material = materials[integer(primitive.material,0,materials.length-1,'material')];
        const pbr = material.pbrMetallicRoughness ?? {};
        for (const info of [pbr.baseColorTexture, pbr.metallicRoughnessTexture, material.normalTexture, material.occlusionTexture, material.emissiveTexture]) {
          if (info && attributes[`TEXCOORD_${info.texCoord ?? 0}`] === undefined) throw new Error('GLB material references missing texture coordinates');
        }
      }
    }
    return { vertices, primitives: entries.length };
  });
  if (!primitives || primitives > 128) throw new Error('GLB primitive budget exceeded');
  const nodes = list(doc.nodes,128,'nodes');
  const parents = new Set<number>();
  let renderedVertices = 0, renderedPrimitives = 0;
  const edges = nodes.map(item => {
    const node = record(item, 'node');
    if (node.skin !== undefined || node.weights !== undefined || node.camera !== undefined) throw new Error('GLB skins, morphs and cameras are unsupported');
    if (node.mesh !== undefined) {
      const cost = meshCosts[integer(node.mesh,0,meshes.length-1,'node mesh')];
      renderedVertices += cost.vertices;
      renderedPrimitives += cost.primitives;
    }
    if (renderedVertices > 500_000 || renderedPrimitives > 256) throw new Error('GLB expanded instance geometry budget exceeded');
    for (const [key,length] of Object.entries({translation:3,rotation:4,scale:3,matrix:16})) finiteVector(node[key],length,`node ${key}`);
    if (node.matrix !== undefined && [node.translation, node.rotation, node.scale].some(value => value !== undefined)) throw new Error('GLB nodes cannot mix matrix and TRS');
    if (node.rotation && Math.abs(Math.hypot(...node.rotation) - 1) > 0.0001) throw new Error('GLB rotations need unit quaternions');
    return list(node.children,128,'children').map(child => {
      const id = integer(child,0,nodes.length-1,'child node');
      if (parents.has(id)) throw new Error('GLB nodes must have a single parent');
      parents.add(id);
      return id;
    });
  });
  const visited = new Set<number>(), visiting = new Set<number>();
  const visit = (id: number) => {
    if (visiting.has(id)) throw new Error('Cyclic GLB node hierarchy');
    if (visited.has(id)) return;
    visiting.add(id);
    edges[id].forEach(visit);
    visiting.delete(id); visited.add(id);
  };
  nodes.forEach((_,id) => visit(id));
  const scenes = list(doc.scenes,1,'scenes');
  if (!scenes.length) throw new Error('GLB needs an explicit scene');
  if (doc.scene !== undefined) integer(doc.scene,0,scenes.length-1,'default scene');
  for (const item of scenes) {
    const scene = record(item, 'scene');
    const roots = new Set<number>();
    for (const node of list(scene.nodes,128,'scene nodes')) {
      const id = integer(node,0,nodes.length-1,'scene node');
      if (parents.has(id) || roots.has(id)) throw new Error('GLB scene roots must be distinct parentless nodes');
      roots.add(id);
    }
  }
  return { nodes:nodes.length,meshes:meshes.length,textures:textures.length };
}

export function validateSceneModels(models: unknown): void {
  if (models === undefined) return;
  const entries = Object.entries(record(models,'attachments'));
  if (entries.length > 2) throw new Error('Attach at most two GLB models');
  for (const [id,source] of entries) {
    if (!/^model_[12]$/.test(id) || typeof source !== 'string') throw new Error('Invalid scene model attachment');
    validateGLB(decodeModelData(source));
  }
}
