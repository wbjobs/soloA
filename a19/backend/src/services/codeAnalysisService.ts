import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { gitService } from './gitService';
import { query } from '../config/database';

const execAsync = promisify(exec);

export interface AnalysisResult {
  tool: string;
  status: 'success' | 'failed';
  issues: Issue[];
  summary: Summary;
}

export interface Issue {
  file: string;
  line: number;
  column?: number;
  severity: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
}

export interface Summary {
  total: number;
  errors: number;
  warnings: number;
  infos: number;
}

export class CodeAnalysisService {
  private getRepoPath(projectId: string): string {
    return path.join(config.git.repoBasePath, projectId);
  }

  async runAllAnalyses(
    projectId: string,
    reviewId: string,
    sourceBranch: string
  ): Promise<AnalysisResult[]> {
    const repoPath = this.getRepoPath(projectId);
    
    const results: AnalysisResult[] = [];
    
    await this.saveAnalysisStart(reviewId, 'all');
    
    try {
      await gitService.checkoutBranch(projectId, sourceBranch);
      
      const eslintResult = await this.runESLint(repoPath);
      results.push(eslintResult);
      await this.saveAnalysisResults(reviewId, 'eslint', eslintResult);
      
    } catch (error) {
      console.error('Code analysis failed:', error);
      throw error;
    }
    
    await this.updateAnalysisCompleted(reviewId);
    return results;
  }

  async runESLint(repoPath: string): Promise<AnalysisResult> {
    const eslintConfigPath = path.join(repoPath, '.eslintrc.json');
    const hasEslintConfig = fs.existsSync(eslintConfigPath);
    
    let eslintConfig = '{}';
    if (hasEslintConfig) {
      eslintConfig = fs.readFileSync(eslintConfigPath, 'utf8');
    } else {
      eslintConfig = JSON.stringify({
        parserOptions: {
          ecmaVersion: 2020,
          sourceType: 'module',
          ecmaFeatures: {
            jsx: true,
            tsx: true
          }
        },
        env: {
          browser: true,
          node: true,
          es6: true
        },
        extends: ['eslint:recommended'],
        rules: {
          'no-console': 'warn',
          'no-unused-vars': 'warn',
          'semi': 'warn',
          'quotes': ['warn', 'single']
        }
      });
      fs.writeFileSync(eslintConfigPath, eslintConfig);
    }
    
    try {
      const { stdout, stderr } = await execAsync(
        `npx eslint . --format json --ext .js,.jsx,.ts,.tsx --no-eslintrc --config ${eslintConfigPath}`,
        { cwd: repoPath, timeout: 60000 }
      );
      
      return this.parseESLintOutput(stdout);
    } catch (error: any) {
      if (error.stdout) {
        return this.parseESLintOutput(error.stdout);
      }
      
      return {
        tool: 'eslint',
        status: 'failed',
        issues: [],
        summary: { total: 0, errors: 0, warnings: 0, infos: 0 }
      };
    }
  }

  private parseESLintOutput(stdout: string): AnalysisResult {
    try {
      const results = JSON.parse(stdout);
      const issues: Issue[] = [];
      
      for (const fileResult of results) {
        for (const message of fileResult.messages) {
          issues.push({
            file: fileResult.filePath,
            line: message.line,
            column: message.column,
            severity: message.severity === 2 ? 'error' : 'warning',
            rule: message.ruleId || 'unknown',
            message: message.message
          });
        }
      }
      
      const errors = issues.filter(i => i.severity === 'error').length;
      const warnings = issues.filter(i => i.severity === 'warning').length;
      
      return {
        tool: 'eslint',
        status: 'success',
        issues,
        summary: {
          total: issues.length,
          errors,
          warnings,
          infos: 0
        }
      };
    } catch {
      return {
        tool: 'eslint',
        status: 'success',
        issues: [],
        summary: { total: 0, errors: 0, warnings: 0, infos: 0 }
      };
    }
  }

