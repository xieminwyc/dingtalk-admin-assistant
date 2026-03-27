import type { Metadata } from "next";
import "./globals.css";

// 先把全站元信息统一放在 layout，后面补品牌名或分享信息时只改这一处。
export const metadata: Metadata = {
  title: "DingTalk Admin Assistant",
  description: "钉钉行政万事通 MVP"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
