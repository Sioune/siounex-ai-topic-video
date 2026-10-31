import express, { type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authRouter, requestIdentity, requireStudioOwner } from "./lib/studio-auth";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import { codexExecutorBridgeMiddleware, issueCodexExecutorGrant, revokeCodexExecutorGrant } from "./lib/codex-executor-bridge";
import {
  approveCodexExecutorJob, codexExecutorDeviceMiddleware, issueCodexExecutorPairing,
  pairCodexExecutorDevice, pollCodexExecutorJobs, readCodexExecutorDeviceStatus,
  revokeCodexExecutorDevice, revokeCodexExecutorJobApproval,
} from "./lib/codex-executor-device";
import { publicContentRouter, adminContentRouter } from "./routes/content";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.set("trust proxy", 1);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(express.raw({ type: () => true, limit: "32mb" }));
// Public projections and import-only machine requests do not require Clerk.
// Legacy business APIs remain owner-protected for external compatibility.
app.use("/api", publicContentRouter);

// Authenticate the narrowly scoped machine credential before Clerk, so it is
// never forwarded to Clerk or treated as a malformed user session JWT.
app.post("/api/executor", codexExecutorBridgeMiddleware);
app.post("/api/codex-executor/agent/pair", pairCodexExecutorDevice);
app.post("/api/codex-executor/agent/poll", codexExecutorDeviceMiddleware, pollCodexExecutorJobs);
const clerkSession = clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  }));
app.use((req, res, next) => {
  if (requestIdentity.getStore()?.kind === "codex-executor") {
    next();
    return;
  }
  return clerkSession(req, res, next);
});

// A task-scoped Codex credential is accepted only on the existing production
// executor route. All other routes continue to require the owner's Clerk session.
app.post("/api/codex-executor/grant", requireStudioOwner, issueCodexExecutorGrant);
app.post("/api/codex-executor/grant/revoke", requireStudioOwner, revokeCodexExecutorGrant);
app.post("/api/codex-executor/pairing", requireStudioOwner, issueCodexExecutorPairing);
app.get("/api/codex-executor/devices", requireStudioOwner, readCodexExecutorDeviceStatus);
app.post("/api/codex-executor/jobs/approve", requireStudioOwner, approveCodexExecutorJob);
app.post("/api/codex-executor/jobs/revoke", requireStudioOwner, revokeCodexExecutorJobApproval);
app.post("/api/codex-executor/devices/revoke", requireStudioOwner, revokeCodexExecutorDevice);
app.use("/api", router);
app.use("/api", authRouter);
app.use("/api", adminContentRouter);
app.use(requireStudioOwner);
// Compatibility routes are loaded only after verified owner/executor access.
// Public display does not initialize the retired production/publishing modules.
app.use((req, res, next) => {
  void import("./routes/imported").then(({ importedRouter }) => importedRouter(req, res, next)).catch(next);
});

export default app;
