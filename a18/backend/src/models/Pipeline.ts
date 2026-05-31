import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';

export interface PipelineAttributes {
  id: string;
  name: string;
  startNodeId: string;
  endNodeId: string;
  material: string;
  diameter: number;
  length: number;
  depth: number;
  flowRate: number;
  velocity: number;
  roughness: number;
  status: 'active' | 'inactive' | 'maintenance';
  properties: Record<string, any>;
  layerId: string;
  geometry: Record<string, any>;
}

class Pipeline extends Model<PipelineAttributes> implements PipelineAttributes {
  public id!: string;
  public name!: string;
  public startNodeId!: string;
  public endNodeId!: string;
  public material!: string;
  public diameter!: number;
  public length!: number;
  public depth!: number;
  public flowRate!: number;
  public velocity!: number;
  public roughness!: number;
  public status!: 'active' | 'inactive' | 'maintenance';
  public properties!: Record<string, any>;
  public layerId!: string;
  public geometry!: Record<string, any>;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Pipeline.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    startNodeId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    endNodeId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    material: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    diameter: {
      type: DataTypes.DOUBLE,
      allowNull: false,
    },
    length: {
      type: DataTypes.DOUBLE,
      allowNull: false,
    },
    depth: {
      type: DataTypes.DOUBLE,
      defaultValue: 0,
    },
    flowRate: {
      type: DataTypes.DOUBLE,
      defaultValue: 0,
    },
    velocity: {
      type: DataTypes.DOUBLE,
      defaultValue: 0,
    },
    roughness: {
      type: DataTypes.DOUBLE,
      defaultValue: 0.01,
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'maintenance'),
      defaultValue: 'active',
    },
    properties: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
    layerId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    geometry: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'Pipeline',
    tableName: 'pipelines',
    timestamps: true,
  }
);

export default Pipeline;
