import React, { useEffect, useRef, useCallback } from 'react';
import cytoscape, { Core, NodeSingular, EdgeSingular } from 'cytoscape';
import type { NodeData } from '../types';

interface TopologyGraphProps {
  nodes: NodeData[];
  onNodeClick: (nodeId: string) => void;
  selectedNodeId?: string | null;
}

const TopologyGraph: React.FC<TopologyGraphProps> = ({ nodes, onNodeClick, selectedNodeId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  const getNodeColor = (node: NodeData): string => {
    switch (node.status) {
      case 'online': return '#4ade80';
      case 'busy': return '#fbbf24';
      case 'offline': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getNodeLabel = (node: NodeData): string => {
    const cpu = node.cpu_usage ? `${node.cpu_usage.toFixed(1)}%` : '-';
    const mem = node.memory_usage ? `${node.memory_usage.toFixed(1)}%` : '-';
    return `${node.name}\nCPU: ${cpu} | MEM: ${mem}`;
  };

  const initGraph = useCallback(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#4ade80',
            'label': 'data(label)',
            'text-wrap': 'wrap',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '12px',
            'font-weight': 'bold',
            'color': '#ffffff',
            'text-outline-color': '#1f2937',
            'text-outline-width': 2,
            'width': 60,
            'height': 60,
            'border-width': 3,
            'border-color': '#ffffff',
            'transition-property': 'background-color, border-width, border-color',
            'transition-duration': '0.3s'
          }
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 4,
            'border-color': '#3b82f6',
            'width': 70,
            'height': 70
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#60a5fa',
            'target-arrow-color': '#60a5fa',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'opacity': 0.7
          }
        },
        {
          selector: '.connected',
          style: {
            'line-color': '#4ade80',
            'target-arrow-color': '#4ade80'
          }
        }
      ],
      layout: {
        name: 'cose',
        animate: true,
        animationDuration: 1000,
        nodeRepulsion: 4000,
        idealEdgeLength: 150,
        edgeElasticity: 100
      },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
      minZoom: 0.5,
      maxZoom: 2
    });

    cy.on('tap', 'node', (event) => {
      const node = event.target as NodeSingular;
      onNodeClick(node.id());
    });

    cyRef.current = cy;
  }, [onNodeClick]);

  useEffect(() => {
    initGraph();
    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
      }
    };
  }, [initGraph]);

  useEffect(() => {
    if (!cyRef.current) return;

    const cy = cyRef.current;

    cy.batch(() => {
      const newNodeIds = new Set<string>();

      nodes.forEach((node) => {
        newNodeIds.add(node.id);
        
        const nodeData = {
          id: node.id,
          label: getNodeLabel(node)
        };

        const existingNode = cy.$id(node.id);
        if (existingNode.length > 0) {
          existingNode.data(nodeData);
          existingNode.style({
            'background-color': getNodeColor(node),
            'opacity': node.status === 'offline' ? 0.5 : 1
          });
        } else {
          cy.add({
            group: 'nodes',
            data: nodeData,
            style: {
              'background-color': getNodeColor(node),
              'opacity': node.status === 'offline' ? 0.5 : 1
            }
          });
        }
      });

      cy.nodes().forEach((existingNode: NodeSingular) => {
        if (!newNodeIds.has(existingNode.id())) {
          existingNode.remove();
        }
      });

      const onlineNodes = nodes.filter(n => n.status === 'online' || n.status === 'busy');
      const onlineNodeIds = new Set(onlineNodes.map(n => n.id));
      
      cy.edges().forEach((edge: EdgeSingular) => {
        const sourceId = edge.source().id();
        const targetId = edge.target().id();
        
        if (!onlineNodeIds.has(sourceId) || !onlineNodeIds.has(targetId)) {
          edge.remove();
        }
      });
      
      const existingEdgeKeys = new Set<string>();
      cy.edges().forEach((edge: EdgeSingular) => {
        const sourceId = edge.source().id();
        const targetId = edge.target().id();
        const key = [sourceId, targetId].sort().join('-');
        existingEdgeKeys.add(key);
      });
      
      for (let i = 0; i < onlineNodes.length; i++) {
        for (let j = i + 1; j < onlineNodes.length; j++) {
          const edgeKey = [onlineNodes[i].id, onlineNodes[j].id].sort().join('-');
          
          if (!existingEdgeKeys.has(edgeKey)) {
            cy.add({
              group: 'edges',
              data: {
                id: `edge-${edgeKey}`,
                source: onlineNodes[i].id,
                target: onlineNodes[j].id
              },
              classes: 'connected'
            });
          }
        }
      }
    });

    const hasLayoutChanges = cy.nodes().length > 0;
    if (hasLayoutChanges) {
      const layout = cy.layout({
        name: 'cose',
        animate: true,
        animationDuration: 500,
        nodeRepulsion: 4000,
        idealEdgeLength: 150
      });
      layout.run();
    }
  }, [nodes]);

  useEffect(() => {
    if (!cyRef.current) return;
    
    if (selectedNodeId) {
      const node = cyRef.current.$id(selectedNodeId);
      if (node.length > 0) {
        node.select();
        cyRef.current.animate({
          fit: { eles: node, padding: 50 },
          center: { eles: node }
        }, {
          duration: 500
        });
      }
    } else {
      cyRef.current.elements().unselect();
    }
  }, [selectedNodeId]);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: '100%',
        backgroundColor: '#1f2937',
        borderRadius: '8px'
      }} 
    />
  );
};

export default TopologyGraph;
