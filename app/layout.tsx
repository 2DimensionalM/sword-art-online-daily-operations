import type { Metadata } from 'next';
import './globals.css';
import './dashboard.css';
import './brand.css';
import './signal-room.css';

export const metadata: Metadata = {
  title: 'Sword Art Online',
  description: 'A local-first life command dashboard for missions, time, routines, and daily progress.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/sao-tv-icon-v4-512.png',
    shortcut: '/sao-tv-icon-v4-192.png',
    apple: '/sao-tv-icon-v4-512.png',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
