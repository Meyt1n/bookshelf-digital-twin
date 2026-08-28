# GLB 资产管线

## 源模型

实体柜体来自 SolidWorks `智能书柜.STEP`（约 147 零件），经 `cascadio` 转 GLB 并按功能拆分：

| 文件 | 内容 |
|------|------|
| `public/model/bookcase-body.glb` | 柜体主体 |
| `public/model/bookcase-beam.glb` | 悬梁臂横梁组 |
| `public/model/bookcase-head.glb` | 柔性夹爪（含 `gripper-left` / `gripper-right`） |
| `public/model/delivery-robot.glb` | 送书机器人 |

运行时按 mesh 名/坐标做轻量网格手术（掏空格口、拆夹板等），**导出时请保持 mesh 命名与坐标系稳定**。

当前仓库中的四个 GLB 保持**第一版未压缩**形态，由 `THREE.GLTFLoader` 直读（见 `Bookshelf` / `Gantry` / `DeliveryCart`）。

## 离线优化（慎用）

```bash
npm run optimize:glb
```

若对上述资产做 Meshopt 压缩，必须：

- `--join false`：保留命名 mesh
- `--simplify false`：保留三角面与 CAD 坐标，否则大隔间夹板拆分 / 掏空会失效

更稳妥的做法是继续使用未压缩 GLB；压缩后还可能因 quantize 节点矩阵导致分件拆出后缩放丢失。

## 前端加载约定

- 路径固定为 `/model/*.glb`（Vite `public/`）
- `TwinScene` 懒加载；Suspense 展示装载态；ErrorBoundary 捕获解析失败
- 触控设备降低 Canvas `dpr`，优先帧率
