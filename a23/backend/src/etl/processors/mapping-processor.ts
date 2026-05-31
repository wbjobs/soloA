import { NodeProcessor, ExecutionContext } from './node-processor';
import { FlowNode } from '../../entities/flow-version.entity';
import { ConnectorResult } from '../connectors/datasource-connector';

export class MappingProcessor extends NodeProcessor {
  async execute(
    node: FlowNode,
    inputData: ConnectorResult,
    context: ExecutionContext,
  ): Promise<ConnectorResult> {
    const { config } = node.data;
    const { mappings = [] } = config || {};

    await context.log('info', `Mapping fields with ${mappings.length} mappings`);

    if (mappings.length === 0) {
      return inputData;
    }

    const newColumns: string[] = [];
    const mappingMap = new Map<string, { source: string; transform: string; target: string }>();

    for (const mapping of mappings) {
      const { sourceField, targetField, transform = 'none' } = mapping;
      mappingMap.set(sourceField, { source: sourceField, transform, target: targetField || sourceField });
      if (targetField && !newColumns.includes(targetField)) {
        newColumns.push(targetField);
      } else if (!newColumns.includes(sourceField)) {
        newColumns.push(sourceField);
      }
    }

    const mappedData = inputData.data.map(row => {
      const newRow: any = {};
      for (const [sourceField, mappingInfo] of mappingMap.entries()) {
        const targetField = mappingInfo.target || sourceField;
        let value = row[sourceField];

        switch (mappingInfo.transform) {
          case 'uppercase':
            value = value ? String(value).toUpperCase() : value;
            break;
          case 'lowercase':
            value = value ? String(value).toLowerCase() : value;
            break;
          case 'trim':
            value = value ? String(value).trim() : value;
            break;
          case 'to_number':
            value = value ? Number(value) : value;
            break;
          case 'to_string':
            value = value !== undefined && value !== null ? String(value) : value;
            break;
          case 'to_date':
            value = value ? new Date(value) : value;
            break;
          case 'round':
            value = value ? Math.round(Number(value)) : value;
            break;
          case 'floor':
            value = value ? Math.floor(Number(value)) : value;
            break;
          case 'ceil':
            value = value ? Math.ceil(Number(value)) : value;
            break;
          case 'length':
            value = value ? String(value).length : 0;
            break;
          default:
            break;
        }

        newRow[targetField] = value;
      }
      return newRow;
    });

    await context.log('info', `Mapped ${mappedData.length} rows to ${newColumns.length} fields`);

    await context.updateNodeProgress(node.id, {
      status: 'completed',
      rowsProcessed: mappedData.length,
    });

    return {
      data: mappedData,
      columns: newColumns,
      totalRows: mappedData.length,
    };
  }
}
