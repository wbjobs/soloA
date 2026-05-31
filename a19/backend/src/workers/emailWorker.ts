import { consumeFromQueue, QUEUES } from '../config/rabbitmq';
import { emailService } from '../services/emailService';

export const startEmailWorker = async () => {
  console.log('Email worker started, waiting for messages...');
  
  await consumeFromQueue(QUEUES.EMAIL_NOTIFICATIONS, async (message: any) => {
    try {
      console.log('Processing email notification:', message.type);
      
      switch (message.type) {
        case 'review_assigned':
          await emailService.sendReviewAssignedEmail(
            message.to,
            message.reviewTitle,
            message.projectName,
            message.reviewId
          );
          break;
          
        case 'review_status_changed':
          await emailService.sendReviewStatusChangedEmail(
            message.to,
            message.reviewTitle,
            message.newStatus,
            message.reviewId
          );
          break;
          
        case 'new_comment':
          await emailService.sendNewCommentEmail(
            message.to,
            message.reviewTitle,
            message.commentAuthor,
            message.commentContent,
            message.filePath,
            message.reviewId
          );
          break;
          
        case 'comment_reply':
          await emailService.sendCommentReplyEmail(
            message.to,
            message.reviewTitle,
            message.commentAuthor,
            message.replyContent,
            message.reviewId
          );
          break;
          
        default:
          console.log('Unknown email type:', message.type);
      }
      
      console.log('Email processed successfully');
    } catch (error) {
      console.error('Error processing email notification:', error);
      throw error;
    }
  });
};
