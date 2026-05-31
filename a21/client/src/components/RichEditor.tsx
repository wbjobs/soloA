import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Heading from '@tiptap/extension-heading'
import Blockquote from '@tiptap/extension-blockquote'
import BulletList from '@tiptap/extension-bullet-list'
import OrderedList from '@tiptap/extension-ordered-list'
import ListItem from '@tiptap/extension-list-item'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Placeholder from '@tiptap/extension-placeholder'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import { common, createLowlight } from 'lowlight'
import * as Y from 'yjs'
import { RemoteCursor } from '../types'

const lowlight = createLowlight(common)

interface RichEditorProps {
  ydoc: Y.Doc | null
  userId: string
  userName: string
  userColor: string
  editable: boolean
  onSelectionChange?: (selection: { from: number; to: number; text: string }) => void
  onSelectionUpdate?: (selection: { anchor: number; head: number }) => void
  remoteCursors?: Map<string, RemoteCursor>
}

export default function RichEditor({
  ydoc,
  userId,
  userName,
  userColor,
  editable,
  onSelectionChange,
  onSelectionUpdate,
  remoteCursors = new Map()
}: RichEditorProps) {
  const ydocRef = useRef<Y.Doc | null>(null)
  const [isEditorReady, setIsEditorReady] = useState(false)

  const extensions = ydoc ? [
    StarterKit.configure({
      heading: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      blockquote: false,
      codeBlock: false,
      history: false
    }),
    Heading.configure({
      levels: [1, 2, 3]
    }),
    Blockquote,
    BulletList,
    OrderedList,
    ListItem,
    CodeBlockLowlight.configure({
      lowlight
    }),
    Underline,
    Placeholder.configure({
      placeholder: '开始编辑文档...'
    }),
    Collaboration.configure({
      document: ydoc
    }),
    CollaborationCursor.configure({
      provider: null as any,
      user: {
        name: userName,
        color: userColor
      }
    })
  ] : []

  const editor = useEditor({
    extensions,
    content: '',
    editable,
    onSelectionUpdate: ({ editor }) => {
      if (!editable) return
      
      const { from, to } = editor.state.selection
      const text = editor.state.doc.textBetween(from, to)
      
      onSelectionUpdate?.({
        anchor: from,
        head: to
      })

      if (from !== to) {
        onSelectionChange?.({ from, to, text })
      }
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl focus:outline-none'
      }
    }
  }, [ydoc, editable, userId, userName, userColor])

  useEffect(() => {
    if (ydoc && !ydocRef.current) {
      ydocRef.current = ydoc
    }
  }, [ydoc])

  useEffect(() => {
    if (editor && ydoc) {
      setIsEditorReady(true)
    }
  }, [editor, ydoc])

  const toggleBold = useCallback(() => {
    editor?.chain().focus().toggleBold().run()
  }, [editor])

  const toggleItalic = useCallback(() => {
    editor?.chain().focus().toggleItalic().run()
  }, [editor])

  const toggleUnderline = useCallback(() => {
    editor?.chain().focus().toggleUnderline().run()
  }, [editor])

  const toggleHeading = useCallback((level: 1 | 2 | 3) => {
    editor?.chain().focus().toggleHeading({ level }).run()
  }, [editor])

  const toggleBulletList = useCallback(() => {
    editor?.chain().focus().toggleBulletList().run()
  }, [editor])

  const toggleOrderedList = useCallback(() => {
    editor?.chain().focus().toggleOrderedList().run()
  }, [editor])

  const toggleBlockquote = useCallback(() => {
    editor?.chain().focus().toggleBlockquote().run()
  }, [editor])

  const toggleCodeBlock = useCallback(() => {
    editor?.chain().focus().toggleCodeBlock().run()
  }, [editor])

  useEffect(() => {
    if (editor) {
      editor.setEditable(editable)
    }
  }, [editor, editable])

  if (!ydoc) {
    return (
      <div className='flex items-center justify-center h-64'>
        <div className='text-gray-500'>加载文档中...</div>
      </div>
    )
  }

  return (
    <div className='bg-white rounded-lg shadow'>
      {editable && (
        <div className='flex flex-wrap gap-1 p-2 border-b border-gray-200 bg-gray-50 rounded-t-lg'>
          <button
            onClick={toggleBold}
            className={`px-2 py-1 rounded font-bold ${
              editor?.isActive('bold') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
            }`}
            title='加粗'
          >
            B
          </button>
          <button
            onClick={toggleItalic}
            className={`px-2 py-1 rounded italic ${
              editor?.isActive('italic') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
            }`}
            title='斜体'
          >
            I
          </button>
          <button
            onClick={toggleUnderline}
            className={`px-2 py-1 rounded underline ${
              editor?.isActive('underline') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
            }`}
            title='下划线'
          >
            U
          </button>

          <div className='w-px h-6 bg-gray-300 mx-1 self-center' />

          <button
            onClick={() => toggleHeading(1)}
            className={`px-2 py-1 rounded text-lg font-bold ${
              editor?.isActive('heading', { level: 1 }) ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
            }`}
            title='标题1'
          >
            H1
          </button>
          <button
            onClick={() => toggleHeading(2)}
            className={`px-2 py-1 rounded text-base font-bold ${
              editor?.isActive('heading', { level: 2 }) ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
            }`}
            title='标题2'
          >
            H2
          </button>
          <button
            onClick={() => toggleHeading(3)}
            className={`px-2 py-1 rounded text-sm font-bold ${
              editor?.isActive('heading', { level: 3 }) ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
            }`}
            title='标题3'
          >
            H3
          </button>

          <div className='w-px h-6 bg-gray-300 mx-1 self-center' />

          <button
            onClick={toggleBulletList}
            className={`px-2 py-1 rounded ${
              editor?.isActive('bulletList') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
            }`}
            title='无序列表'
          >
            • 列表
          </button>
          <button
            onClick={toggleOrderedList}
            className={`px-2 py-1 rounded ${
              editor?.isActive('orderedList') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
            }`}
            title='有序列表'
          >
            1. 列表
          </button>

          <div className='w-px h-6 bg-gray-300 mx-1 self-center' />

          <button
            onClick={toggleBlockquote}
            className={`px-2 py-1 rounded ${
              editor?.isActive('blockquote') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
            }`}
            title='引用'
          >
            " 引用
          </button>
          <button
            onClick={toggleCodeBlock}
            className={`px-2 py-1 rounded font-mono text-sm ${
              editor?.isActive('codeBlock') ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-200'
            }`}
            title='代码块'
          >
            {'</>'}
          </button>
        </div>
      )}

      <div className='p-6 min-h-[400px]'>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
