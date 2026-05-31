import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/db';
import { ScoreData } from '../types';

export class FileService {
  private readonly UPLOAD_DIR = path.join(process.cwd(), 'uploads');
  private readonly BASE_URL = '/api/files/download';

  constructor() {
    if (!fs.existsSync(this.UPLOAD_DIR)) {
      fs.mkdirSync(this.UPLOAD_DIR, { recursive: true });
    }
  }

  async saveExportedFile(
    scoreId: string,
    userId: string,
    fileName: string,
    fileType: 'musicxml' | 'midi',
    content: Buffer
  ): Promise<{ id: string; fileUrl: string; fileName: string; fileSize: number }> {
    const score = await prisma.score.findUnique({
      where: { id: scoreId }
    });

    if (!score) {
      throw new Error('乐谱不存在');
    }

    if (score.ownerId !== userId) {
      throw new Error('无权导出此乐谱');
    }

    const uniqueFileName = `${uuidv4()}_${fileName}`;
    const filePath = path.join(this.UPLOAD_DIR, uniqueFileName);
    
    fs.writeFileSync(filePath, content);
    const fileSize = content.length;

    const fileExport = await prisma.fileExport.create({
      data: {
        scoreId,
        userId,
        fileType,
        fileName,
        fileUrl: `${this.BASE_URL}/${uniqueFileName}`,
        fileSize
      }
    });

    return {
      id: fileExport.id,
      fileUrl: fileExport.fileUrl,
      fileName: fileExport.fileName,
      fileSize: fileExport.fileSize
    };
  }

  async getExportedFile(fileName: string): Promise<{ filePath: string; originalName: string }> {
    const fileExport = await prisma.fileExport.findFirst({
      where: { fileUrl: `${this.BASE_URL}/${fileName}` }
    });

    if (!fileExport) {
      throw new Error('文件不存在');
    }

    const filePath = path.join(this.UPLOAD_DIR, fileName);
    
    if (!fs.existsSync(filePath)) {
      throw new Error('文件不存在');
    }

    return {
      filePath,
      originalName: fileExport.fileName
    };
  }

  async getExportHistory(scoreId: string, userId: string) {
    const score = await prisma.score.findUnique({
      where: { id: scoreId }
    });

    if (!score) {
      throw new Error('乐谱不存在');
    }

    if (score.ownerId !== userId) {
      throw new Error('无权访问此乐谱的导出历史');
    }

    const exports = await prisma.fileExport.findMany({
      where: { scoreId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    return exports.map(exp => ({
      id: exp.id,
      fileType: exp.fileType,
      fileName: exp.fileName,
      fileUrl: exp.fileUrl,
      fileSize: exp.fileSize,
      createdAt: exp.createdAt.toISOString()
    }));
  }

  async importScore(
    userId: string,
    scoreData: ScoreData,
    originalTitle: string = '导入的乐谱'
  ): Promise<{ id: string; title: string }> {
    const score = await prisma.score.create({
      data: {
        title: originalTitle,
        data: scoreData,
        ownerId: userId
      }
    });

    return {
      id: score.id,
      title: score.title
    };
  }
}

export const fileService = new FileService();
