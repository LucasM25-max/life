import type { Metadata,Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Life — Personal Biodiversity Database',description:'A local-first personal biodiversity database for recording your species life list.',manifest:'/manifest.webmanifest'};
export const viewport: Viewport = {themeColor:'#2f6b4f',width:'device-width',initialScale:1};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
