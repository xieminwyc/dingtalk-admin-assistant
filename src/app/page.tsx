import { HomeShell } from "./_components/home-shell";

export default function Home() {
  return (
    <HomeShell
      dingtalkClientId={process.env.DINGTALK_CLIENT_ID}
    />
  );
}
