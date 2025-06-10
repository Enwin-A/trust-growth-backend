// src/index.ts
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { analyzeRouter } from './routes/analyze';
import { healthRouter } from './routes/health';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);


const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';

app.use(cors({ origin: allowedOrigin }));
// enabling the cors for frontend 
// app.use(cors({
//   origin: 'http://localhost:3000',
// }));

// the middleware to parse JSON bodies
app.use(express.json());

// mounting the routers
app.use('/health', healthRouter);

app.use('/api/analyze', analyzeRouter);

// error handling middleware for route
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  if (!res.headersSent) {
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  } else {
    next(err);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backend listening on http://localhost:${PORT}`);
});
