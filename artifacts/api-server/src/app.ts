import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import cookieParser from "cookie-parser";
import { authRouter, authenticatedUser } from "./lib/studio-auth";
import { importedRouter } from "./routes/imported";

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
app.use(cookieParser());
app.use(express.raw({ type: () => true, limit: "32mb" }));

app.use("/api", router);
app.use("/api", authRouter);
app.use((req, res, next) => {
  if (!authenticatedUser(req)) return res.status(401).set("Cache-Control", "private, no-store").json({ error: "请登录后使用私人工作台。" });
  next();
});
app.use(importedRouter);

export default app;
