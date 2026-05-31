import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Flow, FlowStatus } from '../entities/flow.entity';
import { FlowVersion, FlowDefinition } from '../entities/flow-version.entity';
import { CreateFlowDto, UpdateFlowDto, SaveFlowVersionDto, UpdateScheduleDto, PublishFlowDto } from './flow.dto';
import { DataLineageService } from '../data-lineage/data-lineage.service';

@Injectable()
export class FlowService {
  constructor(
    @InjectRepository(Flow)
    private flowRepository: Repository<Flow>,
    @InjectRepository(FlowVersion)
    private flowVersionRepository: Repository<FlowVersion>,
    private dataSource: DataSource,
    private dataLineageService?: DataLineageService,
  ) {}

  async findAll(): Promise<Flow[]> {
    return this.flowRepository.find({
      relations: ['versions'],
      order: { updatedAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<Flow> {
    const flow = await this.flowRepository.findOne({
      where: { id },
      relations: ['versions'],
    });
    if (!flow) {
      throw new NotFoundException(`Flow with id ${id} not found`);
    }
    return flow;
  }

  async create(dto: CreateFlowDto): Promise<Flow> {
    const flow = this.flowRepository.create({
      name: dto.name,
      description: dto.description,
      status: 'draft',
      versions: [],
    });
    return this.flowRepository.save(flow);
  }

  async update(id: string, dto: UpdateFlowDto): Promise<Flow> {
    await this.findById(id);
    await this.flowRepository.update(id, dto);
    return this.findById(id);
  }

  async delete(id: string): Promise<void> {
    const result = await this.flowRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Flow with id ${id} not found`);
    }
  }

  async saveVersion(flowId: string, dto: SaveFlowVersionDto): Promise<FlowVersion> {
    const flow = await this.findById(flowId);
    const versions = await this.getVersions(flowId);
    const nextVersion = versions.length > 0 ? Math.max(...versions.map(v => v.version)) + 1 : 1;

    const flowVersion = this.flowVersionRepository.create({
      flowId,
      version: nextVersion,
      changelog: dto.changelog || `Version ${nextVersion}`,
      definition: dto.definition,
    });

    const savedVersion = await this.flowVersionRepository.save(flowVersion);

    if (flow.status === 'published' && !flow.currentVersionId) {
      flow.currentVersionId = savedVersion.id;
      await this.flowRepository.save(flow);
    }

    return savedVersion;
  }

  async getVersions(flowId: string): Promise<FlowVersion[]> {
    return this.flowVersionRepository.find({
      where: { flowId },
      order: { version: 'DESC' },
    });
  }

  async getVersion(flowId: string, versionId: string): Promise<FlowVersion> {
    const version = await this.flowVersionRepository.findOne({
      where: { id: versionId, flowId },
    });
    if (!version) {
      throw new NotFoundException(`Version ${versionId} not found for flow ${flowId}`);
    }
    return version;
  }

  async compareVersions(
    flowId: string,
    versionId1: string,
    versionId2: string,
  ): Promise<{
    version1: FlowVersion;
    version2: FlowVersion;
    changes: {
      nodesAdded: string[];
      nodesRemoved: string[];
      nodesModified: string[];
      edgesChanged: boolean;
    };
  }> {
    const version1 = await this.getVersion(flowId, versionId1);
    const version2 = await this.getVersion(flowId, versionId2);

    const nodes1 = new Map(version1.definition.nodes.map(n => [n.id, n]));
    const nodes2 = new Map(version2.definition.nodes.map(n => [n.id, n]));

    const nodesAdded: string[] = [];
    const nodesRemoved: string[] = [];
    const nodesModified: string[] = [];

    for (const [id, node] of nodes2.entries()) {
      if (!nodes1.has(id)) {
        nodesAdded.push(id);
      } else {
        const oldNode = nodes1.get(id)!;
        if (JSON.stringify(oldNode.data) !== JSON.stringify(node.data)) {
          nodesModified.push(id);
        }
      }
    }

    for (const id of nodes1.keys()) {
      if (!nodes2.has(id)) {
        nodesRemoved.push(id);
      }
    }

    const edges1 = JSON.stringify(version1.definition.edges);
    const edges2 = JSON.stringify(version2.definition.edges);
    const edgesChanged = edges1 !== edges2;

    return {
      version1,
      version2,
      changes: { nodesAdded, nodesRemoved, nodesModified, edgesChanged },
    };
  }

  async rollbackToVersion(flowId: string, versionId: string): Promise<FlowVersion> {
    const version = await this.getVersion(flowId, versionId);
    const versions = await this.getVersions(flowId);
    const nextVersion = versions.length > 0 ? Math.max(...versions.map(v => v.version)) + 1 : 1;

    const newVersion = this.flowVersionRepository.create({
      flowId,
      version: nextVersion,
      changelog: `Rollback to version ${version.version}`,
      definition: version.definition,
    });

    return this.flowVersionRepository.save(newVersion);
  }

  async publish(flowId: string, dto: PublishFlowDto): Promise<Flow> {
    const flow = await this.findById(flowId);
    const version = await this.getVersion(flowId, dto.versionId);

    flow.currentVersionId = version.id;
    flow.status = 'published';
    if (dto.changelog) {
      version.changelog = dto.changelog;
      await this.flowVersionRepository.save(version);
    }

    const savedFlow = await this.flowRepository.save(flow);

    if (this.dataLineageService) {
      try {
        await this.dataLineageService.buildLineageFromFlow(flowId, version.definition);
      } catch (error) {
        console.warn('Failed to build lineage:', error);
      }
    }

    return savedFlow;
  }

  async updateSchedule(flowId: string, dto: UpdateScheduleDto): Promise<Flow> {
    const flow = await this.findById(flowId);
    flow.cronExpression = dto.cronExpression;
    flow.isScheduled = true;
    return this.flowRepository.save(flow);
  }

  async disableSchedule(flowId: string): Promise<Flow> {
    const flow = await this.findById(flowId);
    flow.isScheduled = false;
    return this.flowRepository.save(flow);
  }

  async getCurrentDefinition(flowId: string): Promise<FlowDefinition> {
    const flow = await this.findById(flowId);
    if (!flow.currentVersionId) {
      const versions = await this.getVersions(flowId);
      if (versions.length === 0) {
        throw new BadRequestException('No versions found for this flow');
      }
      return versions[0].definition;
    }
    const version = await this.flowVersionRepository.findOne({
      where: { id: flow.currentVersionId },
    });
    return version.definition;
  }
}
