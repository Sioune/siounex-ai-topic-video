import express, { type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authRouter, requestIdentity, requireStudioOwner } from "./lib/studio-auth";
import { importedRouter } from "./routes/imported";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import { codexExecutorBridgeMiddleware, issueCodexExecutorGrant, revokeCodexExecutorGrant } from "./lib/codex-executor-bridge";

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

// Authenticate the narrowly scoped machine credential before Clerk, so it is
// never forwarded to Clerk or treated as a malformed user session JWT.
app.post("/api/executor", codexExecutorBridgeMiddleware);
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
app.use("/api", router);
app.use("/api", authRouter);
app.use(requireStudioOwner);
app.use(importedRouter);

export default app;
