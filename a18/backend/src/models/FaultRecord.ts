import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';

export interface FaultRecordAttributes {
  id: string;
  faultType: 'pipe_break' | 'valve_failure' | 'leak' | 'clog' | 'pump_failure' | 'other';
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'active' | 'resolved' | 'in_progress';
  pipelineId?: string;
  nodeId?: string;
  x: number;
  y: number;
  z?: number;
  description: string;
  startTime: Date;
  endTime?: Date;
  affectedArea?: Record<string, any>;
  cause?: string;
  resolution?: string;
  affectedNodes?: string[];
  affectedPipelines?: string[];
  estimatedRepairTime?: number;
  cost?: number;
  properties: Record<string, any>;
}

class FaultRecord extends Model<FaultRecordAttributes> implements FaultRecordAttributes {
  public id!: string;
  public faultType!: 'pipe_break' | 'valve_failure' | 'leak' | 'clog' | 'pump_failure' | 'other';
  public severity!: 'critical' | 'high' | 'medium' | 'low';
  public status!: 'active' | 'resolved' | 'in_progress';
  public pipelineId?: string;
  public nodeId?: string;
  public x!: number;
  public y!: number;
  public z?: number;
  public description!: string;
  public startTime!: Date;
  public endTime?: Date;
  public affectedArea?: Record<string, any>;
  public cause?: string;
  public resolution?: string;
  public affectedNodes?: string[];
  public affectedPipelines?: string[];
  public estimatedRepairTime?: number;
  public cost?: number;
  public properties!: Record<string, any>;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

FaultRecord.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    faultType: {
      type: DataTypes.ENUM('pipe_break', 'valve_failure', 'leak', 'clog', 'pump_failure', 'other'),
      allowNull: false,
    },
    severity: {
      type: DataTypes.ENUM('critical', 'high', 'medium', 'low'),
      defaultValue: 'medium',
    },
    status: {
      type: DataTypes.ENUM('active', 'resolved', 'in_progress'),
      defaultValue: 'active',
    },
    pipelineId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    nodeId: {
      type: DataTypes.UUID,
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
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    startTime: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    endTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    affectedArea: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    cause: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    resolution: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    affectedNodes: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      allowNull: true,
    },
    affectedPipelines: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      allowNull: true,
    },
    estimatedRepairTime: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    cost: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    properties: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
  },
  {
    sequelize,
    modelName: 'FaultRecord',
    tableName: 'fault_records',
    timestamps: true,
  }
);

export default FaultRecord;
