import { parseAppEnv } from "@/config/env";
import { createDingTalkIdentityService } from "@/modules/dingtalk/dingtalk-identity.service";

export const runtime = "nodejs";

type BrowserIdentityPayload = {
  authCode?: string;
};

let identityService: ReturnType<typeof createDingTalkIdentityService> | null =
  null;

function getIdentityService() {
  if (!identityService) {
    const env = parseAppEnv();

    identityService = createDingTalkIdentityService({
      clientId: env.dingtalkClientId,
      clientSecret: env.dingtalkClientSecret,
    });
  }

  return identityService;
}

export async function POST(request: Request) {
  const body = (await request.json()) as BrowserIdentityPayload;
  const authCode = body.authCode?.trim();

  console.info("[browser-identity] received authCode", {
    length: authCode?.length,
    prefix: authCode?.slice(0, 10),
  });

  if (!authCode) {
    return Response.json(
      {
        error: "authCode is required",
      },
      {
        status: 400,
      },
    );
  }

  let senderStaffId: string | undefined;

  try {
    senderStaffId =
      await getIdentityService().resolveUserIdFromAuthCode(authCode);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown identity resolution error";
    console.error("[browser-identity] resolveUserIdFromAuthCode failed:", message);
    return Response.json(
      { error: message },
      { status: 502 },
    );
  }

  if (!senderStaffId) {
    console.warn("[browser-identity] authCode resolved but userId is empty");
    return Response.json(
      { error: "authCode resolved but userId is empty" },
      { status: 502 },
    );
  }

  return Response.json({
    senderStaffId,
  });
}
