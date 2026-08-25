import { fmtTime, hex2 } from '../format'
import { ACK_LABELS } from '../twin/engine'
import { twinEngine } from '../twin/useTwin'
import type { LinkState, TwinSnapshot } from '../types'

const LINK_META: Record<string, { icon: string; desc: string }> = {
  ui: { icon: '🖥', desc: '孪生驾驶舱前端 · React + Three.js' },
  flask: { icon: '⬢', desc: 'bookshelf 主服务 · Flask :5000' },
  pi: { icon: '◱', desc: '树莓派桥接 · pi_bridge :8765' },
  stm32: { icon: '▤', desc: '电机控制器 · I2C 从机 0x30' },
}

function statusLabel(link: LinkState): { text: string; cls: string } {
  switch (link.status) {
    case 'online':
      return { text: `在线 ${link.latencyMs !== null ? `· ${link.latencyMs}ms` : ''}`, cls: 'ok' }
    case 'sim':
      return { text: '仿真镜像', cls: 'sim' }
    case 'offline':
      return { text: '离线', cls: 'bad' }
    default:
      return { text: '状态未知', cls: 'unknown' }
  }
}

function LinkTopology({ snapshot }: { snapshot: TwinSnapshot }) {
  return (
    <section className="panel topo-panel">
      <header className="panel-head">
        <h2>
          数据链路拓扑<span className="panel-sub">LINK TOPOLOGY</span>
        </h2>
        <span className="panel-hint">
          {snapshot.mode === 'live' ? '联机 · 实测链路' : '仿真 · 镜像链路'}
        </span>
      </header>
      <div className="topo-flow">
        {snapshot.links.map((link, i) => {
          const st = statusLabel(link)
          return (
            <div key={link.id} className="topo-node-wrap">
              {i > 0 && (
                <div className={`topo-wire ${link.status === 'offline' ? 'broken' : ''}`}>
                  <span className="topo-packet" />
                </div>
              )}
              <div className={`topo-node st-${st.cls}`}>
                <span className="topo-icon">{LINK_META[link.id].icon}</span>
                <div className="topo-name">{link.label}</div>
                <div className="topo-desc">{LINK_META[link.id].desc}</div>
                <span className={`topo-status ${st.cls}`}>{st.text}</span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function SelfCheckPanel({ snapshot }: { snapshot: TwinSnapshot }) {
  const sc = snapshot.selfCheck
  const doneCount = sc ? sc.stages.filter((s) => s.emitted).length : 0
  const total = sc ? sc.stages.length : 0
  const finished = sc !== null && sc.finishedAt !== null
  return (
    <section className="panel selfcheck-panel">
      <header className="panel-head">
        <h2>
          系统自检<span className="panel-sub">SELF CHECK</span>
        </h2>
        <span className="panel-hint">pi_bridge/self_check</span>
      </header>
      <p className="selfcheck-desc">
        依次检测 I2C 总线、寄存器回环、电机微动、传感器与外设通电状态，对应实体端
        <code> python self_check.py</code> 流程。
      </p>
      <button
        type="button"
        className="btn btn-cyan btn-block"
        disabled={sc !== null}
        onClick={() => twinEngine.commandSelfCheck()}
      >
        {sc === null ? '▶ 运行一键自检' : finished ? '✓ 自检完成' : `自检中… ${doneCount}/${total}`}
      </button>
      {sc && (
        <>
          <div className="task-progress selfcheck-progress">
            <span style={{ width: `${(doneCount / Math.max(1, total)) * 100}%` }} />
          </div>
          <ul className="selfcheck-list">
            {sc.stages.map((stage, i) => (
              <li key={i} className={stage.emitted ? 'done' : ''}>
                <i>{stage.emitted ? '✓' : '·'}</i>
                {stage.text}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function DeviceCards({ snapshot }: { snapshot: TwinSnapshot }) {
  const { task, modules, telemetry, stats } = snapshot
  const traversing = task !== null && ['traverse', 'retract'].includes(task.phase)
  const lifting = task !== null && ['lift', 'return'].includes(task.phase)
  const operating = task !== null && task.phase === 'operate'
  const bayBusy = task !== null && (task.phase === 'deliver' || task.phase === 'handoff')
  const gripping =
    task !== null &&
    ['deliver', 'handoff', 'lift', 'traverse', 'operate', 'retract', 'return'].includes(task.phase)
  const cartBusy =
    snapshot.ocr !== null ||
    (task !== null && !['done', 'fault'].includes(task.phase))
  const motionCount = Object.values(stats.cellActivity).reduce((a, b) => a + b, 0)

  const devices = [
    {
      name: '横移电机 X',
      model: '42BYGH · TMC2209',
      status: traversing ? 'running' : 'idle',
      statusText: traversing ? '运行中' : '待机',
      metric: `${motionCount} 次动作`,
      health: 98.2,
    },
    {
      name: '升降电机 Y',
      model: '57BYGH · 闭环步进',
      status: lifting ? 'running' : 'idle',
      statusText: lifting ? '运行中' : '待机',
      metric: `${motionCount} 次动作`,
      health: 97.6,
    },
    {
      name: '槽口履带',
      model: '隔间输送 · 槽口交接',
      status: operating ? 'running' : 'idle',
      statusText: operating ? '输送中' : '待机',
      metric: `${stats.storeCount + stats.takeCount} 次今日`,
      health: 98.4,
    },
    {
      name: '柔性夹爪',
      model: '第二层最左侧待机 · 只左右横移',
      status: gripping ? 'running' : 'idle',
      statusText: gripping ? '作业中' : '张开待机',
      metric: '不前后移动',
      health: 98.1,
    },
    {
      name: '大隔间夹板',
      model: '第二层最左侧 · 弹簧夹板 + 底部履带',
      status: bayBusy ? 'running' : 'idle',
      statusText: bayBusy ? '作业中' : '松开待命',
      metric: '夹紧后履带送向夹爪',
      health: 98.0,
    },
    {
      name: '送书机器人',
      model: '1kg 举升 · 柜后直送',
      status: cartBusy ? 'running' : 'idle',
      statusText: cartBusy ? '作业中' : '巡游',
      metric: '从柜后把书直着放入',
      health: 97.8,
    },
    {
      name: '视觉摄像头',
      model: 'IMX335 · 1080P',
      status: modules.camera.status,
      statusText: modules.camera.status === 'running' ? '识别中' : '待命',
      metric: 'YOLO+PaddleOCR',
      health: 99.4,
    },
    {
      name: 'UV 消毒灯管',
      model: '254nm · 36W ×2',
      status: modules.uv.status,
      statusText: modules.uv.status === 'running' ? '消毒中' : '就绪',
      metric: `${stats.uvCount} 次今日`,
      health: 96.8,
    },
    {
      name: '塑封加热通道',
      model: '柜底抽屉 · 加热片 110°C',
      status: modules.laminate.status,
      statusText: modules.laminate.status === 'running' ? '塑封中' : modules.laminate.status === 'done' ? '已完成' : '冷却',
      metric: `${stats.laminateCount} 次今日`,
      health: 97.9,
    },
    {
      name: '温湿度传感器',
      model: 'DHT22 · 0.5Hz',
      status: 'running',
      statusText: '采样中',
      metric: `${telemetry.temperature.toFixed(1)}°C / ${Math.round(telemetry.humidity)}%`,
      health: 99.8,
    },
    {
      name: '语音单元',
      model: '麦阵 + Vosk / Piper',
      status: 'idle',
      statusText: '唤醒待命',
      metric: '唤醒词「小燕」',
      health: 98.9,
    },
  ]

  return (
    <section className="panel device-panel">
      <header className="panel-head">
        <h2>
          硬件健康<span className="panel-sub">HARDWARE</span>
        </h2>
      </header>
      <div className="device-grid">
        {devices.map((dev) => (
          <div key={dev.name} className="device-card">
            <div className="device-head">
              <span className={`module-dot md-${dev.status === 'done' ? 'done' : dev.status === 'running' ? 'running' : 'idle'}`} />
              <span className="device-name">{dev.name}</span>
              <span className={`badge ${dev.status === 'running' ? 'badge-run' : dev.status === 'done' ? 'badge-done' : 'badge-idle'}`}>{dev.statusText}</span>
            </div>
            <div className="device-model">{dev.model}</div>
            <div className="device-foot">
              <span className="device-metric">{dev.metric}</span>
              <span className={`device-health ${dev.health >= 98.5 ? 'hi' : dev.health >= 97 ? 'mid' : 'lo'}`}>
                <span className="health-track">
                  <span className="health-fill" style={{ width: `${dev.health}%` }} />
                </span>
                {dev.health.toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function CommandLog({ snapshot }: { snapshot: TwinSnapshot }) {
  const rows = snapshot.events.filter((e) => e.kind === 'motion' || e.kind === 'diag').slice(0, 26)
  return (
    <section className="panel panel-grow">
      <header className="panel-head">
        <h2>
          指令收发日志<span className="panel-sub">MOTION / DIAG</span>
        </h2>
        <span className="live-pip">
          <i />
          LIVE
        </span>
      </header>
      <div className="panel-scroll">
        <ul className="cmd-log">
          {rows.map((evt) => (
            <li key={evt.id} className={`lv-${evt.level}`}>
              <span className="cmd-time">{fmtTime(evt.at)}</span>
              <span className="cmd-text">{evt.text}</span>
            </li>
          ))}
          {rows.length === 0 && <li className="inv-empty">暂无指令记录</li>}
        </ul>
      </div>
    </section>
  )
}

function ProtocolPanel({ snapshot }: { snapshot: TwinSnapshot }) {
  const regs = snapshot.registers
  const regRows: Array<{ addr: number; name: string; value: number }> = [
    { addr: 0, name: 'NEW_CMD_FLAG', value: regs.newCmdFlag },
    { addr: 1, name: 'CMD', value: regs.cmd },
    { addr: 2, name: 'FLOOR_ID', value: regs.floorId },
    { addr: 3, name: 'CELL_ID', value: regs.cellId },
    { addr: 4, name: 'ACK', value: regs.ack },
  ]
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>
          I2C 协议镜像<span className="panel-sub">STM32 · 0x30</span>
        </h2>
      </header>
      <table className="reg-table">
        <tbody>
          {regRows.map((row) => (
            <tr key={row.name}>
              <td className="reg-addr">{hex2(row.addr)}</td>
              <td className="reg-name">{row.name}</td>
              <td className="reg-value">
                <span key={`${row.name}-${row.value}`} className="reg-hex flash">
                  {hex2(row.value)}
                </span>
              </td>
              <td className="reg-extra">
                {row.name === 'ACK' && (
                  <span className={`ack-chip ${row.value === 0 ? 'ok' : row.value === 0xff ? 'pending' : 'fault'}`}>
                    {ACK_LABELS[row.value] ?? '—'}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="proto-notes">
        <div className="proto-note">
          <b>CMD</b> 0x01 取书 FETCH · 0x02 存书 STORE
        </div>
        <div className="proto-note">
          <b>ACK</b> 0x00 OK · 0x01 BUSY · 0x02 PARAM_ERR · 0x03 FAULT · 0xFF PENDING
        </div>
        <div className="proto-note">
          <b>流程</b> Pi 写入指令并置 NEW_CMD_FLAG=1 → STM32 消费后清零并回写 ACK
        </div>
      </div>
    </section>
  )
}

export function DevicesPage({ snapshot }: { snapshot: TwinSnapshot }) {
  return (
    <div className="page page-devices">
      <LinkTopology snapshot={snapshot} />
      <div className="devices-mid">
        <SelfCheckPanel snapshot={snapshot} />
        <DeviceCards snapshot={snapshot} />
      </div>
      <div className="devices-bottom">
        <CommandLog snapshot={snapshot} />
        <ProtocolPanel snapshot={snapshot} />
      </div>
    </div>
  )
}
