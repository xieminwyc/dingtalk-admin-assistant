import { HomeShell } from "./_components/home-shell";

export default function Home() {
  return (
    <HomeShell
      dingtalkCorpId={process.env.DINGTALK_CORP_ID}
      dingtalkClientId={process.env.DINGTALK_CLIENT_ID}
    />
  );
}
