import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DataLineage, LineageNodeType, LineageMetadata } from '../entities/data-lineage.entity';
import { FlowDefinition, FlowNode } from '../entities/flow-version.entity';
import { DatasourceService } from '../datasource/datasource.service';

export interface LineageGraph {
  nodes: Array<{
    id: string;
    label: string;
    type: LineageNodeType;
    datasourceType?: string;
    nodeType?: string;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceType: LineageNodeType;
    targetType: LineageNodeType;
    metadata?: LineageMetadata;
  }>;
}

@Injectable()
export class DataLineageService {
  private readonly logger = new Logger(DataLineageService.name);

  constructor(
    @InjectRepository(DataLineage)
    private lineageRepository: Repository<DataLineage>,
    private datasourceService: DatasourceService,
  ) {}

  async buildLineageFromFlow(
    flowId: string,
    definition: FlowDefinition,
  ): Promise<LineageGraph> {
    const nodes: LineageGraph['nodes'] = [];
    const edges: LineageGraph['edges'] = [];
    const addedNodeIds = new Set<string>();

    await this.lineageRepository.delete({ flowId });

    const nodeMap = new Map(definition.nodes.map(n => [n.id, n]));

    for (const edge of definition.edges) {
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);

      if (!sourceNode || !targetNode) continue;

      const sourceDatasourceId = sourceNode.data.datasourceId;
      const targetDatasourceId = targetNode.data.datasourceId;

      if (sourceNode.type === 'source' && sourceDatasourceId) {
        const dsId = `ds:${sourceDatasourceId}`;
        if (!addedNodeIds.has(dsId)) {
          const ds = await this.safeFindDatasource(sourceDatasourceId);
          nodes.push({
            id: dsId,
            label: ds?.name || `源数据源`,
            type: 'datasource',
            datasourceType: ds?.type,
          });
          addedNodeIds.add(dsId);
        }

        const sourceNodeId = `node:${sourceNode.id}`;
        if (!addedNodeIds.has(sourceNodeId)) {
          nodes.push({
            id: sourceNodeId,
            label: sourceNode.data.label,
            type: 'node',
            nodeType: sourceNode.type,
          });
          addedNodeIds.add(sourceNodeId);
        }

        const edge1 = this.lineageRepository.create({
          flowId,
          sourceNodeId: dsId,
          sourceNodeLabel: nodes.find(n => n.id === dsId)?.label || '',
          sourceNodeType: 'datasource',
          targetNodeId: sourceNodeId,
          targetNodeLabel: sourceNode.data.label,
          targetNodeType: 'node',
          metadata: {
            datasourceType: nodes.find(n => n.id === dsId)?.datasourceType,
            nodeType: sourceNode.type,
          },
          status: 'active',
        });
        await this.lineageRepository.save(edge1);

        edges.push({
          id: edge1.id,
          source: dsId,
          target: sourceNodeId,
          sourceType: 'datasource',
          targetType: 'node',
          metadata: edge1.metadata,
        });
      }

      const sourceNodeId = `node:${sourceNode.id}`;
      if (!addedNodeIds.has(sourceNodeId)) {
        nodes.push({
          id: sourceNodeId,
          label: sourceNode.data.label,
          type: 'node',
          nodeType: sourceNode.type,
        });
        addedNodeIds.add(sourceNodeId);
      }

      const targetNodeId = `node:${targetNode.id}`;
      if (!addedNodeIds.has(targetNodeId)) {
        nodes.push({
          id: targetNodeId,
          label: targetNode.data.label,
          type: 'node',
          nodeType: targetNode.type,
        });
        addedNodeIds.add(targetNodeId);
      }

      const nodeEdgeMetadata: LineageMetadata = {
        nodeType: targetNode.type,
      };

      if (targetNode.type === 'filter' && targetNode.data.config?.conditions) {
        nodeEdgeMetadata.filterCondition = JSON.stringify(targetNode.data.config.conditions);
      }

      if (targetNode.type === 'mapping' && targetNode.data.config?.mappings) {
        nodeEdgeMetadata.mapping = targetNode.data.config.mappings;
      }

      if (targetNode.type === 'quality' && targetNode.data.config?.checks) {
        nodeEdgeMetadata.qualityChecks = targetNode.data.config.checks.map(
          (c: any) => `${c.type}:${c.field}`,
        );
      }

      if (targetNode.type === 'aggregate' && targetNode.data.config?.aggregations) {
        nodeEdgeMetadata.transformation = JSON.stringify(targetNode.data.config.aggregations);
      }

      const edge2 = this.lineageRepository.create({
        flowId,
        sourceNodeId: sourceNodeId,
        sourceNodeLabel: sourceNode.data.label,
        sourceNodeType: 'node',
        targetNodeId: targetNodeId,
        targetNodeLabel: targetNode.data.label,
        targetNodeType: 'node',
        metadata: nodeEdgeMetadata,
        status: 'active',
      });
      await this.lineageRepository.save(edge2);

      edges.push({
        id: edge2.id,
        source: sourceNodeId,
        target: targetNodeId,
        sourceType: 'node',
        targetType: 'node',
        metadata: nodeEdgeMetadata,
      });

      if (targetNode.type === 'sink' && targetDatasourceId) {
        const targetDsId = `ds:${targetDatasourceId}`;
        if (!addedNodeIds.has(targetDsId)) {
          const ds = await this.safeFindDatasource(targetDatasourceId);
          nodes.push({
            id: targetDsId,
            label: ds?.name || `目标数据源`,
            type: 'datasource',
            datasourceType: ds?.type,
          });
          addedNodeIds.add(targetDsId);
        }

        const sinkNodeId = `node:${targetNode.id}`;

        const edge3 = this.lineageRepository.create({
          flowId,
          sourceNodeId: sinkNodeId,
          sourceNodeLabel: targetNode.data.label,
          sourceNodeType: 'node',
          targetNodeId: targetDsId,
          targetNodeLabel: nodes.find(n => n.id === targetDsId)?.label || '',
          targetNodeType: 'datasource',
          metadata: {
            datasourceType: nodes.find(n => n.id === targetDsId)?.datasourceType,
            nodeType: targetNode.type,
          },
          status: 'active',
        });
        await this.lineageRepository.save(edge3);

        edges.push({
          id: edge3.id,
          source: sinkNodeId,
          target: targetDsId,
          sourceType: 'node',
          targetType: 'datasource',
          metadata: edge3.metadata,
        });
      }
    }