  async runBasicSyntaxCheck(repoPath: string, files: string[]): Promise<AnalysisResult> {
    const issues: Issue[] = [];
    
    for (const file of files) {
      const filePath = path.join(repoPath, file);
      
      if (!fs.existsSync(filePath)) continue;
      
      if (file.endsWith('.js') || file.endsWith('.ts')) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          await this.checkJavaScriptSyntax(content, file, issues);
        } catch (error) {
          console.error(`Syntax check failed for ${file}:`, error);
        }
      }
    }
    
    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    
    return {
      tool: 'syntax',
      status: 'success',
      issues,
      summary: {
        total: issues.length,
        errors,
        warnings,
        infos: 0
      }
    };
  }

  private async checkJavaScriptSyntax(
    content: string,
    fileName: string,
    issues: Issue[]
  ): Promise<void> {
    const lines = content.split('\n');
    
    let bracketCount = 0;
    let parenCount = 0;
    let inString = false;
    let stringChar = '';
    
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      
      for (let charNum = 0; charNum < line.length; charNum++) {
        const char = line[charNum];
        
        if (char === '"' || char === "'") {
          if (!inString) {
            inString = true;
            stringChar = char;
          } else if (stringChar === char) {
            inString = false;
          }
        } else if (!inString) {
          if (char === '{') bracketCount++;
          if (char === '}') bracketCount--;
          if (char === '(') parenCount++;
          if (char === ')') parenCount--;
        }
      }
      
      if (line.trim().length > 0 && !line.trim().endsWith(';') && 
          !line.trim().endsWith('{') && !line.trim().endsWith('}') &&
          !line.trim().startsWith('//') && !line.trim().startsWith('*') &&
          !line.includes('if') && !line.includes('for') && !line.includes('while') &&
          !line.includes('function') && !line.includes('class') &&
          !line.includes('else') && !line.includes('try') && !line.includes('catch')) {
        if (fileName.endsWith('.js') || fileName.endsWith('.ts')) {
          issues.push({
            file: fileName,
            line: lineNum + 1,
            column: line.length,
            severity: 'warning',
            rule: 'missing-semicolon',
            message: 'Missing semicolon'
          });
        }
      }
    }
    
    if (bracketCount !== 0) {
      issues.push({
        file: fileName,
        line: lines.length,
        severity: 'error',
        rule: 'mismatched-brackets',
        message: 'Mismatched curly braces'
      });
    }
    
    if (parenCount !== 0) {
      issues.push({
        file: fileName,
        line: lines.length,
        severity: 'error',
        rule: 'mismatched-parens',
        message: 'Mismatched parentheses'
      });
    }
  }

  private async saveAnalysisStart(reviewId: string, toolName: string): Promise<void> {
    await query(
      'INSERT INTO code_analyses (review_id, tool_name, status) VALUES ($1, $2, $3)',
      [reviewId, toolName, 'running']
    );
  }

  private async saveAnalysisResults(
    reviewId: string,
    toolName: string,
    result: AnalysisResult
  ): Promise<void> {
    await query(
      `UPDATE code_analyses 
       SET status = $1, results = $2, completed_at = NOW() 
       WHERE review_id = $3 AND tool_name = $4`,
      ['completed', JSON.stringify(result), reviewId, toolName]
    );
  }

  private async updateAnalysisCompleted(reviewId: string): Promise<void> {
    await query(
      `UPDATE code_analyses 
       SET status = $1, completed_at = NOW() 
       WHERE review_id = $2`,
      ['completed', reviewId]
    );
  }

  async getAnalysisResults(reviewId: string): Promise<AnalysisResult[]> {
    const result = await query(
      'SELECT * FROM code_analyses WHERE review_id = $1',
      [reviewId]
    );
    
    return result.rows.map(row => row.results as AnalysisResult);
  }
}

export const codeAnalysisService = new CodeAnalysisService();
