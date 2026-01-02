import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
import geminiRouter from './routes/gemini.js';
import ocrRouter from './routes/ocr.js';
import usageRouter from './routes/usage.js';
import checkoutRouter from './routes/checkout.js';
import exportRouter from './routes/export.js';
import webhooksRouter from './routes/webhooks.js';

app.use('/api/gemini', geminiRouter);
app.use('/api/ocr', ocrRouter);
app.use('/api/usage', usageRouter);
app.use('/api/checkout', checkoutRouter);
app.use('/api/export', exportRouter);
app.use('/api/webhooks', webhooksRouter);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});
