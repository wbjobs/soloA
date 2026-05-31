import nodemailer from 'nodemailer';
import { config } from '../config';

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.password
      }
    });
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    const mailOptions: nodemailer.SendMailOptions = {
      from: config.smtp.from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`Email sent to ${options.to}`);
    } catch (error) {
      console.error('Failed to send email:', error);
      throw error;
    }
  }

  async sendReviewAssignedEmail(
    userEmail: string,
    reviewTitle: string,
    projectName: string,
    reviewId: string
  ): Promise<void> {
    const reviewUrl = `${config.apiBaseUrl}/reviews/${reviewId}`;
    
    await this.sendEmail({
      to: userEmail,
      subject: `New Code Review Assigned: ${reviewTitle}`,
      html: `
        <h1>Code Review Assigned</h1>
        <p>You have been assigned to review a new pull request:</p>
        <ul>
          <li><strong>Project:</strong> ${projectName}</li>
          <li><strong>Title:</strong> ${reviewTitle}</li>
        </ul>
        <p><a href="${reviewUrl}">Click here to view the review</a></p>
      `
    });
  }

  async sendReviewStatusChangedEmail(
    userEmail: string,
    reviewTitle: string,
    newStatus: string,
    reviewId: string
  ): Promise<void> {
    const reviewUrl = `${config.apiBaseUrl}/reviews/${reviewId}`;
    
    await this.sendEmail({
      to: userEmail,
      subject: `Code Review Status Updated: ${newStatus}`,
      html: `
        <h1>Review Status Updated</h1>
        <p>The status of your review request has been updated:</p>
        <ul>
          <li><strong>Title:</strong> ${reviewTitle}</li>
          <li><strong>New Status:</strong> ${newStatus}</li>
        </ul>
        <p><a href="${reviewUrl}">Click here to view the review</a></p>
      `
    });
  }

  async sendNewCommentEmail(
    userEmail: string,
    reviewTitle: string,
    commentAuthor: string,
    commentContent: string,
    filePath: string,
    reviewId: string
  ): Promise<void> {
    const reviewUrl = `${config.apiBaseUrl}/reviews/${reviewId}`;
    
    await this.sendEmail({
      to: userEmail,
      subject: `New Comment on Review: ${reviewTitle}`,
      html: `
        <h1>New Comment</h1>
        <p>${commentAuthor} commented on your review:</p>
        <blockquote>${commentContent}</blockquote>
        <ul>
          <li><strong>File:</strong> ${filePath}</li>
          <li><strong>Review:</strong> ${reviewTitle}</li>
        </ul>
        <p><a href="${reviewUrl}">Click here to view the comment</a></p>
      `
    });
  }

  async sendCommentReplyEmail(
    userEmail: string,
    reviewTitle: string,
    commentAuthor: string,
    replyContent: string,
    reviewId: string
  ): Promise<void> {
    const reviewUrl = `${config.apiBaseUrl}/reviews/${reviewId}`;
    
    await this.sendEmail({
      to: userEmail,
      subject: `New Reply on Your Comment: ${reviewTitle}`,
      html: `
        <h1>New Reply</h1>
        <p>${commentAuthor} replied to your comment:</p>
        <blockquote>${replyContent}</blockquote>
        <ul>
          <li><strong>Review:</strong> ${reviewTitle}</li>
        </ul>
        <p><a href="${reviewUrl}">Click here to view the conversation</a></p>
      `
    });
  }
}

export const emailService = new EmailService();
