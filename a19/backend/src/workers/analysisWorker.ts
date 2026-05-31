import { consumeFromQueue, QUEUES } from '../config/rabbitmq';
import { codeAnalysisService } from '../services/codeAnalysisService';

export const startAnalysisWorker = async () => {
  console.log('Code analysis worker started, waiting for messages...');
  
  await consumeFromQueue(QUEUES.CODE_ANALYSIS, async (message: any) => {
    try {
      console.log('Processing code analysis:', message.type);
      
      switch (message.type) {
        case 'run_analysis':
          await codeAnalysisService.runAllAnalyses(
            message.projectId,
            message.reviewId,
            message.sourceBranch
          );
          
          console.log('Code analysis completed for review:', message.reviewId);
          break;
          
        default:
          console.log('Unknown analysis type:', message.type);
      }
    } catch (error) {
      console.error('Error processing code analysis:', error);
      throw error;
    }
  });
};
