import { PHASE_LABELS } from '../twin/engine'
import { modulesEqual, selectModules } from '../twin/selectors'
import { useTwinSelector } from '../twin/useTwin'
import type { ModuleStatus } from '../types'

type Row = {
  key: string
  name: string
  desc: string
  status: ModuleStatus | 'fault'
  statusText: string
}

function badgeClass(status: Row['status']): string {
  if (status === 'running') return 'badge badge-run'
  if (status === 'done') return 'badge badge-done'
  if (status === 'fault') return 'badge badge-fault'
  return 'badge badge-idle'
}

export function ModulesPanel() {
  const { task, ocr, modules } = useTwinSelector(selectModules, modulesEqual)

  let gantryStatus: Row['status'] = 'idle'
  let gantryText = '待机'
  if (task) {
    if (task.phase === 'fault') {
      gantryStatus = 'fault'
      gantryText = '急停'
    } else if (task.phase === 'done') {
      gantryStatus = 'done'
      gantryText = '完成'
    } else {
      gantryStatus = 'running'
      gantryText = PHASE_LABELS[task.phase]
    }
  }

  let gripStatus: Row['status'] = 'idle'
  let gripText = '张开'
  let gripDesc = '挂在丝杆上 · 只左右横移'
  if (task) {
    if (task.phase === 'fault') {
      gripStatus = 'fault'
      gripText = '急停'
      gripDesc = '夹爪随横梁回第二层最左侧'
    } else if (task.phase === 'deliver') {
      gripStatus = 'running'
      gripText = '原地待命'
      gripDesc = '停在大隔间口，不移动；送书机器人从柜后把书直着送进隔间'
    } else if (task.phase === 'scan') {
      gripStatus = 'running'
      gripText = '张开等候'
      gripDesc = '夹板夹紧后摄像头拍照，夹爪停在槽口张开接书'
    } else if (task.phase === 'handoff') {
      gripStatus = 'running'
      gripText = task.action === 'store' ? '接书夹住' : '交书'
      gripDesc =
        task.action === 'store'
          ? '夹爪不动，底部履带把书送到夹爪后夹住'
          : '把书送进大隔间，送书机器人从柜后接走'
    } else if (task.phase === 'operate') {
      gripStatus = 'running'
      gripText = task.action === 'take' ? '夹取' : '放书'
      gripDesc = task.action === 'take' ? '隔间履带到槽口后，内履带卷入' : '内履带送到槽口，隔间履带送入深处'
    } else if (task.phase === 'traverse') {
      gripStatus = 'running'
      gripText = '横移'
      gripDesc = '沿丝杆左右移到目标隔间，不前后移动'
    } else if (task.phase === 'retract') {
      gripStatus = 'running'
      gripText = task.action === 'take' ? '持书回左侧' : '空载回左侧'
      gripDesc = '沿丝杆回到最左侧'
    } else if (task.phase === 'lift') {
      gripStatus = 'running'
      gripText = task.action === 'store' ? '持书升降' : '随梁升降'
      gripDesc = '夹爪停在最左侧，随横梁竖直移动'
    } else if (task.phase === 'return') {
      gripStatus = 'running'
      gripText = task.action === 'take' ? '持书回起点' : '空载回起点'
      gripDesc = '夹爪停在最左侧，随横梁回到第二层起点'
    } else if (task.phase === 'done') {
      gripStatus = 'done'
      gripText = '完成'
      gripDesc = '已回到第二层最左侧起点'
    }
  }

  let plateStatus: Row['status'] = 'idle'
  let plateText = '松开'
  let plateDesc = '第二层最左侧大隔间 · 夹板松开，底部履带待命'
  if (task) {
    if (task.phase === 'fault') {
      plateStatus = 'fault'
      plateText = '急停'
      plateDesc = '大隔间停止作业'
    } else if (task.phase === 'deliver') {
      plateStatus = 'running'
      plateText = '夹紧固定'
      plateDesc = '书到位后两侧夹板合拢固定，再顿住等摄像头拍照'
    } else if (task.phase === 'scan') {
      plateStatus = 'running'
      plateText = '夹紧拍照'
      plateDesc = '夹板夹住图书，大隔间上方摄像头对书封闪光识别'
    } else if (task.phase === 'handoff') {
      plateStatus = 'running'
      plateText = task.action === 'store' ? '履带交爪' : '交车'
      plateDesc =
        task.action === 'store'
          ? '夹板夹住图书直到交给夹爪，底部履带把书送到夹爪'
          : '夹爪放书后夹板固定，再由履带交给送书机器人'
    } else if (task.phase === 'operate') {
      plateStatus = 'running'
      plateText = task.action === 'store' ? '推进' : '送出'
      plateDesc = task.action === 'store' ? '目标格隔间履带把书运往深处' : '目标格隔间履带把书送到槽口'
    } else if (task.phase === 'done') {
      plateStatus = 'done'
      plateText = '松开'
      plateDesc = '大隔间夹板已松开'
    }
  }

  let cartStatus: Row['status'] = 'idle'
  let cartText = '巡游'
  let cartDesc = '柜后待命 · 把书直送第二层左侧大隔间'
  if (ocr && !task) {
    cartStatus = 'running'
    cartText = '送书中'
    cartDesc = '从柜后驶向大隔间送书'
  } else if (task) {
    if (task.phase === 'fault') {
      cartStatus = 'fault'
      cartText = '急停'
      cartDesc = '机器人停止作业'
    } else if (task.action === 'store' && task.phase === 'deliver') {
      cartStatus = 'running'
      cartText = '直送'
      cartDesc = `从柜后把《${task.title}》直着放入大隔间`
    } else if (task.action === 'store' && task.phase === 'scan') {
      cartStatus = 'running'
      cartText = '停靠'
      cartDesc = '书已交给夹板，停在柜后等候识别完成'
    } else if (task.action === 'store' && task.phase === 'handoff') {
      cartStatus = 'running'
      cartText = '待命'
      cartDesc = '书已放入大隔间，停在柜后'
    } else if (task.action === 'store' && ['dispatch', 'ack'].includes(task.phase)) {
      cartStatus = 'running'
      cartText = '驶入'
      cartDesc = '从柜后出现，对准大隔间'
    } else if (task.action === 'take' && task.phase === 'handoff') {
      cartStatus = 'running'
      cartText = '接书'
      cartDesc = '在柜后把书从大隔间接走'
    } else if (task.action === 'take' && ['lift', 'traverse', 'operate', 'retract', 'return'].includes(task.phase)) {
      cartStatus = 'running'
      cartText = '就位'
      cartDesc = '从柜后驶向大隔间，等候取书'
    } else if (task.phase === 'done') {
      cartStatus = 'done'
      cartText = '完成'
      cartDesc = '返回巡游'
    }
  }

  const rows: Row[] = [
    {
      key: 'gantry',
      name: '升降取书机构',
      desc: task ? `目标 ${task.floor} 层 ${task.cell} 号格 ·《${task.title}》` : '停在第二层最左侧起点',
      status: gantryStatus,
      statusText: gantryText,
    },
    {
      key: 'gripper',
      name: '柔性夹爪',
      desc: gripDesc,
      status: gripStatus,
      statusText: gripText,
    },
    {
      key: 'pusher',
      name: '大隔间夹板',
      desc: plateDesc,
      status: plateStatus,
      statusText: plateText,
    },
    {
      key: 'cart',
      name: '送书机器人',
      desc: cartDesc,
      status: cartStatus,
      statusText: cartText,
    },
    {
      key: 'camera',
      name: '视觉识别 (YOLO+OCR)',
      desc: ocr
        ? ocr.stages.find((s) => !s.emitted)?.text ?? '正在识别书封文本…'
        : '大隔间上方摄像头待命',
      status: modules.camera.status,
      statusText: modules.camera.status === 'running' ? '识别中' : '待机',
    },
    {
      key: 'uv',
      name: '紫外线消毒',
      desc: modules.uv.status === 'running' ? '灯管功率 36W · 扫描中' : '灯管就绪',
      status: modules.uv.status,
      statusText: modules.uv.status === 'running' ? '消毒中' : modules.uv.status === 'done' ? '已完成' : '待机',
    },
    {
      key: 'laminate',
      name: '塑封书籍',
      desc: modules.laminate.status === 'running'
        ? '柜底抽屉加热通道 · 整本过片中'
        : modules.laminate.status === 'done'
          ? '覆膜完成 · 成品停在入口'
          : '柜底抽屉待命',
      status: modules.laminate.status,
      statusText: modules.laminate.status === 'running' ? '塑封中' : modules.laminate.status === 'done' ? '已完成' : '待机',
    },
  ]

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>
          执行机构<span className="panel-sub">ACTUATORS</span>
        </h2>
      </header>
      <ul className="module-list">
        {rows.map((row) => (
          <li key={row.key} className="module-row">
            <span className={`module-dot md-${row.status}`} />
            <div className="module-info">
              <div className="module-name">{row.name}</div>
              <div className="module-desc">{row.desc}</div>
            </div>
            <span className={badgeClass(row.status)}>{row.statusText}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
