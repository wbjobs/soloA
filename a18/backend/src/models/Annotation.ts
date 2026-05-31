import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';

export interface AnnotationAttributes {
  id: string;
  annotationType: 'label' | 'marker' | 'measurement' | 'note';
  title: string;
  content: string;
  x: number;
  y: number;
  z?: number;
  endX?: number;
  endY?: number;
  endZ?: number;
  measurementType?: 'distance' | 'area' | 'height' | 'angle';
  measurementValue?: number;
  measurementUnit?: string;
  style: Record<string, any>;
  visible: boolean;
  layerId?: string;
  properties: Record<string, any>;
}

class Annotation extends Model<AnnotationAttributes> implements AnnotationAttributes {
  public id!: string;
  public annotationType!: 'label' | 'marker' | 'measurement' | 'note';
  public title!: string;
  public content!: string;
  public x!: number;
  public y!: number;
  public z?: number;
  public endX?: number;
  public endY?: number;
  public endZ?: number;
  public measurementType?: 'distance' | 'area' | 'height' | 'angle';
  public measurementValue?: number;
  public measurementUnit?: string;
  public style!: Record<string, any>;
  public visible!: boolean;
  public layerId?: string;
  public properties!: Record<string, any>;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Annotation.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    annotationType: {
      type: DataTypes.ENUM('label', 'marker', 'measurement', 'note'),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true,
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
      allowNull: true,
    },
    endX: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    endY: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    endZ: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    measurementType: {
      type: DataTypes.ENUM('distance', 'area', 'height', 'angle'),
      allowNull: true,
    },
    measurementValue: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    measurementUnit: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    style: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
    visible: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    layerId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    properties: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
  },
  {
    sequelize,
    modelName: 'Annotation',
    tableName: 'annotations',
    timestamps: true,
  }
);

export default Annotation;
