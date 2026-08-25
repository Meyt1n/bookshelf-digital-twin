import { ACK_LABELS } from '../twin/engine'
import { hex2 } from '../format'
import type { TwinSnapshot } from '../types'

const REG_ROWS: Array<{ addr: number; name: string; key: 'newCmdFlag' | 'cmd' | 'floorId' | 'cellId' | 'ack' }> = [
  { addr: 0, name: 'NEW_CMD_FLAG', key: 'newCmdFlag' },
  { addr: 1, name: 'CMD', key: 'cmd' },
  { addr: 2, name: 'FLOOR_ID', key: 'floorId' },
  { addr: 3, name: 'CELL_ID', key: 'cellId' },
  { addr: 4, name: 'ACK', key: 'ack' },
]

function ackChipClass(ack: number): string {
  if (ack === 0x00) return 'ack-chip ok'
  if (ack === 0xff) return 'ack-chip pending'
  if (ack === 0x03) return 'ack-chip fault'
  return 'ack-chip warn'
}

/** STM32 I2C 寄存器组镜像（对应 services/stm32_protocol.py 寄存器表） */
export function RegisterPanel({ snapshot }: { snapshot: TwinSnapshot }) {
  const regs = snapshot.registers
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>
          STM32 寄存器<span className="panel-sub">REGISTERS</span>
        </h2>
        <span className="panel-hint">I2C · 0x30</span>
      </header>
      <table className="reg-table">
        <tbody>
          {REG_ROWS.map((row) => {
            const value = regs[row.key]
            return (
              <tr key={row.key}>
                <td className="reg-addr">{hex2(row.addr)}</td>
                <td className="reg-name">{row.name}</td>
                <td className="reg-value">
                  <span key={`${row.key}-${value}`} className="reg-hex flash">
                    {hex2(value)}
                  </span>
                </td>
                <td className="reg-extra">
                  {row.key === 'ack' && <span className={ackChipClass(value)}>{ACK_LABELS[value] ?? '—'}</span>}
                  {row.key === 'cmd' && value !== 0 && (
                    <span className="reg-note">{value === 0x01 ? 'FETCH' : 'STORE'}</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
