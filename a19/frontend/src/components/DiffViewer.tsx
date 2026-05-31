import { useState, useCallback, useMemo, memo } from 'react';
import { DiffFile, DiffChange } from '@/types';
import { ChevronRight, ChevronDown, File, Plus, Minus, MessageSquare, AlertCircle } from 'lucide-react';
import { cn } from '@/utils/cn';

interface DiffViewerProps {
  diff: DiffFile[];
  onLineClick?: (filePath: string, lineNumber: number) => void;
  selectedLines?: Map<string, Set<number>>;
  showLineNumbers?: boolean;
}

interface LineDiffProps {
  change: DiffChange;
  file: string;
  showLineNumbers?: boolean;
  onLineClick?: (filePath: string, lineNumber: number) => void;
  isHovered: boolean;
  onHover: (lineNumber: number | null) => void;
}

const LineDiff = memo(function LineDiff({ 
  change, 
  file, 
  showLineNumbers = true, 
  onLineClick,
  isHovered,
  onHover
}: LineDiffProps) {
  const lineNumber = useMemo(() => {
    if (change.operation === 'add' && change.newLine !== undefined) {
      return change.newLine;
    }
    if (change.operation === 'remove' && change.oldLine !== undefined) {
      return change.oldLine;
    }
    if (change.operation === 'modify') {
      return change.newLine ?? change.oldLine;
    }
    return -1;
  }, [change]);

  const handleClick = useCallback(() => {
    if (lineNumber > 0 && onLineClick) {
      onLineClick(file, lineNumber);
    }
  }, [file, lineNumber, onLineClick]);

  const getLineClass = (operation: DiffChange['operation']) => {
    switch (operation) {
      case 'add':
        return 'bg-green-50';
      case 'remove':
        return 'bg-red-50';
      default:
        return '';
    }
  };

  const getLineIcon = (operation: DiffChange['operation']) => {
    switch (operation) {
      case 'add':
        return <Plus className="w-4 h-4 text-green-600 flex-shrink-0" />;
      case 'remove':
        return <Minus className="w-4 h-4 text-red-600 flex-shrink-0" />;
      default:
        return <span className="w-4 flex-shrink-0" />;
    }
  };

  const getNumberClass = (operation: DiffChange['operation']) => {
    switch (operation) {
      case 'add':
        return 'text-green-600';
      case 'remove':
        return 'text-red-600';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <tr
      className={cn(
        getLineClass(change.operation),
        isHovered && 'bg-gray-100'
      )}
      onMouseEnter={() => onHover(lineNumber)}
      onMouseLeave={() => onHover(null)}
    >
      {showLineNumbers && (
        <td className="px-2 py-0.5 text-right select-none border-r border-gray-200 bg-gray-50 w-12 min-w-12">
          <span className={cn('text-xs', getNumberClass(change.operation))}>
            {change.operation !== 'add' ? change.oldLine : ''}
          </span>
        </td>
      )}
      {showLineNumbers && (
        <td className="px-2 py-0.5 text-right select-none border-r border-gray-200 bg-gray-50 w-12 min-w-12">
          <span className={cn('text-xs', getNumberClass(change.operation))}>
            {change.operation !== 'remove' ? change.newLine : ''}
          </span>
        </td>
      )}
      <td className="w-8 px-1 py-0.5 text-center flex-shrink-0">
        {getLineIcon(change.operation)}
      </td>
      <td className="px-2 py-0.5 whitespace-pre text-sm">
        {change.content || ' '}
      </td>
      <td
        className="w-8 px-1 py-0.5 text-center cursor-pointer flex-shrink-0"
        onClick={handleClick}
      >
        {isHovered && lineNumber > 0 && (
          <MessageSquare className="w-4 h-4 text-gray-400 hover:text-primary-500" />
        )}
      </td>
    </tr>
  );
});

interface FileDiffProps {
  file: DiffFile;
  index: number;
  onLineClick?: (filePath: string, lineNumber: number) => void;
  initiallyExpanded?: boolean;
  showLineNumbers?: boolean;
}

function FileDiff({ file, index, onLineClick, initiallyExpanded = false, showLineNumbers = true }: FileDiffProps) {
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);

  const stats = useMemo(() => ({
    additions: file.changes.filter(c => c.operation === 'add').length,
    deletions: file.changes.filter(c => c.operation === 'remove').length,
    modifications: file.changes.filter(c => c.operation === 'modify').length,
    total: file.changes.length
  }), [file.changes]);

  const handleLineHover = useCallback((lineNumber: number | null) => {
    setHoveredLine(lineNumber);
  }, []);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center space-x-2 min-w-0">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
          )}
          <File className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <span className="text-sm font-medium text-gray-900 truncate">{file.file}</span>
        </div>
        <div className="flex items-center space-x-3 flex-shrink-0">
          {stats.total > 0 && (
            <span className="text-xs text-gray-500">
              {stats.total} lines
            </span>
          )}
          {stats.additions > 0 && (
            <span className="text-xs text-green-600 font-medium">
              +{stats.additions}
            </span>
          )}
          {stats.deletions > 0 && (
            <span className="text-xs text-red-600 font-medium">
              -{stats.deletions}
            </span>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="overflow-x-auto">
          {stats.total > 0 ? (
            <table className="w-full text-sm font-mono table-fixed">
              <colgroup>
                {showLineNumbers && <col style={{ width: '48px' }} />}
                {showLineNumbers && <col style={{ width: '48px' }} />}
                <col style={{ width: '32px' }} />
                <col style={{ width: 'auto' }} />
                <col style={{ width: '32px' }} />
              </colgroup>
              <tbody>
                {file.changes.map((change, changeIndex) => {
                  const lineKey = `${change.operation}-${change.oldLine || 0}-${change.newLine || 0}-${changeIndex}`;
                  const lineNumber = change.newLine ?? change.oldLine;
                  
                  return (
                    <LineDiff
                      key={lineKey}
                      change={change}
                      file={file.file}
                      showLineNumbers={showLineNumbers}
                      onLineClick={onLineClick}
                      isHovered={lineNumber === hoveredLine}
                      onHover={handleLineHover}
                    />
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-4 text-center text-gray-500">
              <AlertCircle className="w-5 h-5 mx-auto mb-1" />
              <p className="text-sm">No changes to display</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DiffViewer({ diff, onLineClick, selectedLines, showLineNumbers }: DiffViewerProps) {
  const handleLineClick = useCallback((filePath: string, lineNumber: number) => {
    onLineClick?.(filePath, lineNumber);
  }, [onLineClick]);

  if (!diff || diff.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500">
        <div className="text-center">
          <File className="w-12 h-12 mx-auto mb-2 text-gray-300" />
          <p>No changes to display</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {diff.map((file, index) => (
        <FileDiff
          key={`${file.file}-${index}`}
          file={file}
          index={index}
          onLineClick={handleLineClick}
          initiallyExpanded={index < 3}
          showLineNumbers={showLineNumbers}
        />
      ))}
    </div>
  );
}
