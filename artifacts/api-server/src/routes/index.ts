import { Router, type IRouter } from "express";
import healthRouter from "./health";
import stocksRouter from "./stocks";
import paymentRouter from "./payment";
import feedbackRouter from "./feedback";
import analyticsRouter from "./analytics";
import adminRouter from "./admin";
import devRouter from "./dev";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/stocks", stocksRouter);
router.use("/payment", paymentRouter);
router.use("/feedback", feedbackRouter);
router.use("/analytics", analyticsRouter);
router.use("/admin", adminRouter);
router.use("/dev", devRouter);

export default router;
