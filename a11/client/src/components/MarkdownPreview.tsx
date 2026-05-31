import React, { useEffect, useRef } from 'react';
import { marked } from 'marked';

interface MarkdownPreviewProps {
  content: string;
}

marked.setOptions({
  gfm: true,
  breaks: true,
});

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (previewRef.current) {
      previewRef.current.innerHTML = marked.parse(content) as string;
    }
  }, [content]);

  return (
    <div className="h-full overflow-auto p-6 bg-white">
      <div
        ref={previewRef}
        className="prose prose-slate max-w-none
          prose-headings:text-slate-800 prose-headings:font-bold
          prose-h1:text-3xl prose-h1:border-b prose-h1:border-slate-200 prose-h1:pb-2
          prose-h2:text-2xl
          prose-h3:text-xl
          prose-p:text-slate-700 prose-p:leading-relaxed
          prose-a:text-primary-600 prose-a:no-underline hover:prose-a:underline
          prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
          prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-pre:rounded-lg prose-pre:p-4
          prose-blockquote:border-l-primary-500 prose-blockquote:bg-slate-50 prose-blockquote:py-2 prose-blockquote:pr-4
          prose-table:w-full prose-table:border-collapse
          prose-th:bg-slate-100 prose-th:border prose-th:border-slate-300 prose-th:px-4 prose-th:py-2
          prose-td:border prose-td:border-slate-300 prose-td:px-4 prose-td:py-2
          prose-li:marker:text-primary-500
          prose-hr:border-slate-300
          prose-img:rounded-lg prose-img:shadow-sm"
      />
    </div>
  );
}

export default MarkdownPreview;