    return { nodes, edges };
  }

  private async safeFindDatasource(id: string) {
    try {
      return await this.datasourceService.findById(id);
    } catch {
      return null;
    }
  }

  async getFlowLineage(flowId: string): Promise<LineageGraph> {
    const lineages = await this.lineageRepository.find({
      where: { flowId, status: 'active' },
      order: { createdAt: 'ASC' },
    });

    const nodes = new Map<string, LineageGraph['nodes'][0]>();
    const edges: LineageGraph['edges'] = [];

    for (const lineage of lineages) {
      if (!nodes.has(lineage.sourceNodeId)) {
        nodes.set(lineage.sourceNodeId, {
          id: lineage.sourceNodeId,
          label: lineage.sourceNodeLabel,
          type: lineage.sourceNodeType,
          datasourceType: lineage.metadata?.datasourceType,
          nodeType: lineage.metadata?.nodeType,
        });
      }

      if (!nodes.has(lineage.targetNodeId)) {
        nodes.set(lineage.targetNodeId, {
          id: lineage.targetNodeId,
          label: lineage.targetNodeLabel,
          type: lineage.targetNodeType,
        });
      }

      edges.push({
        id: lineage.id,
        source: lineage.sourceNodeId,
        target: lineage.targetNodeId,
        sourceType: lineage.sourceNodeType,
        targetType: lineage.targetNodeType,
        metadata: lineage.metadata,
      });
    }

    return {
      nodes: Array.from(nodes.values()),
      edges,
    };
  }

  async getDatasourceLineage(datasourceId: string): Promise<LineageGraph> {
    const dsId = `ds:${datasourceId}`;
    
    const sourceLineages = await this.lineageRepository.find({
      where: { sourceNodeId: dsId, status: 'active' },
    });

    const targetLineages = await this.lineageRepository.find({
      where: { targetNodeId: dsId, status: 'active' },
    });

    const allLineages = [...sourceLineages, ...targetLineages];
    const flowIds = [...new Set(allLineages.map(l => l.flowId))];

    const allFlowLineages = await this.lineageRepository.find({
      where: { flowId: In(flowIds), status: 'active' },
    });

    const nodes = new Map<string, LineageGraph['nodes'][0]>();
    const edges: LineageGraph['edges'] = [];

    for (const lineage of allFlowLineages) {
      if (!nodes.has(lineage.sourceNodeId)) {
        nodes.set(lineage.sourceNodeId, {
          id: lineage.sourceNodeId,
          label: lineage.sourceNodeLabel,
          type: lineage.sourceNodeType,
          datasourceType: lineage.metadata?.datasourceType,
          nodeType: lineage.metadata?.nodeType,
        });
      }

      if (!nodes.has(lineage.targetNodeId)) {
        nodes.set(lineage.targetNodeId, {
          id: lineage.targetNodeId,
          label: lineage.targetNodeLabel,
          type: lineage.targetNodeType,
        });
      }

      edges.push({
        id: lineage.id,
        source: lineage.sourceNodeId,
        target: lineage.targetNodeId,
        sourceType: lineage.sourceNodeType,
        targetType: lineage.targetNodeType,
        metadata: lineage.metadata,
      });
    }

    return {
      nodes: Array.from(nodes.values()),
      edges,
    };
  }

  async clearFlowLineage(flowId: string): Promise<void> {
    await this.lineageRepository.delete({ flowId });
    this.logger.log(`Cleared lineage for flow: ${flowId}`);
  }
}
