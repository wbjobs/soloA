import React, { useState } from "react";
import { ProtocolTreeNode } from "../types";

interface TreeNodeProps {
  node: ProtocolTreeNode;
  depth: number;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, depth }) => {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const hasFields = node.fields && node.fields.length > 0;

  return (
    <div>
      <div
        className="tree-item"
        style={{ paddingLeft: `${depth * 8}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren ? (
          <span className="tree-expand-icon">{expanded ? "▼" : "▶"}</span>
        ) : (
          <span className="tree-expand-icon">●</span>
        )}
        <span className="tree-header">{node.description}</span>
      </div>

      {expanded && hasFields && (
        <div style={{ paddingLeft: `${(depth + 1) * 16}px` }}>
          {node.fields?.map((field, idx) => (
            <div key={idx} className="tree-item tree-field">
              <span className="tree-field-name">{field.name}:</span>
              <span className="tree-field-value">{field.value}</span>
              {field.raw_value && (
                <span className="tree-field-raw">({field.raw_value})</span>
              )}
              {field.description && (
                <span style={{ color: "#808080" }}> - {field.description}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {expanded && hasChildren && (
        <div>
          {node.children?.map((child, idx) => (
            <TreeNode key={idx} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

interface ProtocolTreeProps {
  tree: ProtocolTreeNode | null;
}

export const ProtocolTree: React.FC<ProtocolTreeProps> = ({ tree }) => {
  return (
    <div className="protocol-tree-container">
      <div className="section-header">协议解析树</div>
      <div className="protocol-tree">
        {tree ? (
          <TreeNode node={tree} depth={0} />
        ) : (
          <div style={{ padding: "20px", color: "#808080" }}>
            选择一个包查看协议解析树
          </div>
        )}
      </div>
    </div>
  );
};
