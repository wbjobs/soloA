import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/database';

export interface MaintenanceTaskAttributes {
  id: string;
  title: string;
  description: string;
  taskType: 'inspection' | 'repair' | 'replacement' | 'cleaning' | 'calibration' | 'other';
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  nodeId?: string;
  pipelineId?: string;
  assignee?: string;
  scheduledDate: Date;
  dueDate?: Date;
  completedDate?: Date;
  estimatedDuration?: number;
  actualDuration?: number;
  cost?: number;
  notes?: string;
  checklist?: string[];
  attachments?: string[];
  properties: Record<string, any>;
}

class MaintenanceTask extends Model<MaintenanceTaskAttributes> implements MaintenanceTaskAttributes {
  public id!: string;
  public title!: string;
  public description!: string;
  public taskType!: 'inspection' | 'repair' | 'replacement' | 'cleaning' | 'calibration' | 'other';
  public priority!: 'high' | 'medium' | 'low';
  public status!: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  public nodeId?: string;
  public pipelineId?: string;
  public assignee?: string;
  public scheduledDate!: Date;
  public dueDate?: Date;
  public completedDate?: Date;
  public estimatedDuration?: number;
  public actualDuration?: number;
  public cost?: number;
  public notes?: string;
  public checklist?: string[];
  public attachments?: string[];
  public properties!: Record<string, any>;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

MaintenanceTask.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    taskType: {
      type: DataTypes.ENUM('inspection', 'repair', 'replacement', 'cleaning', 'calibration', 'other'),
      defaultValue: 'inspection',
    },
    priority: {
      type: DataTypes.ENUM('high', 'medium', 'low'),
      defaultValue: 'medium',
    },
    status: {
      type: DataTypes.ENUM('pending', 'in_progress', 'completed', 'cancelled'),
      defaultValue: 'pending',
    },
    nodeId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    pipelineId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    assignee: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    scheduledDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    dueDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completedDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    estimatedDuration: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    actualDuration: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    cost: {
      type: DataTypes.DOUBLE,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    checklist: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
    attachments: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
    },
    properties: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
  },
  {
    sequelize,
    modelName: 'MaintenanceTask',
    tableName: 'maintenance_tasks',
    timestamps: true,
  }
);

export default MaintenanceTask;
