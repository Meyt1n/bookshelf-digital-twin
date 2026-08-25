# 架构与约定

## 分层

```text
UI (components/)  ← TwinSnapshot props / useTwinSelector
        ↑ 250ms immutable snapshots
TwinEngine (twin/engine.ts)  ← sim tick + live sync
        ↑ 60fps sample* pose functions (bypass React)
R3F scene (scene/) ← useFrame reads twinEngine.sample*
```

- **不要大改** `TwinEngine` 任务状态机与 `sample*` 运动编排；仿真已较完善。前端优化优先走分包、加载态、ErrorBoundary、selector。
- 联机边界校验放在 [`src/twin/liveApi.ts`](../src/twin/liveApi.ts)，引擎只消费校验后的数据。
- 相机预设独立于重型 3D 模块：[`src/scene/cameraPresets.ts`](../src/scene/cameraPresets.ts)，便于页面懒加载 `TwinScene`。

## 前端表现约定

- 路由：条件渲染 + `React.lazy` 分包（图书 / 分析 / 设备 / 3D 场景）。
- 顶栏用 `useTwinSelector` 订阅切片，避免无关键字段变化导致重渲染。
- 3D Canvas：触控端降低 `dpr`、关闭抗锯齿；GLB 加载用 Suspense + ErrorBoundary。
- 样式按区域拆在 `src/styles/*.css`，由 `src/index.css` `@import` 聚合。

## 联机 API 契约（校验侧）

| 端点 | 校验入口 | 期望 |
|------|----------|------|
| `GET /api/climate` | `parseClimateEnvelope` | `{ ok: true, data: { temperature, humidity, source } }` |
| `GET /api/borrow_logs` | `parseBorrowLogsEnvelope` | `{ data: DeviceBorrowLog[] }` |
| `GET /api/compartments` | `parseLiveCompartments` | 数组项含 `cid/x/y/status/book` |
| `GET /api/voice_stream` SSE | `parseStreamPayload` | JSON：connected / voice / shelf_watch |
| `POST /api/take` + `/api/motion/commit` | `parseOkEnvelope` | `{ ok, message?, data? }` |

字段语义：`compartments.x` = floor，`y` = cell（与实体库一致）。

## GLB 导出与优化

见 [GLB_PIPELINE.md](./GLB_PIPELINE.md)。

## 测试与 CI

- 纯逻辑：`npm test`（Vitest：`layout` / `format` / `liveApi` / `cameraPresets`）
- CI：`.github/workflows/ci.yml` → `npm ci` + lint + test + build
