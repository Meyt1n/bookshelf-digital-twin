import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  title?: string
  hint?: string
  fallbackClassName?: string
}

type State = { error: Error | null }

/** 捕获子树渲染/加载异常，避免整页白屏 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  private retry = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const title = this.props.title ?? '界面暂时不可用'
    const hint = this.props.hint ?? '可重试加载；若持续失败请刷新页面。'
    return (
      <div className={this.props.fallbackClassName ?? 'error-boundary'} role="alert">
        <div className="error-boundary-card">
          <b>{title}</b>
          <p className="c-dim">{hint}</p>
          <p className="error-boundary-detail mono">{error.message}</p>
          <button type="button" className="btn primary" onClick={this.retry}>
            重试
          </button>
        </div>
      </div>
    )
  }
}
