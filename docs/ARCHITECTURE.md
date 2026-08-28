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
- 总览 HUD 用 `useTwinSelector` 切片订阅（见 `src/twin/selectors.ts`），避免 4Hz 全树刷新。
- 遥测/事件流用 `useThrottledTwinSelector`（约 2Hz）进一步降闪。
- 总览页保活：切走时 `page-layer.is-parked` + Canvas `frameloop="never"`，避免 3D 冷启动。
- GLB：Meshopt 压缩 + `MeshoptGLTFLoader`；分批挂载；柜体 `rel=preload`；送书车/塑封动态分包。
- 字体 `display=optional` + 系统栈兜底；低端档/`prefers-reduced-motion` 关闭极光与星尘。
- 快捷键：空格急停、数字 1–0 机位、H 打开任务回放。
- 生产环境注册 `public/sw.js` 缓存壳页与 `/model/*`。
- 主题：`data-theme=aurora|contrast|venue`（顶栏切换）。
- 窄屏：3D 全宽 + 底栏抽屉切换左右面板。
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
  - push 仅在 `main` 触发；分支验证走 pull_request 事件（避免 push + PR 双跑计费翻倍）
  - `concurrency` 取消同分支旧 run；`timeout-minutes: 10` 兜底
  - **已知限制**：仓库为私有，Actions 按分钟计费。历史上所有 run 在 ~5s
    内失败、无任何 step 执行，是账号计费问题（"job was not started because
    recent account payments have failed or your spending limit needs to be
    increased"），需在 GitHub Settings → Billing & plans 修复支付 / 提高
    Actions 消费上限，或将仓库转为公开；与工作流内容无关
