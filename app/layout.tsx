import type { Metadata } from 'next';
import './globals.css';
import './studio.css';
import AppFrame from '@/components/app-frame';
export const metadata:Metadata={title:'怎么用好AI · 选题库',description:'从官方一手来源，发现值得拍成视频的AI故事。私人选题工作台。',icons:{icon:'/favicon.svg',shortcut:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="zh-CN" suppressHydrationWarning><body><AppFrame>{children}</AppFrame></body></html>}
