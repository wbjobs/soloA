import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';
import helmet from 'helmet';
import { config } from './config';
import { connectRabbitMQ } from './config/rabbitmq';
import { errorHandler } from './middleware/errorHandler';

import authRoutes from './routes/authRoutes';
import projectRoutes from './routes/projectRoutes';
import reviewRoutes from './routes/reviewRoutes';
import commentRoutes from './routes/commentRoutes';
import templateRoutes from './routes/templateRoutes';
import statsRoutes from './routes/statsRoutes';
import batchRoutes from './routes/batchRoutes';

import { startEmailWorker } from './workers/emailWorker';
import { startGitWorker } from './workers/gitWorker';
import { startAnalysisWorker } from './workers/analysisWorker';

const app = express();

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/comments', commentRoutes);

app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'success',
    message: 'Code Review Platform API is running',
    timestamp: new Date().toISOString()
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

app.use(errorHandler);

const startServer = async () => {
  try {
    console.log('Initializing Code Review Platform...');
    
    await connectRabbitMQ();
    
    await startEmailWorker();
    await startGitWorker();
    await startAnalysisWorker();
    
    app.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
      console.log(`Environment: ${config.nodeEnv}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
