import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Execution, ExecutionStatus } from '../entities/execution.entity';
import { ExecutionLog } from '../entities/execution-log.entity';
import { FlowDefinition, FlowNode } from '../entities/flow-version.entity';
import { ConnectorResult } from './connectors/datasource-connector';
import { ProcessorFactory } from './processors/processor-factory';
import { ExecutionContext } from './processors/node-processor';
import { DatasourceService } from '../datasource/datasource.service';

export const STREAM_BATCH_SIZE = 1000;
export const MAX_PREVIEW_ROWS = 100;

@Injectable()
export class EtlEngineService {
  private readonly logger = new Logger(EtlEngineService.name);

  constructor(
    @InjectRepository(Execution)
    private executionRepository: Repository<Execution>,
    @InjectRepository(ExecutionLog)
    private executionLogRepository: Repository<ExecutionLog>,
    private datasourceService: DatasourceService,
  ) {}

  validateFlow(definition: FlowDefinition): { valid: boolean; error?: string; cycleNodes?: string[] } {
    const nodeMap = new Map(definition.nodes.map(n => [n.id, n]));
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const parentMap = new Map<string, string | null>();

    const dfs = (nodeId: string): string[] | null => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const outgoing = definition.edges
        .filter(e => e.source === nodeId)
        .map(e => e.target);

      for (const nextNodeId of outgoing) {
        parentMap.set(nextNodeId, nodeId);

        if (!visited.has(nextNodeId)) {
          const cycle = dfs(nextNodeId);
          if (cycle) return cycle;
        } else if (recursionStack.has(nextNodeId)) {
          const cycle: string[] = [nextNodeId];
          let current = nodeId;
          while (current !== nextNodeId) {
            cycle.unshift(current);
            current = parentMap.get(current)!;
          }
          cycle.unshift(nextNodeId);
          return cycle;
        }
      }

      recursionStack.delete(nodeId);
      return null;
    };

    for (const node of definition.nodes) {
      if (!visited.has(node.id)) {
        const cycle = dfs(node.id);
        if (cycle) {
          const cycleLabels = cycle.map(id => {
            const n = nodeMap.get(id);
            return n?.data?.label || id;
          });
          return {
            valid: false,
            error: `检测到循环依赖: ${cycleLabels.join(' → ')}`,
            cycleNodes: cycle,
          };
        }
      }
    }

