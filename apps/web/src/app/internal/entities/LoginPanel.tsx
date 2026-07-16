import { InternalLoginPanel } from '../components/InternalLoginPanel'

interface LoginPanelProps {
  isConfigured: boolean
}

export function LoginPanel({ isConfigured }: LoginPanelProps) {
  return (
    <InternalLoginPanel
      isConfigured={isConfigured}
      kicker="Internal memory browser"
      title="Open entity folders"
      copy="Enter the internal dashboard token to inspect saved entity memories."
    />
  )
}
