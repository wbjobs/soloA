import { consumeFromQueue, QUEUES } from '../config/rabbitmq';
import { gitService } from '../services/gitService';
import { query } from '../config/database';

export const startGitWorker = async () => {
  console.log('Git worker started, waiting for messages...');
  
  await consumeFromQueue(QUEUES.GIT_OPERATIONS, async (message: any) => {
    try {
      console.log('Processing git operation:', message.type);
      
      switch (message.type) {
        case 'clone':
          await gitService.cloneRepo(message.projectId, message.repoUrl);
          
          const branches = await gitService.getBranches(message.projectId);
          
          for (const branchName of branches) {
            const lastCommit = await gitService.getLastCommit(message.projectId, branchName);
            await query(
              `INSERT INTO branches (project_id, name, last_commit_hash, last_commit_message)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (project_id, name) DO UPDATE SET
                 last_commit_hash = EXCLUDED.last_commit_hash,
                 last_commit_message = EXCLUDED.last_commit_message,
                 updated_at = NOW()`,
              [message.projectId, branchName, lastCommit?.hash, lastCommit?.message]
            );
          }
          
          console.log('Git clone completed for project:', message.projectId);
          break;
          
        default:
          console.log('Unknown git operation:', message.type);
      }
    } catch (error) {
      console.error('Error processing git operation:', error);
      throw error;
    }
  });
};