    return { valid: true };
  }

  private topologicalSort(
    nodes: FlowNode[],
    edges: Array<{ source: string; target: string }>,
  ): FlowNode[] {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const inDegree = new Map<string, number>();
    const adjacencyList = new Map<string, string[]>();

    for (const node of nodes) {
      inDegree.set(node.id, 0);
      adjacencyList.set(node.id, []);
    }

    for (const edge of edges) {
      if (!adjacencyList.has(edge.source)) {
        adjacencyList.set(edge.source, []);
      }
      adjacencyList.get(edge.source)!.push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }

    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    const result: FlowNode[] = [];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const node = nodeMap.get(nodeId);
      if (node) {
        result.push(node);
      }

      const neighbors = adjacencyList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        inDegree.set(neighbor, inDegree.get(neighbor)! - 1);
        if (inDegree.get(neighbor) === 0) {
          queue.push(neighbor);
        }
      }
    }

    return result;
  }

  async executeFlow(
    executionId: string,
    definition: FlowDefinition,
    triggerType: 'manual' | 'schedule' | 'api',
    resumeFromExecutionId?: string,
  ): Promise<{ success: boolean; previewData: any[] }> {
    const execution = await this.executionRepository.findOne({
      where: { id: executionId },
    });

    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    const validation = this.validateFlow(definition);
    if (!validation.valid) {
      execution.status = 'failed';
      execution.errorMessage = validation.error || '流程验证失败';
      await this.executionRepository.save(execution);
      throw new BadRequestException(validation.error);
    }

    let checkpoint = execution.checkpoint || { completedNodes: [] };
    
    if (resumeFromExecutionId) {
      await this.log(executionId, 'info', `Resuming from execution: ${resumeFromExecutionId}`);
      const sourceExecution = await this.executionRepository.findOne({
        where: { id: resumeFromExecutionId },
      });
      if (sourceExecution?.checkpoint) {
        checkpoint = { ...sourceExecution.checkpoint };
        execution.metadata = {
          ...execution.metadata,
          isResume: true,
          resumedFromExecutionId,
        };
      }
    }

    if (checkpoint.completedNodes.length > 0) {
      await this.log(executionId, 'info', 
        `Resuming from checkpoint. Already completed: ${checkpoint.completedNodes.length} nodes`);
    }

    try {
      execution.status = 'running';
      if (!execution.startedAt) {
        execution.startedAt = new Date();
      }
      execution.checkpoint = checkpoint;
      await this.executionRepository.save(execution);

      await this.log(executionId, 'info', 'Starting ETL execution');

      const sortedNodes = this.topologicalSort(definition.nodes, definition.edges);
      
      await this.log(executionId, 'info', `执行顺序: ${sortedNodes.map(n => n.data?.label || n.id).join(' → ')}`);

      const nodeMap = new Map(definition.nodes.map(n => [n.id, n]));
      const incomingEdges = new Map<string, string[]>();
      const outgoingEdges = new Map<string, string[]>();

      for (const edge of definition.edges) {
        if (!incomingEdges.has(edge.target)) {
          incomingEdges.set(edge.target, []);
        }
        incomingEdges.get(edge.target)!.push(edge.source);

        if (!outgoingEdges.has(edge.source)) {
          outgoingEdges.set(edge.source, []);
        }
        outgoingEdges.get(edge.source)!.push(edge.target);
      }

      const nodeProgress: Record<string, any> = { ...(execution.nodeProgress || {}) };
      let previewData: any[] = [];
      const finalOutputData: any[] = [];

      for (const node of sortedNodes) {
        if (checkpoint.completedNodes.includes(node.id)) {
          await this.log(executionId, 'info', 
            `Skipping completed node: ${node.data?.label || node.id}`);
          continue;
        }

        const isFailedNode = checkpoint.failedAt?.nodeId === node.id;
        if (isFailedNode && checkpoint.failedAt?.batchIndex !== undefined) {
          await this.log(executionId, 'info', 
            `Resuming failed node from batch ${checkpoint.failedAt.batchIndex}`);
        }

        nodeProgress[node.id] = {
          ...(nodeProgress[node.id] || {}),
          status: 'running',
          startTime: new Date(),
          rowsProcessed: nodeProgress[node.id]?.rowsProcessed || 0,
        };
        execution.nodeProgress = { ...nodeProgress };
        await this.executionRepository.save(execution);

        const nodeLabel = node.data?.label || node.id;
        await this.log(executionId, 'info', `Processing node: ${nodeLabel} (${node.type})`, {
          nodeId: node.id,
        });

        const deps = incomingEdges.get(node.id) || [];
        
        let batchIndex = isFailedNode ? (checkpoint.failedAt?.batchIndex || 0) : 0;
        let hasMoreData = true;
        let totalRowsProcessed = nodeProgress[node.id]?.rowsProcessed || 0;
        let nodeOutputColumns: string[] = [];

        while (hasMoreData) {
          let inputData: ConnectorResult;
          if (deps.length === 0) {
            inputData = {
              data: [],
              columns: [],
              totalRows: 0,
              batchIndex,
              hasMore: false,
            };
          } else {
            inputData = await this.collectInputData(
              deps,
              node,
              batchIndex,
              executionId,
              nodeMap,
            );
          }

          if (inputData.data.length === 0 && inputData.hasMore !== true) {
            hasMoreData = false;
            break;
          }

          const processor = ProcessorFactory.create(node.type);
          
          const context: ExecutionContext = {
            executionId,
            datasourceService: this.datasourceService,
            log: async (level, message, data) => {
              await this.log(executionId, level, message, data);
            },
            updateNodeProgress: async (nodeId, progress) => {
              nodeProgress[nodeId] = { ...nodeProgress[nodeId], ...progress };
              execution.nodeProgress = { ...nodeProgress };
              await this.executionRepository.save(execution);
            },
            batchIndex,
          };

          try {
            const batchResult = await processor.execute(node, inputData, context);
            
            if (batchResult.columns.length > 0) {
              nodeOutputColumns = batchResult.columns;
            }

            totalRowsProcessed += batchResult.data.length;
            nodeProgress[node.id].rowsProcessed = totalRowsProcessed;
            nodeProgress[node.id].lastBatchIndex = batchIndex;
            execution.nodeProgress = { ...nodeProgress };
            
            checkpoint = {
              ...checkpoint,
              currentNode: node.id,
              lastBatchIndex: batchIndex,
            };
            execution.checkpoint = checkpoint;
            await this.executionRepository.save(execution);

            if (batchResult.data.length > 0 && previewData.length < MAX_PREVIEW_ROWS) {
              const remaining = MAX_PREVIEW_ROWS - previewData.length;
              previewData = [...previewData, ...batchResult.data.slice(0, remaining)];
            }

            const nextNodeIds = outgoingEdges.get(node.id) || [];
            if (nextNodeIds.length === 0) {
              finalOutputData.push(...batchResult.data);
            }

            hasMoreData = inputData.hasMore === true || batchResult.hasMore === true;
            batchIndex++;

            if (batchIndex > 1) {
              await this.log(executionId, 'debug', 
                `Node ${nodeLabel}: processed batch ${batchIndex}, total ${totalRowsProcessed} rows`);
            }
          } catch (error) {
            checkpoint.failedAt = {
              nodeId: node.id,
              batchIndex,
              error: error.message,
              timestamp: new Date(),
            };
            execution.checkpoint = checkpoint;
            
            nodeProgress[node.id] = {
              ...nodeProgress[node.id],
              status: 'failed',
              endTime: new Date(),
              error: error.message,
            };
            execution.nodeProgress = { ...nodeProgress };

            if (execution.retryCount < execution.maxRetries) {
              execution.status = 'retry_pending';
              execution.retryCount += 1;
              execution.metadata = {
                ...execution.metadata,
                retryCount: execution.retryCount,
              };
              await this.executionRepository.save(execution);
              
              await this.log(executionId, 'warn', 
                `Node execution failed, scheduling retry (${execution.retryCount}/${execution.maxRetries}): ${error.message}`, {
                nodeId: node.id,
                stack: error.stack,
              });
              
              return { success: false, previewData };
            }

            execution.status = 'failed';
            execution.errorMessage = `[${nodeLabel}] ${error.message}`;
            execution.completedAt = new Date();
            await this.executionRepository.save(execution);

            await this.log(executionId, 'error', `Node execution failed: ${error.message}`, {
              nodeId: node.id,
              stack: error.stack,
            });

            throw error;
          }
        }

        checkpoint.completedNodes = [...new Set([...checkpoint.completedNodes, node.id])];
        checkpoint.currentNode = undefined;
        checkpoint.failedAt = undefined;
        execution.checkpoint = checkpoint;

        nodeProgress[node.id] = {
          ...nodeProgress[node.id],
          status: 'completed',
          endTime: new Date(),
          totalRows: totalRowsProcessed,
        };
        execution.nodeProgress = { ...nodeProgress };
        await this.executionRepository.save(execution);

        await this.log(executionId, 'info', 
          `Node ${nodeLabel} completed: processed ${totalRowsProcessed} rows`);
      }

      execution.status = 'completed';
      execution.completedAt = new Date();
      execution.metadata = {
        ...execution.metadata,
        triggerType,
        previewData,
        totalOutputRows: finalOutputData.length,
      };
      execution.checkpoint = checkpoint;
      await this.executionRepository.save(execution);

      await this.log(executionId, 'info', 
        `ETL execution completed successfully. Total output: ${finalOutputData.length} rows`);

      return { success: true, previewData };
    } catch (error) {
      await this.log(executionId, 'error', `ETL execution failed: ${error.message}`);
      throw error;
    }
  }

  private async collectInputData(
    depNodeIds: string[],
    currentNode: FlowNode,
    batchIndex: number,
    executionId: string,
    nodeMap: Map<string, FlowNode>,
  ): Promise<ConnectorResult> {
    if (depNodeIds.length === 1) {
      const depNode = nodeMap.get(depNodeIds[0]);
      if (!depNode) {
        return { data: [], columns: [], totalRows: 0 };
      }

      const processor = ProcessorFactory.create(depNode.type);
      const context: ExecutionContext = {
        executionId,
        datasourceService: this.datasourceService,
        log: async () => {},
        updateNodeProgress: async () => {},
        batchIndex,
      };

      try {
        return await processor.executeStream?.(depNode, batchIndex, context) || 
               { data: [], columns: [], totalRows: 0, hasMore: false };
      } catch {
        return { data: [], columns: [], totalRows: 0, hasMore: false };
      }
    }

    const allData: any[] = [];
    const allColumns = new Set<string>();
    let hasMore = false;

    for (const depNodeId of depNodeIds) {
      const depNode = nodeMap.get(depNodeId);
      if (!depNode) continue;

      const processor = ProcessorFactory.create(depNode.type);
      const context: ExecutionContext = {
        executionId,
        datasourceService: this.datasourceService,
        log: async () => {},
        updateNodeProgress: async () => {},
        batchIndex,
      };

      try {
        const result = await processor.executeStream?.(depNode, batchIndex, context);
        if (result) {
          allData.push(...result.data);
          result.columns.forEach(c => allColumns.add(c));
          if (result.hasMore) hasMore = true;
        }
      } catch {
        // skip
      }
    }

    return {
      data: allData,
      columns: Array.from(allColumns),
      totalRows: allData.length,
      hasMore,
    };
  }

  private mergeResults(results: ConnectorResult[]): ConnectorResult {
    if (results.length === 0) {
      return { data: [], columns: [], totalRows: 0 };
    }
    if (results.length === 1) {
      return results[0];
    }

    const allColumns = new Set<string>();
    for (const result of results) {
      result.columns.forEach(col => allColumns.add(col));
    }
    const columns = Array.from(allColumns);

    const mergedData: any[] = [];
    for (const result of results) {
      for (const row of result.data) {
        const mergedRow: any = {};
        for (const col of columns) {
          mergedRow[col] = row[col];
        }
        mergedData.push(mergedRow);
      }
    }

    return {
      data: mergedData,
      columns,
      totalRows: mergedData.length,
    };
  }

  async log(
    executionId: string,
    level: string,
    message: string,
    data?: any,
  ): Promise<ExecutionLog> {
    const log = this.executionLogRepository.create({
      executionId,
      level: level as any,
      message,
      data,
    });

    this.logger.log(`[${level}] ${executionId}: ${message}`);

    return this.executionLogRepository.save(log);
  }

  async getLogs(executionId: string): Promise<ExecutionLog[]> {
    return this.executionLogRepository.find({
      where: { executionId },
      order: { timestamp: 'ASC' },
    });
  }

  async createExecution(
    flowId: string,
    flowVersionId: string,
    versionNumber: number,
  ): Promise<Execution> {
    const execution = this.executionRepository.create({
      flowId,
      flowVersionId,
      versionNumber,
      status: 'pending',
      metadata: {},
      nodeProgress: {},
    });
    return this.executionRepository.save(execution);
  }
}
