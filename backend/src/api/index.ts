// Vercel serverless entry (@vercel/node). Exports the Express app as the handler.
import { createApp } from "../app";

const app = createApp();

export default app;
