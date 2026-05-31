import * as Y from 'yjs'
import { RelativePositionData, createCommentAnchors, resolvePositions } from './anchorPositions'

export interface CommentSelection {
  commentId: string
  anchorFrom: RelativePositionData
  anchorTo: RelativePositionData
  from: number | null
  to: number | null
  text: string
  isResolved: boolean
}

export class CommentSelectionManager {
  private ydoc: Y.Doc
  private typeName: string
  private selections: Map<string, CommentSelection> = new Map()
  private observer: (() => void) | null = null

  constructor(ydoc: Y.Doc, typeName: string = 'prosemirror') {
    this.ydoc = ydoc
    this.typeName = typeName
    this.setupObserver()
  }

  private setupObserver(): void {
    this.observer = () => {
      this.refreshAll()
    }
    this.ydoc.on('update', this.observer)
  }

  addSelection(
    commentId: string,
    from: number,
    to: number,
    originalText: string
  ): CommentSelection {
    const anchors = createCommentAnchors(this.ydoc, from, to, this.typeName)
    
    if (!anchors) {
      const selection: CommentSelection = {
        commentId,
        anchorFrom: { type: '', tname: null, item: null, assoc: 0 },
        anchorTo: { type: '', tname: null, item: null, assoc: 0 },
        from: null,
        to: null,
        text: originalText,
        isResolved: false
      }
      this.selections.set(commentId, selection)
      return selection
    }

    const resolved = resolvePositions(this.ydoc, anchors.anchorFrom, anchors.anchorTo, this.typeName)
    
    const selection: CommentSelection = {
      commentId,
      anchorFrom: anchors.anchorFrom,
      anchorTo: anchors.anchorTo,
      from: resolved.from,
      to: resolved.to,
      text: originalText,
      isResolved: resolved.isResolved
    }

    this.selections.set(commentId, selection)
    return selection
  }

  addSelectionFromEncoded(
    commentId: string,
    anchorFromEncoded: string,
    anchorToEncoded: string,
    originalText: string
  ): CommentSelection {
    const anchorFrom: RelativePositionData = {
      type: anchorFromEncoded,
      tname: null,
      item: null,
      assoc: 0
    }
    
    const anchorTo: RelativePositionData = {
      type: anchorToEncoded,
      tname: null,
      item: null,
      assoc: 0
    }

    const resolved = resolvePositions(this.ydoc, anchorFrom, anchorTo, this.typeName)
    
    const selection: CommentSelection = {
      commentId,
      anchorFrom,
      anchorTo,
      from: resolved.from,
      to: resolved.to,
      text: originalText,
      isResolved: resolved.isResolved
    }

    this.selections.set(commentId, selection)
    return selection
  }

  getSelection(commentId: string): CommentSelection | undefined {
    return this.selections.get(commentId)
  }

  removeSelection(commentId: string): void {
    this.selections.delete(commentId)
  }

  refreshAll(): void {
    for (const [commentId, selection] of this.selections) {
      const resolved = resolvePositions(this.ydoc, selection.anchorFrom, selection.anchorTo, this.typeName)
      
      const newFrom = resolved.from
      const newTo = resolved.to
      
      const newText = this.getTextBetweenPositions(newFrom, newTo)
      
      const updatedSelection: CommentSelection = {
        ...selection,
        from: newFrom,
        to: newTo,
        text: newText || selection.text,
        isResolved: resolved.isResolved
      }

      this.selections.set(commentId, updatedSelection)
    }
  }

  private getTextBetweenPositions(from: number | null, to: number | null): string {
    if (from === null || to === null) return ''
    
    try {
      const ytype = this.ydoc.getXmlFragment(this.typeName)
      
      let text = ''
      const walk = (node: any): void => {
        if (node.nodeName === '#text') {
          text += node.toString()
        } else if (node.childNodes) {
          for (const child of node.childNodes) {
            walk(child)
          }
        }
      }
      
      walk(ytype)
      
      const start = Math.min(from, to)
      const end = Math.max(from, to)
      
      return text.substring(start, end)
    } catch (e) {
      return ''
    }
  }

  getActiveSelections(): CommentSelection[] {
    return Array.from(this.selections.values()).filter(s => s.isResolved)
  }

  getUnresolvedSelections(): CommentSelection[] {
    return Array.from(this.selections.values()).filter(s => !s.isResolved)
  }

  getAllSelections(): CommentSelection[] {
    return Array.from(this.selections.values())
  }

  findSelectionAtPosition(pos: number): CommentSelection | null {
    for (const selection of this.getActiveSelections()) {
      if (selection.from === null || selection.to === null) continue
      
      const start = Math.min(selection.from, selection.to)
      const end = Math.max(selection.from, selection.to)
      
      if (pos >= start && pos <= end) {
        return selection
      }
    }
    return null
  }

  dispose(): void {
    if (this.observer) {
      this.ydoc.off('update', this.observer)
    }
    this.selections.clear()
  }
}
