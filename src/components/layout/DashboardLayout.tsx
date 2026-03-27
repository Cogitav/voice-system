import { ReactNode } from 'react';
import { AppShell } from './AppShell';

interface DashboardLayoutProps {
  children: ReactNode;
}

/**
 * DashboardLayout — backwards-compatible wrapper around AppShell.
 * All pages can use either DashboardLayout or AppShell directly.
 */
export function DashboardLayout({ children }: DashboardLayoutProps) {
  return <AppShell>{children}</AppShell>;
}
