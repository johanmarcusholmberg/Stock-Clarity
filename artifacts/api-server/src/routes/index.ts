import { Router, type IRouter } from "express";
import healthRouter from "./health";
import stocksRouter from "./stocks";
import paymentRouter from "./payment";
import feedbackRouter from "./feedback";
import analyticsRouter from "./analytics";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/stocks", stocksRouter);
router.use("/payment", paymentRouter);
router.use("/feedback", feedbackRouter);
router.use("/analytics", analyticsRouter);
router.use("/admin", adminRouter);

export default router;
