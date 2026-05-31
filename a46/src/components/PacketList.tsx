import React, { useRef, useEffect } from "react";
import { PacketInfo } from "../types";

interface PacketListProps {
  packets: PacketInfo[];
  selectedPacket: PacketInfo | null;
  onSelectPacket: (packet: PacketInfo) => void;
}

export const PacketList: React.FC<PacketListProps> = ({
  packets,
  selectedPacket,
  onSelectPacket,
}) => {
  const tableRef = useRef<HTMLTableElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [packets]);

  const getProtocolClass = (protocol: string) => {
    const p = protocol.toUpperCase();
    if (p.includes("HTTP")) return "proto-http";
    if (p.includes("DNS")) return "proto-dns";
    if (p.includes("TCP")) return "proto-tcp";
    if (p.includes("UDP")) return "proto-udp";
    if (p.includes("ICMP")) return "proto-icmp";
    if (p.includes("ARP")) return "proto-arp";
    if (p.includes("IP")) return "proto-ip";
    return "proto-eth";
  };

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      autoScrollRef.current = scrollTop + clientHeight >= scrollHeight - 100;
    }
  };

  return (
    <div className="packet-list-container">
      <div className="section-header">
        包列表 ({packets.length} 个包)
      </div>
      <div
        ref={scrollRef}
        style={{ overflowY: "auto", height: "calc(40vh - 70px)" }}
        onScroll={handleScroll}
      >
        <table className="packet-table" ref={tableRef}>
          <thead>
            <tr>
              <th className="col-no">序号</th>
              <th className="col-time">时间</th>
              <th className="col-src">源地址</th>
              <th className="col-dst">目的地址</th>
              <th className="col-proto">协议</th>
              <th className="col-length">长度</th>
              <th className="col-info">信息</th>
            </tr>
          </thead>
          <tbody>
            {packets.map((packet) => (
              <tr
                key={packet.number}
                className={selectedPacket?.number === packet.number ? "selected" : ""}
                onClick={() => onSelectPacket(packet)}
              >
                <td className="col-no">{packet.number}</td>
                <td className="col-time">{packet.timestamp_str}</td>
                <td className="col-src">
                  {packet.src_port
                    ? `${packet.src_address}:${packet.src_port}`
                    : packet.src_address}
                </td>
                <td className="col-dst">
                  {packet.dst_port
                    ? `${packet.dst_address}:${packet.dst_port}`
                    : packet.dst_address}
                </td>
                <td className={`col-proto ${getProtocolClass(packet.protocol)}`}>
                  {packet.protocol}
                </td>
                <td className="col-length">{packet.length}</td>
                <td className="col-info" title={packet.info}>
                  {packet.info}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
