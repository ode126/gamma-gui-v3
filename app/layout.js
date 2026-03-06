import './globals.css';

export const metadata = {
  title: 'Gamma v3 — xray POC / 指纹生成器',
  description: 'Claude AI 驱动的 xray YAML 插件生成工作台',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
