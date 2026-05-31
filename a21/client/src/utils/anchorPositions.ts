import * as Y from 'yjs'

export interface RelativePositionData {
  type: string
  tname: string | null
  item: string | null
  assoc: number
}

export function positionToRelative(
  ydoc: Y.Doc,
  absolutePos: number,
  typeName: string = 'prosemirror'
): RelativePositionData | null {
  try {
    const ytype = ydoc.getXmlFragment(typeName)
    const relPos = Y.createRelativePositionFromTypeIndex(ytype, absolutePos)
    
    return {
      type: relPos.type ? Y.encodeRelativePosition(relPos) : '',
      tname: relPos.tname || null,
      item: relPos.item?.id ? `${relPos.item.id.client}:${relPos.item.id.clock}` : null,
      assoc: relPos.assoc
    }
  } catch (e) {
    console.error('创建相对位置失败:', e)
    return null
  }
}

export function relativeToAbsolute(
  ydoc: Y.Doc,
  relData: RelativePositionData,
  typeName: string = 'prosemirror'
): number | null {
  try {
    const relPos = Y.decodeRelativePosition(relData.type)
    const absPos = Y.createAbsolutePositionFromRelativePosition(relPos, ydoc)
    return absPos ? absPos.pos : null
  } catch (e) {
    console.error('解析相对位置失败:', e)
    return null
  }
}

export function encodeRelativePosition(relPos: any): string {
  try {
    return Y.encodeRelativePosition(relPos)
  } catch (e) {
    return ''
  }
}

export function decodeRelativePosition(encoded: string): any {
  try {
    return Y.decodeRelativePosition(encoded)
  } catch (e) {
    return null
  }
}

export function resolvePositions(
  ydoc: Y.Doc,
  anchorFrom: RelativePositionData,
  anchorTo: RelativePositionData,
  typeName: string = 'prosemirror'
): { from: number | null; to: number | null; isResolved: boolean } {
  const from = relativeToAbsolute(ydoc, anchorFrom, typeName)
  const to = relativeToAbsolute(ydoc, anchorTo, typeName)
  
  return {
    from,
    to,
    isResolved: from !== null && to !== null && from !== to
  }
}

export function createCommentAnchors(
  ydoc: Y.Doc,
  from: number,
  to: number,
  typeName: string = 'prosemirror'
): { anchorFrom: RelativePositionData; anchorTo: RelativePositionData } | null {
  const anchorFrom = positionToRelative(ydoc, from, typeName)
  const anchorTo = positionToRelative(ydoc, to, typeName)
  
  if (!anchorFrom || !anchorTo) {
    return null
  }
  
  return { anchorFrom, anchorTo }
}

export interface CommentAnchorStore {
  storeAnchors: (commentId: string, from: number, to: number) => boolean
  getAnchors: (commentId: string) => { from: number | null; to: number | null } | null
  removeAnchors: (commentId: string) => void
  refreshAll: () => void
}

export function createCommentAnchorStore(ydoc: Y.Doc, typeName: string = 'prosemirror'): CommentAnchorStore {
  const anchorMap = new Map<string, { anchorFrom: RelativePositionData; anchorTo: RelativePositionData }>()

  return {
    storeAnchors: (commentId: string, from: number, to: number): boolean => {
      const anchors = createCommentAnchors(ydoc, from, to, typeName)
      if (!anchors) return false
      
      anchorMap.set(commentId, anchors)
      return true
    },
    
    getAnchors: (commentId: string) => {
      const anchors = anchorMap.get(commentId)
      if (!anchors) return null
      
      return resolvePositions(ydoc, anchors.anchorFrom, anchors.anchorTo, typeName)
    },
    
    removeAnchors: (commentId: string) => {
      anchorMap.delete(commentId)
    },
    
    refreshAll: () => {
      for (const [commentId, anchors] of anchorMap) {
        const resolved = resolvePositions(ydoc, anchors.anchorFrom, anchors.anchorTo, typeName)
        if (!resolved.isResolved) {
          console.warn(`评论 ${commentId} 的位置无法解析`)
        }
      }
    }
  }
}
