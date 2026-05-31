import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';

export interface PipelineNodeAttributes {
  id: string;
  name: string;
  nodeType: 'junction' | 'valve' | 'pump' | 'tank' | 'reservoir';
  x: number;
  y: number;
  z: number;
  elevation: number;
  pressure: number;
  demand: number;
  properties: Record<string, any>;
  layerId: string;
}

class PipelineNode extends Model<PipelineNodeAttributes> implements PipelineNodeAttributes {
  public id!: string;
  public name!: string;
  public nodeType!: 'junction' | 'valve' | 'pump' | 'tank' | 'reservoir';
  public x!: number;
  public y!: number;
  public z!: number;
  public elevation!: number;
  public pressure!: number;
  public demand!: number;
  public properties!: Record<string, any>;
  public layerId!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

PipelineNode.init(
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
    nodeType: {
      type: DataTypes.ENUM('junction', 'valve', 'pump', 'tank', 'reservoir'),
      allowNull: false,
    },
    x: {
      type: DataTypes.DOUBLE,
      allowNull: false,
    },
    y: {
      type: DataTypes.DOUBLE,
      allowNull: false,
    },
    z: {
      type: DataTypes.DOUBLE,
      defaultValue: 0,
    },
    elevation: {
      type: DataTypes.DOUBLE,
      defaultValue: 0,
    },
    pressure: {
      type: DataTypes.DOUBLE,
      defaultValue: 0,
    },
    demand: {
      type: DataTypes.DOUBLE,
      defaultValue: 0,
    },
    properties: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
    layerId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'PipelineNode',
    tableName: 'pipeline_nodes',
    timestamps: true,
  }
);

export default PipelineNode;
