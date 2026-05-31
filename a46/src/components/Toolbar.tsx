import React from "react";
import { NetworkInterface } from "../types";

interface ToolbarProps {
  interfaces: NetworkInterface[];
  selectedInterface: NetworkInterface | null;
  isCapturing: boolean;
  promiscuous: boolean;
  bpfFilter: string;
  onSelectInterface: (iface: NetworkInterface) => void;
  onStartCapture: () => void;
  onStopCapture: () => void;
  onTogglePromiscuous: () => void;
  onBpfFilterChange: (filter: string) => void;
  onShowInterfaceSelector: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  interfaces,
  selectedInterface,
  isCapturing,
  promiscuous,
  bpfFilter,
  onSelectInterface,
  onStartCapture,
  onStopCapture,
  onTogglePromiscuous,
  onBpfFilterChange,
  onShowInterfaceSelector,
}) => {
  return (
    <div className="toolbar">
      <button
        className={isCapturing ? "btn-stop" : "btn-start"}
        onClick={isCapturing ? onStopCapture : onStartCapture}
        disabled={!selectedInterface && !isCapturing}
      >
        {isCapturing ? "停止" : "开始"}
      </button>

      <select
        value={selectedInterface?.name || ""}
        onChange={(e) => {
          const iface = interfaces.find((i) => i.name === e.target.value);
          if (iface) onSelectInterface(iface);
        }}
        disabled={isCapturing}
      >
        {interfaces.length === 0 ? (
          <option value="">未检测到网卡</option>
        ) : (
          interfaces.map((iface) => (
            <option key={iface.name} value={iface.name}>
              {iface.description || iface.name}
            </option>
          ))
        )}
      </select>

      <button
        className="btn-default"
        onClick={onShowInterfaceSelector}
        disabled={isCapturing}
      >
        选择网卡...
      </button>

      <label>
        <input
          type="checkbox"
          checked={promiscuous}
          onChange={onTogglePromiscuous}
          disabled={isCapturing}
        />
        混杂模式
      </label>

      <input
        type="text"
        className="bpf-filter"
        placeholder="BPF 过滤表达式 (如: tcp port 80 and host 192.168.1.1)"
        value={bpfFilter}
        onChange={(e) => onBpfFilterChange(e.target.value)}
        disabled={isCapturing}
      />

      <span style={{ fontSize: "11px", color: "#808080" }}>
        提示: 先点击"开始"前设置 BPF 过滤器
      </span>
    </div>
  );
};
