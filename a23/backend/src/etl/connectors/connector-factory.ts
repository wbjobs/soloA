import { DatasourceConnector } from './datasource-connector';
import { MysqlConnector } from './mysql-connector';
import { PostgresqlConnector } from './postgresql-connector';
import { CsvConnector } from './csv-connector';
import { RestApiConnector } from './rest-api-connector';
import { DatasourceType } from '../../entities/datasource.entity';

export class ConnectorFactory {
  static create(type: DatasourceType, config: any): DatasourceConnector {
    switch (type) {
      case 'mysql':
        return new MysqlConnector(config);
      case 'postgresql':
        return new PostgresqlConnector(config);
      case 'csv':
        return new CsvConnector(config);
      case 'rest_api':
        return new RestApiConnector(config);
      default:
        throw new Error(`Unsupported datasource type: ${type}`);
    }
  }
}
