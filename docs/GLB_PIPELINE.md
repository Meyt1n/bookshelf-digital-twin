# GLB 资产管线

## 源模型

实体柜体来自 SolidWorks `智能书柜.STEP`（约 147 零件），经 `cascadio` 转 GLB 并按功能拆分：

| 文件 | 内容 |
|------|------|
| `public/model/bookcase-body.glb` | 柜体主体 |
| `public/model/bookcase-beam.glb` | 悬梁臂横梁组 |
| `public/model/bookcase-head.glb` | 柔性夹爪（含 `gripper-left` / `gripper-right`） |
| `public/model/delivery-robot.glb` | 送书机器人 |

运行时仍会按 mesh 名/坐标做轻量网格手术（掏空格口、拆夹板等），**导出时请保持 mesh 命名与坐标系稳定**。

## 离线优化（推荐，无需改 Loader）

不引入 Meshopt/Draco 解码器，保持 `THREE.GLTFLoader` 直读：

```bash
npm run optimize:glb
```

脚本调用 `@gltf-transform/cli optimize`：weld / dedup / prune 等，原地覆盖 `public/model/*.glb`。

若需进一步压缩（会改运行时）：

1. `gltf-transform optimize in.glb out.glb --compress meshopt`
2. 在场景中接入 `MeshoptDecoder`（或迁移到 `@react-three/drei` `useGLTF`）
3. 回归夹爪开合与大隔间掏空逻辑

## 前端加载约定

- 路径固定为 `/model/*.glb`（Vite `public/`）
- `TwinScene` 懒加载；Suspense 展示装载态；ErrorBoundary 捕获解析失败
- 触控设备降低 Canvas `dpr`，优先帧率
