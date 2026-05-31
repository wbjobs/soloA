import { NodeProcessor, ExecutionContext } from './node-processor';
import { FlowNode } from '../../entities/flow-version.entity';
import { ConnectorResult } from '../connectors/datasource-connector';

export class FilterProcessor extends NodeProcessor {
  async execute(
    node: FlowNode,
    inputData: ConnectorResult,
    context: ExecutionContext,
  ): Promise<ConnectorResult> {
    const { config } = node.data;
    const { conditions = [], operator = 'AND' } = config || {};

    await context.log('info', `Filtering ${inputData.data.length} rows with ${conditions.length} conditions`);

    if (conditions.length === 0) {
      return inputData;
    }

    const filteredData = inputData.data.filter(row => {
      return operator === 'AND'
        ? conditions.every((cond: any) => this.evaluateCondition(row, cond))
        : conditions.some((cond: any) => this.evaluateCondition(row, cond));
    });

    const removedCount = inputData.data.length - filteredData.length;
    await context.log('info', `Filtered out ${removedCount} rows, ${filteredData.length} remaining`);

    await context.updateNodeProgress(node.id, {
      status: 'completed',
      rowsProcessed: filteredData.length,
    });

    return {
      data: filteredData,
      columns: inputData.columns,
      totalRows: filteredData.length,
    };
  }

  private evaluateCondition(row: any, condition: any): boolean {
    const { field, operator, value } = condition;
    const fieldValue = row[field];

    switch (operator) {
      case 'equals':
        return String(fieldValue) === String(value);
      case 'not_equals':
        return String(fieldValue) !== String(value);
      case 'contains':
        return String(fieldValue).includes(String(value));
      case 'not_contains':
        return !String(fieldValue).includes(String(value));
      case 'starts_with':
        return String(fieldValue).startsWith(String(value));
      case 'ends_with':
        return String(fieldValue).endsWith(String(value));
      case 'greater_than':
        return Number(fieldValue) > Number(value);
      case 'greater_than_or_equal':
        return Number(fieldValue) >= Number(value);
      case 'less_than':
        return Number(fieldValue) < Number(value);
      case 'less_than_or_equal':
        return Number(fieldValue) <= Number(value);
      case 'is_null':
        return fieldValue === null || fieldValue === undefined || fieldValue === '';
      case 'is_not_null':
        return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
      case 'in':
        const values = Array.isArray(value) ? value : String(value).split(',').map(v => v.trim());
        return values.includes(String(fieldValue));
      case 'not_in':
        const valuesNotIn = Array.isArray(value) ? value : String(value).split(',').map(v => v.trim());
        return !valuesNotIn.includes(String(fieldValue));
      default:
        return true;
    }
  }
}
