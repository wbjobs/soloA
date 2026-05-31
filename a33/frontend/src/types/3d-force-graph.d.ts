declare module '3d-force-graph' {
  interface NodeObject {
    id: string
    name?: string
    type?: string
    color?: string
    val?: number
  }

  interface LinkObject<NodeType = NodeObject> {
    source: string | NodeType
    target: string | NodeType
    relation?: string
    label?: string
  }

  interface IForceGraph3D<NodeType = NodeObject, LinkType = LinkObject<NodeType>> {
    (): (container: HTMLElement) => ForceGraphInstance<NodeType, LinkType>
    default: IForceGraph3D<NodeType, LinkType>
  }

  interface ForceGraphInstance<NodeType = NodeObject, LinkType = LinkObject<NodeType>> {
    graphData(data: { nodes: NodeType[]; links: LinkType[] }): ForceGraphInstance<NodeType, LinkType>
    graphData(): { nodes: NodeType[]; links: LinkType[] }
    nodeColor(color: string | ((node: NodeType) => string)): ForceGraphInstance<NodeType, LinkType>
    nodeVal(val: number | string | ((node: NodeType) => number)): ForceGraphInstance<NodeType, LinkType>
    nodeLabel(label: string | ((node: NodeType) => string)): ForceGraphInstance<NodeType, LinkType>
    nodeThreeObject(obj: any | ((node: NodeType) => any)): ForceGraphInstance<NodeType, LinkType>
    linkWidth(width: number | ((link: LinkType) => number)): ForceGraphInstance<NodeType, LinkType>
    linkColor(color: string | ((link: LinkType) => string)): ForceGraphInstance<NodeType, LinkType>
    linkDirectionalParticles(count: number | ((link: LinkType) => number)): ForceGraphInstance<NodeType, LinkType>
    linkDirectionalParticleWidth(width: number): ForceGraphInstance<NodeType, LinkType>
    enableNodeDrag(enabled: boolean): ForceGraphInstance<NodeType, LinkType>
    enableNavigationControls(enabled: boolean): ForceGraphInstance<NodeType, LinkType>
    showNavInfo(show: boolean): ForceGraphInstance<NodeType, LinkType>
    cameraPosition(pos: { x?: number; y?: number; z?: number }): ForceGraphInstance<NodeType, LinkType>
    onNodeClick(callback: (node: NodeType) => void): ForceGraphInstance<NodeType, LinkType>
    _destructor?: () => void
  }

  const ForceGraph3D: IForceGraph3D
  export default ForceGraph3D
}
