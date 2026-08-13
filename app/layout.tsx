import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Life — Personal Biodiversity Database',description:'A local-first personal biodiversity database for recording your species life list.',manifest:'/manifest.webmanifest',themeColor:'#2f6b4f'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
