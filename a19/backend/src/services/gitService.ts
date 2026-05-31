import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

export interface GitDiffResult {
  file: string;
  changes: DiffChange[];
}

export interface DiffChange {
  operation: 'add' | 'remove' | 'modify';
  oldLine?: number;
  newLine?: number;
  content: string;
}

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export class GitService {
  private getRepoPath(projectId: string): string {
    return path.join(config.git.repoBasePath, projectId);
  }

  async initRepo(projectId: string, repoName: string): Promise<void> {
    const repoPath = this.getRepoPath(projectId);
    
    if (!fs.existsSync(config.git.repoBasePath)) {
      fs.mkdirSync(config.git.repoBasePath, { recursive: true });
    }
    
    if (!fs.existsSync(repoPath)) {
      fs.mkdirSync(repoPath, { recursive: true });
    }
    
    await execAsync('git init', { cwd: repoPath });
    await execAsync('git config user.email "bot@codereview.com"', { cwd: repoPath });
    await execAsync('git config user.name "CodeReview Bot"', { cwd: repoPath });
    
    const readmePath = path.join(repoPath, 'README.md');
    fs.writeFileSync(readmePath, `# ${repoName}\n\nThis project was created using Code Review Platform.\n`);
    
    await execAsync('git add README.md', { cwd: repoPath });
    await execAsync('git commit -m "Initial commit"', { cwd: repoPath });
    await execAsync('git branch -M main', { cwd: repoPath });
  }

  async cloneRepo(projectId: string, repoUrl: string): Promise<void> {
    const repoPath = this.getRepoPath(projectId);
    
    if (!fs.existsSync(config.git.repoBasePath)) {
      fs.mkdirSync(config.git.repoBasePath, { recursive: true });
    }
    
    await execAsync(`git clone "${repoUrl}" "${projectId}"`, {
      cwd: config.git.repoBasePath
    });
  }

  async getBranches(projectId: string): Promise<string[]> {
    const repoPath = this.getRepoPath(projectId);
    const { stdout } = await execAsync('git branch -a', { cwd: repoPath });
    
    return stdout
      .split('\n')
      .map(b => b.trim().replace('* ', '').replace('remotes/origin/', ''))
      .filter(b => b && !b.includes('->'));
  }

  async createBranch(projectId: string, branchName: string, baseBranch: string = 'main'): Promise<void> {
    const repoPath = this.getRepoPath(projectId);
    await execAsync(`git checkout -b ${branchName} ${baseBranch}`, { cwd: repoPath });
  }

  async checkoutBranch(projectId: string, branchName: string): Promise<void> {
    const repoPath = this.getRepoPath(projectId);
    await execAsync(`git checkout ${branchName}`, { cwd: repoPath });
  }

  async getDiff(projectId: string, sourceBranch: string, targetBranch: string): Promise<GitDiffResult[]> {
    const repoPath = this.getRepoPath(projectId);
    
    await execAsync(`git fetch --all`, { cwd: repoPath });
    
    const { stdout } = await execAsync(
      `git diff ${targetBranch}...${sourceBranch} --unified=3`,
      { cwd: repoPath }
    );
    
    return this.parseDiff(stdout);
  }

  private parseDiff(diffOutput: string): GitDiffResult[] {
    const files: GitDiffResult[] = [];
    let currentFile: GitDiffResult | null = null;
    
    const lines = diffOutput.split('\n');
    let oldLineNum = 0;
    let newLineNum = 0;
    let inFileContent = false;
    
    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        if (currentFile) {
          files.push(currentFile);
        }
        const match = line.match(/diff --git a\/(.+) b\/(.+)/);
        if (match) {
          currentFile = {
            file: match[2],
            changes: []
          };
        }
        inFileContent = false;
      } else if (line.startsWith('@@')) {
        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          oldLineNum = parseInt(match[1], 10);
          newLineNum = parseInt(match[2], 10);
          inFileContent = true;
        }
      } else if (inFileContent && currentFile) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentFile.changes.push({
            operation: 'add',
            newLine: newLineNum++,
            content: line.slice(1)
          });
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentFile.changes.push({
            operation: 'remove',
            oldLine: oldLineNum++,
            content: line.slice(1)
          });
        } else if (!line.startsWith('+') && !line.startsWith('-') && 
                   !line.startsWith('\\ No newline at end of file')) {
          currentFile.changes.push({
            operation: 'modify',
            oldLine: oldLineNum,
            newLine: newLineNum,
            content: line
          });
          oldLineNum++;
          newLineNum++;
        }
      }
    }
    
    if (currentFile) {
      files.push(currentFile);
    }
    
    return files;
  }

  async getFileContent(projectId: string, filePath: string, branch: string): Promise<string> {
    const repoPath = this.getRepoPath(projectId);
    const { stdout } = await execAsync(
      `git show ${branch}:${filePath}`,
      { cwd: repoPath }
    );
    return stdout;
  }

  async getCommits(projectId: string, branch: string, limit: number = 10): Promise<CommitInfo[]> {
    const repoPath = this.getRepoPath(projectId);
    const { stdout } = await execAsync(
      `git log ${branch} --oneline -${limit} --pretty=format:"%H|%s|%an|%ad"`,
      { cwd: repoPath }
    );
    
    return stdout
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        const [hash, message, author, date] = line.split('|');
        return { hash, message, author, date };
      });
  }

  async getLastCommit(projectId: string, branch: string): Promise<CommitInfo> {
    const commits = await this.getCommits(projectId, branch, 1);
    return commits[0];
  }

  async mergeBranches(
    projectId: string,
    sourceBranch: string,
    targetBranch: string
  ): Promise<void> {
    const repoPath = this.getRepoPath(projectId);
    
    try {
      await this.checkoutBranch(projectId, targetBranch);
      
      await execAsync(`git merge ${sourceBranch} --no-edit --no-ff`, { cwd: repoPath });
      
    } catch (error: any) {
      console.error('Git merge error:', error);
      
      try {
        await execAsync('git merge --abort', { cwd: repoPath });
      } catch (abortError) {
        console.error('Failed to abort merge:', abortError);
      }
      
      if (error.stderr && error.stderr.includes('CONFLICT')) {
        throw new Error('Merge conflict detected. Please resolve conflicts locally and push changes.');
      }
      
      throw new Error(error.stderr || error.message || 'Merge failed');
    }
  }

  repoExists(projectId: string): boolean {
    const repoPath = this.getRepoPath(projectId);
    return fs.existsSync(repoPath) && fs.existsSync(path.join(repoPath, '.git'));
  }
}

export const gitService = new GitService();
