import React from "react";
import ReactECharts from "echarts-for-react";
import { ProtocolStats, TrafficStats, TopTalker } from "../types";

interface ChartsProps {
  protocolStats: ProtocolStats[];
  trafficStats: TrafficStats[];
  topTalkers: TopTalker[];
}

export const Charts: React.FC<ChartsProps> = ({
  protocolStats,
  trafficStats,
  topTalkers,
}) => {
  const pieOption = {
    backgroundColor: "#1e1e1e",
    tooltip: {
      trigger: "item",
      formatter: "{b}: {c} ({d}%)",
      backgroundColor: "#2d2d30",
      borderColor: "#3e3e42",
      textStyle: { color: "#d4d4d4" },
    },
    legend: {
      top: "5%",
      textStyle: { color: "#d4d4d4", fontSize: 11 },
    },
    series: [
      {
        name: "协议分布",
        type: "pie",
        radius: ["30%", "60%"],
        center: ["50%", "55%"],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 4,
          borderColor: "#1e1e1e",
          borderWidth: 2,
        },
        label: {
          show: false,
          position: "center",
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: "bold",
            color: "#d4d4d4",
          },
        },
        labelLine: {
          show: false,
        },
        data: protocolStats.map((s, idx) => ({
          value: s.count,
          name: s.protocol,
          itemStyle: {
            color: getProtocolColor(s.protocol, idx),
          },
        })),
      },
    ],
  };

  const lineOption = {
    backgroundColor: "#1e1e1e",
    tooltip: {
      trigger: "axis",
      backgroundColor: "#2d2d30",
      borderColor: "#3e3e42",
      textStyle: { color: "#d4d4d4" },
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "3%",
      top: "15%",
      containLabel: true,
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: trafficStats.map((s) => {
        const d = new Date(s.timestamp);
        return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
      }),
      axisLine: { lineStyle: { color: "#505054" } },
      axisLabel: { color: "#808080", fontSize: 10 },
    },
    yAxis: {
      type: "value",
      name: "Bytes",
      axisLine: { lineStyle: { color: "#505054" } },
      axisLabel: { color: "#808080", fontSize: 10 },
      splitLine: { lineStyle: { color: "#3e3e42" } },
    },
    series: [
      {
        name: "流量",
        type: "line",
        smooth: true,
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(86, 156, 214, 0.4)" },
              { offset: 1, color: "rgba(86, 156, 214, 0.05)" },
            ],
          },
        },
        lineStyle: { color: "#569cd6", width: 2 },
        itemStyle: { color: "#569cd6" },
        data: trafficStats.map((s) => s.bytes),
      },
    ],
  };

  const barOption = {
    backgroundColor: "#1e1e1e",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: "#2d2d30",
      borderColor: "#3e3e42",
      textStyle: { color: "#d4d4d4" },
    },
    grid: {
      left: "3%",
      right: "4%",
      bottom: "3%",
      top: "15%",
      containLabel: true,
    },
    xAxis: {
      type: "value",
      axisLine: { lineStyle: { color: "#505054" } },
      axisLabel: { color: "#808080", fontSize: 10 },
      splitLine: { lineStyle: { color: "#3e3e42" } },
    },
    yAxis: {
      type: "category",
      data: topTalkers.slice(0, 10).map((t) => t.address).reverse(),
      axisLine: { lineStyle: { color: "#505054" } },
      axisLabel: { color: "#d4d4d4", fontSize: 10 },
    },
    series: [
      {
        name: "数据包数",
        type: "bar",
        itemStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 1,
            y2: 0,
            colorStops: [
              { offset: 0, color: "#4ec9b0" },
              { offset: 1, color: "#2e7d32" },
            ],
          },
        },
        data: topTalkers.slice(0, 10).map((t) => t.packets).reverse(),
      },
    ],
  };

  return (
    <div className="stats-panel">
      <div className="chart-container">
        <div className="section-header">流量时序图</div>
        <ReactECharts option={lineOption} style={{ height: "calc(100% - 30px)" }} />
      </div>
      <div className="chart-container">
        <div className="section-header">协议分布</div>
        <ReactECharts option={pieOption} style={{ height: "calc(100% - 30px)" }} />
      </div>
      <div className="chart-container">
        <div className="section-header">Top Talkers (按包数)</div>
        <ReactECharts option={barOption} style={{ height: "calc(100% - 30px)" }} />
      </div>
    </div>
  );
};

const getProtocolColor = (protocol: string, index: number): string => {
  const colors = [
    "#569cd6",
    "#4ec9b0",
    "#ce9178",
    "#dcdcaa",
    "#c586c0",
    "#f79646",
    "#4fc1ff",
    "#b5cea8",
    "#d7ba7d",
    "#c586c0",
  ];
  const p = protocol.toUpperCase();
  if (p.includes("HTTP")) return "#569cd6";
  if (p.includes("DNS")) return "#4fc1ff";
  if (p.includes("TCP")) return "#dcdcaa";
  if (p.includes("UDP")) return "#c586c0";
  if (p.includes("ICMP")) return "#f79646";
  if (p.includes("ARP")) return "#ce9178";
  if (p.includes("IP")) return "#9cdcfe";
  return colors[index % colors.length];
};
