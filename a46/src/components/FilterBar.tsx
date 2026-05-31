import React from "react";
import { FilterConfig } from "../types";

interface FilterBarProps {
  filterConfig: FilterConfig;
  onFilterChange: (config: FilterConfig) => void;
  onApplyFilter: () => void;
  onClearFilter: () => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filterConfig,
  onFilterChange,
  onApplyFilter,
  onClearFilter,
}) => {
  const protocols = ["", "ETH", "ARP", "IP", "IPv6", "TCP", "UDP", "HTTP", "DNS", "ICMP"];

  return (
    <div className="filter-bar">
      <select
        value={filterConfig.protocol || ""}
        onChange={(e) =>
          onFilterChange({ ...filterConfig, protocol: e.target.value || undefined })
        }
      >
        {protocols.map((p) => (
          <option key={p || "all"} value={p}>
            {p || "所有协议"}
          </option>
        ))}
      </select>

      <input
        type="text"
        placeholder="源 IP"
        value={filterConfig.src_ip || ""}
        onChange={(e) =>
          onFilterChange({ ...filterConfig, src_ip: e.target.value || undefined })
        }
        style={{ width: "130px" }}
      />

      <input
        type="text"
        placeholder="目的 IP"
        value={filterConfig.dst_ip || ""}
        onChange={(e) =>
          onFilterChange({ ...filterConfig, dst_ip: e.target.value || undefined })
        }
        style={{ width: "130px" }}
      />

      <input
        type="number"
        placeholder="源端口"
        value={filterConfig.src_port || ""}
        onChange={(e) =>
          onFilterChange({
            ...filterConfig,
            src_port: e.target.value ? parseInt(e.target.value) : undefined,
          })
        }
        style={{ width: "90px" }}
      />

      <input
        type="number"
        placeholder="目的端口"
        value={filterConfig.dst_port || ""}
        onChange={(e) =>
          onFilterChange({
            ...filterConfig,
            dst_port: e.target.value ? parseInt(e.target.value) : undefined,
          })
        }
        style={{ width: "90px" }}
      />

      <input
        type="text"
        placeholder="搜索信息..."
        value={filterConfig.search_text || ""}
        onChange={(e) =>
          onFilterChange({
            ...filterConfig,
            search_text: e.target.value || undefined,
          })
        }
        style={{ width: "200px" }}
      />

      <button className="btn-default" onClick={onApplyFilter}>
        应用
      </button>

      <button className="btn-default" onClick={onClearFilter}>
        清除
      </button>
    </div>
  );
};
