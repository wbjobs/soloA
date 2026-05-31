import { NodeProcessor, ExecutionContext } from './node-processor';
import { FlowNode } from '../../entities/flow-version.entity';
import { ConnectorResult } from '../connectors/datasource-connector';

export class AggregateProcessor extends NodeProcessor {
  async execute(
    node: FlowNode,
    inputData: ConnectorResult,
    context: ExecutionContext,
  ): Promise<ConnectorResult> {
    const { config } = node.data;
    const { groupBy = [], aggregations = [] } = config || {};

    await context.log('info', `Aggregating data with ${groupBy.length} group fields and ${aggregations.length} aggregations`);

    if (aggregations.length === 0) {
      return inputData;
    }

    const groups = new Map<string, any>();

    for (const row of inputData.data) {
      const groupKey = groupBy.map(field => String(row[field] || '')).join('|');
      
      if (!groups.has(groupKey)) {
        const groupRow: any = {};
        for (const field of groupBy) {
          groupRow[field] = row[field];
        }
        for (const agg of aggregations) {
          groupRow[`${agg.operation}_${agg.field || 'count'}`] = agg.operation === 'count' ? 0 : [];
        }
        groups.set(groupKey, groupRow);
      }

      const groupRow = groups.get(groupKey)!;
      
      for (const agg of aggregations) {
        const key = `${agg.operation}_${agg.field || 'count'}`;
        const value = row[agg.field];
        
        switch (agg.operation) {
          case 'count':
            groupRow[key]++;
            break;
          case 'sum':
            if (!Array.isArray(groupRow[key])) {
              groupRow[key] = 0;
            }
            groupRow[key] += Number(value) || 0;
            break;
          case 'avg':
          case 'min':
          case 'max':
            if (!Array.isArray(groupRow[key])) {
              groupRow[key] = [];
            }
            if (value !== null && value !== undefined) {
              groupRow[key].push(Number(value));
            }
            break;
          case 'first':
            if (!Array.isArray(groupRow[key])) {
              groupRow[key] = [value];
            }
            break;
          case 'last':
            if (!Array.isArray(groupRow[key])) {
              groupRow[key] = [value];
            } else {
              groupRow[key][0] = value;
            }
            break;
          default:
            break;
        }
      }
    }

    const aggregatedData: any[] = [];
    const newColumns = [...groupBy];

    for (const agg of aggregations) {
      newColumns.push(`${agg.operation}_${agg.field || 'count'}`);
    }

    for (const groupRow of groups.values()) {
      const finalRow: any = {};
      for (const field of groupBy) {
        finalRow[field] = groupRow[field];
      }
      
      for (const agg of aggregations) {
        const key = `${agg.operation}_${agg.field || 'count'}`;
        const values = groupRow[key];
        
        switch (agg.operation) {
          case 'count':
          case 'sum':
            finalRow[key] = values;
            break;
          case 'avg':
            finalRow[key] = Array.isArray(values) && values.length > 0
              ? values.reduce((a: number, b: number) => a + b, 0) / values.length
              : null;
            break;
          case 'min':
            finalRow[key] = Array.isArray(values) && values.length > 0
              ? Math.min(...values)
              : null;
            break;
          case 'max':
            finalRow[key] = Array.isArray(values) && values.length > 0
              ? Math.max(...values)
              : null;
            break;
          case 'first':
          case 'last':
            finalRow[key] = Array.isArray(values) && values.length > 0
              ? values[0]
              : null;
            break;
          default:
            finalRow[key] = values;
            break;
        }
      }
      
      aggregatedData.push(finalRow);
    }

    await context.log('info', `Aggregated to ${aggregatedData.length} groups`);

    await context.updateNodeProgress(node.id, {
      status: 'completed',
      rowsProcessed: aggregatedData.length,
    });

    return {
      data: aggregatedData,
      columns: newColumns,
      totalRows: aggregatedData.length,
    };
  }
}
