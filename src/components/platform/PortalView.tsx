import type { ReactNode } from 'react'

/**
 * Soft flip between portal menu panels. Changing `viewKey` remounts the panel
 * so the enter animation always runs once per navigation.
 */
export default function PortalView({
  viewKey,
  children,
  className = '',
}: {
  viewKey: string
  children: ReactNode
  className?: string
}) {
  return (
    <div key={viewKey} className={`portal-view${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  )
}
