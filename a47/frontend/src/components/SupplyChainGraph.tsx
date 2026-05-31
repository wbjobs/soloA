import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { GraphData, SupplierNode, SupplyEdge, RiskHeatmapNode } from '../types';
import { graphApi } from '../services/api';

interface SupplyChainGraphProps {
  graphData: GraphData;
  onNodeClick?: (node: SupplierNode) => void;
  failedNodes?: Set<string>;
  riskHeatmap?: RiskHeatmapNode[];
  criticalPaths?: string[][];
  onExpandNode?: (nodeId: string, subgraph: GraphData) => void;
}

interface NodeData extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  tier: number;
  category: string;
  risk_score: number;
  risk_level?: string;
  risk_value?: number;
  isFailed?: boolean;
  isExpanded?: boolean;
  isOnCriticalPath?: boolean;
}

interface LinkData {
  source: NodeData | string;
  target: NodeData | string;
  volume: number;
  lead_time: number;
  dependency_ratio: number;
  isAffected?: boolean;
  isOnCriticalPath?: boolean;
}

const TIER_COLORS: Record<number, string> = {
  0: '#1a56db',
  1: '#3f83f8',
  2: '#6875f5',
  3: '#8b5cf6',
  4: '#a855f7',
  5: '#d946ef',
};

const RISK_COLORS: Record<string, string> = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#ef4444',
  critical: '#dc2626',
};

