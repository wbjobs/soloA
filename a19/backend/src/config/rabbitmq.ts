import amqp, { Channel, Connection } from 'amqplib';
import { config } from './index';

let connection: Connection | null = null;
let channel: Channel | null = null;

export const QUEUES = {
  EMAIL_NOTIFICATIONS: 'email_notifications',
  CODE_ANALYSIS: 'code_analysis',
  GIT_OPERATIONS: 'git_operations'
};

export const connectRabbitMQ = async (): Promise<void> => {
  try {
    connection = await amqp.connect(config.rabbitmq.url);
    channel = await connection.createChannel();
    
    await Promise.all([
      channel.assertQueue(QUEUES.EMAIL_NOTIFICATIONS, { durable: true }),
      channel.assertQueue(QUEUES.CODE_ANALYSIS, { durable: true }),
      channel.assertQueue(QUEUES.GIT_OPERATIONS, { durable: true })
    ]);
    
    console.log('RabbitMQ connected successfully');
  } catch (error) {
    console.error('Failed to connect to RabbitMQ:', error);
    throw error;
  }
};

export const publishToQueue = async (queueName: string, message: any): Promise<void> => {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized');
  }
  
  await channel.sendToQueue(
    queueName,
    Buffer.from(JSON.stringify(message)),
    { persistent: true }
  );
};

export const consumeFromQueue = async (
  queueName: string,
  handler: (message: any) => Promise<void>
): Promise<void> => {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized');
  }
  
  await channel.consume(queueName, async (msg) => {
    if (msg) {
      try {
        const content = JSON.parse(msg.content.toString());
        await handler(content);
        channel!.ack(msg);
      } catch (error) {
        console.error('Error processing message:', error);
        channel!.nack(msg, false, true);
      }
    }
  });
};

export const closeRabbitMQ = async (): Promise<void> => {
  if (channel) await channel.close();
  if (connection) await connection.close();
};
