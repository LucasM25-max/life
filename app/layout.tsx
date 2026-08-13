import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Life — Species Life List',
  description: 'A personal biodiversity database for recording your species life list.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