export const SupplyChainGraph: React.FC<SupplyChainGraphProps> = ({
  graphData,
  onNodeClick,
  failedNodes = new Set(),
  riskHeatmap = [],
  criticalPaths = [],
  onExpandNode
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [loadingNode, setLoadingNode] = useState<string | null>(null);
  const simulationRef = useRef<d3.Simulation<NodeData, LinkData> | null>(null);
  const nodesRef = useRef<NodeData[]>([]);
  const linksRef = useRef<LinkData[]>([]);

  const criticalPathSet = new Set<string>();
  criticalPaths.forEach(path => path.forEach(node => criticalPathSet.add(node)));

  const criticalPathEdges = new Set<string>();
  criticalPaths.forEach(path => {
    for (let i = 0; i < path.length - 1; i++) {
      criticalPathEdges.add(`${path[i]}-${path[i + 1]}`);
    }
  });

  const riskHeatmapMap = new Map<string, RiskHeatmapNode>();
  riskHeatmap.forEach(node => riskHeatmapMap.set(node.node_id, node));

  const getNodeColor = useCallback((d: NodeData): string => {
    if (d.isFailed) {
      return '#dc2626';
    }
    if (d.isOnCriticalPath) {
      return '#ef4444';
    }
    if (d.risk_level) {
      return RISK_COLORS[d.risk_level] || TIER_COLORS[d.tier] || '#6b7280';
    }
    return TIER_COLORS[d.tier] || '#6b7280';
  }, []);

  const getNodeRadius = useCallback((d: NodeData): number => {
    const baseRadius = 10 + d.tier * 2;
    if (d.risk_score > 0.7) {
      return baseRadius * 1.3;
    }
    if (d.isFailed) {
      return baseRadius * 1.5;
    }
    return baseRadius;
  }, []);

  const handleNodeClick = useCallback(async (event: d3.D3DragEvent<SVGGElement, NodeData, unknown>, d: NodeData) => {
    event.stopPropagation();
    setSelectedNode(d.id);

    const nodeData: SupplierNode = {
      id: d.id,
      name: d.name,
      tier: d.tier,
      category: d.category,
      latitude: null,
      longitude: null,
      capacity: 0,
      quality_score: 0,
      risk_score: d.risk_score,
      country: ''
    };

    onNodeClick?.(nodeData);

    if (!expandedNodes.has(d.id) && onExpandNode) {
      setLoadingNode(d.id);
      try {
        const subgraph = await graphApi.getSubgraph(d.id, 'downstream', 2);
        setExpandedNodes(prev => new Set(prev).add(d.id));
        onExpandNode(d.id, subgraph);
      } catch (error) {
        console.error('Error loading subgraph:', error);
      } finally {
        setLoadingNode(null);
      }
    }
  }, [expandedNodes, onNodeClick, onExpandNode]);

  useEffect(() => {
    if (!svgRef.current || !graphData.nodes.length) return;

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    svg.selectAll('*').remove();

    const nodes: NodeData[] = graphData.nodes.map(node => ({
      ...node,
      risk_level: riskHeatmapMap.get(node.id)?.risk_level,
      risk_value: riskHeatmapMap.get(node.id)?.risk_value,
      isFailed: failedNodes.has(node.id),
      isOnCriticalPath: criticalPathSet.has(node.id),
      x: width / 2,
      y: height / 2,
    }));

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    const links: LinkData[] = graphData.edges.map(edge => {
      const sourceNode = nodeMap.get(edge.source);
      const targetNode = nodeMap.get(edge.target);
      return {
        source: sourceNode || edge.source,
        target: targetNode || edge.target,
        volume: edge.volume,
        lead_time: edge.lead_time,
        dependency_ratio: edge.dependency_ratio,
        isOnCriticalPath: criticalPathEdges.has(`${edge.source}-${edge.target}`)
      };
    });

    nodesRef.current = nodes;
    linksRef.current = links;

    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    const defs = svg.append('defs');

    const marker = defs.append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 6)
      .attr('markerHeight', 6);

    marker.append('polygon')
      .attr('points', '0 -5, 10 0, 0 5')
      .attr('fill', '#94a3b8');

    const criticalMarker = defs.append('marker')
      .attr('id', 'critical-arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 8)
      .attr('markerHeight', 8);

    criticalMarker.append('polygon')
      .attr('points', '0 -5, 10 0, 0 5')
      .attr('fill', '#ef4444');

    const simulation = d3.forceSimulation<NodeData, LinkData>(nodes)
      .force('link', d3.forceLink<NodeData, LinkData>(links)
        .id(d => d.id)
        .distance((d) => 80 + d.dependency_ratio * 50)
        .strength(0.3)
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius((d) => getNodeRadius(d) + 10))
      .force('y', d3.forceY((d) => height / 2 + d.tier * 80).strength(0.1));

    simulationRef.current = simulation;

    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', d => d.isOnCriticalPath ? '#ef4444' : '#94a3b8')
      .attr('stroke-width', d => d.isOnCriticalPath ? 3 : 1.5)
      .attr('stroke-opacity', 0.6)
      .attr('marker-end', d => d.isOnCriticalPath ? 'url(#critical-arrowhead)' : 'url(#arrowhead)');

    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(d3.drag<SVGGElement, NodeData>()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
      );

    node.append('circle')
      .attr('r', d => getNodeRadius(d))
      .attr('fill', d => getNodeColor(d))
      .attr('stroke', d => selectedNode === d.id ? '#fff' : d.isOnCriticalPath ? '#dc2626' : '#e5e7eb')
      .attr('stroke-width', d => selectedNode === d.id ? 3 : d.isOnCriticalPath ? 2 : 1)
      .style('filter', d => d.isFailed || d.isOnCriticalPath ? 'drop-shadow(0 0 6px rgba(239, 68, 68, 0.5))' : 'none');

    node.append('text')
      .attr('dy', d => getNodeRadius(d) + 12)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('fill', '#374151')
      .text(d => d.name.length > 12 ? d.name.substring(0, 12) + '...' : d.name);

    node.append('text')
      .attr('dy', 4)
      .attr('text-anchor', 'middle')
      .attr('font-size', '8px')
      .attr('fill', '#fff')
      .text(d => `T${d.tier}`);

    node.on('click', handleNodeClick);

    node.append('title')
      .text(d => `${d.name}\nTier: ${d.tier}\nCategory: ${d.category}\nRisk Score: ${d.risk_score.toFixed(2)}`);

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as NodeData).x || 0)
        .attr('y1', d => (d.source as NodeData).y || 0)
        .attr('x2', d => (d.target as NodeData).x || 0)
        .attr('y2', d => (d.target as NodeData).y || 0);

      node
        .attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [graphData, failedNodes, riskHeatmap, criticalPaths, selectedNode, getNodeColor, getNodeRadius, handleNodeClick]);

  return (
    <div className="relative w-full h-full min-h-[500px] bg-gray-50 rounded-lg">
      <svg
        ref={svgRef}
        className="w-full h-full"
        style={{ minHeight: '500px' }}
      />

      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-md">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Legend</h4>
        <div className="space-y-1">
          {Object.entries(TIER_COLORS).slice(0, 5).map(([tier, color]) => (
            <div key={tier} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs text-gray-600">Tier {tier}</span>
            </div>
          ))}
          <div className="border-t my-2" />
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-600" />
            <span className="text-xs text-gray-600">Failed/Critical</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-xs text-gray-600">Low Risk</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="text-xs text-gray-600">Medium Risk</span>
          </div>
        </div>
      </div>

      {loadingNode && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/50">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
            <span className="text-sm text-gray-600">Loading subgraph for {loadingNode}...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplyChainGraph;
