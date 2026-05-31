import { NodeType } from '../../entities/flow-version.entity';
import { NodeProcessor } from './node-processor';
import { SourceProcessor } from './source-processor';
import { FilterProcessor } from './filter-processor';
import { MappingProcessor } from './mapping-processor';
import { AggregateProcessor } from './aggregate-processor';
import { SinkProcessor } from './sink-processor';
import { QualityProcessor } from './quality-processor';

export class ProcessorFactory {
  static create(type: NodeType): NodeProcessor {
    switch (type) {
      case 'source':
        return new SourceProcessor();
      case 'filter':
        return new FilterProcessor();
      case 'mapping':
        return new MappingProcessor();
      case 'aggregate':
        return new AggregateProcessor();
      case 'sink':
        return new SinkProcessor();
      case 'quality':
        return new QualityProcessor();
      default:
        throw new Error(`Unsupported node type: ${type}`);
    }
  }
}
