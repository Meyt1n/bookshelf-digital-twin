import type { LoadingManager } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

let configured = false

export function ensureMeshopt(loader: GLTFLoader): GLTFLoader {
  if (!configured) {
    loader.setMeshoptDecoder(MeshoptDecoder)
    configured = true
  }
  return loader
}

/** R3F useLoader 可用的 GLTFLoader 子类，构造时自动配置 Meshopt 解码器 */
export class MeshoptGLTFLoader extends GLTFLoader {
  constructor(manager?: LoadingManager) {
    super(manager)
    this.setMeshoptDecoder(MeshoptDecoder)
  }
}

export function createGltfLoader(manager?: LoadingManager): GLTFLoader {
  return ensureMeshopt(new GLTFLoader(manager))
}
