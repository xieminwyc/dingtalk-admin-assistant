export default function Home() {
  return (
    <main className="status-shell">
      <section className="status-card">
        <p className="status-eyebrow">DingTalk Bot Debug</p>
        <h1>钉钉机器人后端已启动</h1>
        <p className="status-description">
          当前项目只保留机器人与 Stream Mode 调试能力。
        </p>
      </section>

      <section className="status-card">
        <h2>当前开发入口</h2>
        <ul className="status-list">
          <li>
            <code>npm run dev</code>：启动 Next.js 服务与本地调试页
          </li>
          <li>
            <code>npm run stream:dev</code>：启动钉钉 Stream 长连接并监听代码变更自动重启
          </li>
          <li>
            <code>/api/dingtalk/webhook</code>：保留给本地接口调试使用
          </li>
        </ul>
      </section>
    </main>
  );
}
