import { NodeProcessor, ExecutionContext } from './node-processor';
import { FlowNode } from '../../entities/flow-version.entity';
import { ConnectorResult } from '../connectors/datasource-connector';

export interface QualityCheck {
  id: string;
  type: 'not_null' | 'regex' | 'unique' | 'range' | 'min_length' | 'max_length' | 'in_list';
  field: string;
  severity: 'error' | 'warn';
  message?: string;
  pattern?: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  values?: string[];
  stopOnError?: boolean;
}

export interface QualityCheckResult {
  passed: boolean;
  checkId: string;
  field: string;
  type: string;
  errors: Array<{ row: number; value: any; message: string }>;
  totalRows: number;
  errorRows: number;
}

export class QualityProcessor extends NodeProcessor {
  async execute(
    node: FlowNode,
    inputData: ConnectorResult,
    context: ExecutionContext,
  ): Promise<ConnectorResult> {
    const checks: QualityCheck[] = node.data.config?.checks || [];
    
    if (checks.length === 0) {
      await context.log('warn', 'No quality checks configured');
      return inputData;
    }

    const allResults: QualityCheckResult[] = [];
    const passedRows = new Set<number>();
    const failedRows = new Map<number, string[]>();

    for (let i = 0; i < inputData.data.length; i++) {
      passedRows.add(i);
    }

    for (const check of checks) {
      const result = await this.runCheck(check, inputData.data, context);
      allResults.push(result);

      if (!result.passed) {
        for (const err of result.errors) {
          if (!failedRows.has(err.row)) {
            failedRows.set(err.row, []);
          }
          failedRows.get(err.row)!.push(err.message);
          
          if (check.severity === 'error' && check.stopOnError !== false) {
            passedRows.delete(err.row);
          }
        }
      }
    }

    const totalErrors = allResults.reduce((sum, r) => sum + r.errorRows, 0);
    const passedData = inputData.data.filter((_, idx) => passedRows.has(idx));

    const summary = {
      totalRows: inputData.data.length,
      passedRows: passedData.length,
      failedRows: failedRows.size,
      totalErrors,
      checkResults: allResults.map(r => ({
        type: r.type,
        field: r.field,
        passed: r.passed,
        errorRows: r.errorRows,
      })),
    };

    await context.log('info', `Quality check summary: ${JSON.stringify(summary)}`);

    await context.updateNodeProgress(node.id, {
      qualitySummary: summary,
    });

    return {
      data: passedData,
      columns: inputData.columns,
      totalRows: passedData.length,
      batchIndex: inputData.batchIndex,
      hasMore: inputData.hasMore,
    };
  }

  private async runCheck(
    check: QualityCheck,
    data: any[],
    context: ExecutionContext,
  ): Promise<QualityCheckResult> {
    const errors: Array<{ row: number; value: any; message: string }> = [];
    const seenValues = new Map<any, number[]>();

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const value = row[check.field];
      const passed = this.isValid(check, value, seenValues, i);

      if (!passed) {
        errors.push({
          row: i,
          value,
          message: check.message || this.getDefaultMessage(check, value),
        });
      }
    }

    await context.log('debug', 
      `Quality check [${check.type}] on [${check.field}]: ${errors.length} errors`);

    return {
      passed: errors.length === 0,
      checkId: check.id,
      field: check.field,
      type: check.type,
      errors,
      totalRows: data.length,
      errorRows: errors.length,
    };
  }

  private isValid(
    check: QualityCheck,
    value: any,
    seenValues: Map<any, number[]>,
    rowIndex: number,
  ): boolean {
    switch (check.type) {
      case 'not_null':
        return value !== null && value !== undefined && value !== '';

      case 'regex':
        if (value === null || value === undefined) return false;
        const regex = new RegExp(check.pattern!);
        return regex.test(String(value));

      case 'unique':
        if (value === null || value === undefined) return true;
        if (seenValues.has(value)) {
          seenValues.get(value)!.push(rowIndex);
          return false;
        }
        seenValues.set(value, [rowIndex]);
        return true;

      case 'range':
        if (value === null || value === undefined) return false;
        const num = Number(value);
        if (isNaN(num)) return false;
        if (check.min !== undefined && num < check.min) return false;
        if (check.max !== undefined && num > check.max) return false;
        return true;

      case 'min_length':
        if (value === null || value === undefined) return false;
        return String(value).length >= (check.minLength || 0);

      case 'max_length':
        if (value === null || value === undefined) return true;
        return String(value).length <= (check.maxLength || Infinity);

      case 'in_list':
        if (value === null || value === undefined) return false;
        return (check.values || []).includes(String(value));

      default:
        return true;
    }
  }

  private getDefaultMessage(check: QualityCheck, value: any): string {
    switch (check.type) {
      case 'not_null':
        return `字段 [${check.field}] 不能为空`;
      case 'regex':
        return `字段 [${check.field}] 值 [${value}] 不符合格式要求`;
      case 'unique':
        return `字段 [${check.field}] 值 [${value}] 重复`;
      case 'range':
        return `字段 [${check.field}] 值 [${value}] 超出范围 [${check.min}, ${check.max}]`;
      case 'min_length':
        return `字段 [${check.field}] 值长度小于最小要求 ${check.minLength}`;
      case 'max_length':
        return `字段 [${check.field}] 值长度超出最大限制 ${check.maxLength}`;
      case 'in_list':
        return `字段 [${check.field}] 值 [${value}] 不在允许列表中`;
      default:
        return `字段 [${check.field}] 校验失败`;
    }
  }
}
