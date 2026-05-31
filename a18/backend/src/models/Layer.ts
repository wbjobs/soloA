import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';

export interface LayerAttributes {
  id: string;
  name: string;
  type: 'terrain' | 'pipeline' | 'node' | 'annotation';
  visible: boolean;
  style: Record<string, any>;
  properties: Record<string, any>;
  order: number;
}

class Layer extends Model<LayerAttributes> implements LayerAttributes {
  public id!: string;
  public name!: string;
  public type!: 'terrain' | 'pipeline' | 'node' | 'annotation';
  public visible!: boolean;
  public style!: Record<string, any>;
  public properties!: Record<string, any>;
  public order!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Layer.init(
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
    type: {
      type: DataTypes.ENUM('terrain', 'pipeline', 'node', 'annotation'),
      allowNull: false,
    },
    visible: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    style: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
    properties: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
    order: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: 'Layer',
    tableName: 'layers',
    timestamps: true,
  }
);

export default Layer;
