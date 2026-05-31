import React from "react";

interface HexDumpProps {
  bytes: number[] | null;
}

export const HexDump: React.FC<HexDumpProps> = ({ bytes }) => {
  const formatHexLine = (offset: number, slice: number[]): JSX.Element => {
    const hexParts: string[] = [];
    const asciiParts: string[] = [];

    for (let i = 0; i < 16; i++) {
      if (i < slice.length) {
        const byte = slice[i];
        hexParts.push(byte.toString(16).padStart(2, "0"));
        if (byte >= 32 && byte <= 126) {
          asciiParts.push(String.fromCharCode(byte));
        } else {
          asciiParts.push(".");
        }
      } else {
        hexParts.push("  ");
        asciiParts.push(" ");
      }
    }

    return (
      <div key={offset} className="hex-row">
        <span className="hex-offset">
          {offset.toString(16).padStart(8, "0")}
        </span>
        <span className="hex-bytes">
          {hexParts.slice(0, 8).join(" ")}  {hexParts.slice(8).join(" ")}
        </span>
        <span className="hex-ascii">{asciiParts.join("")}</span>
      </div>
    );
  };

  const renderLines = (): JSX.Element[] => {
    if (!bytes || bytes.length === 0) return [];

    const lines: JSX.Element[] = [];
    for (let offset = 0; offset < bytes.length; offset += 16) {
      const slice = bytes.slice(offset, offset + 16);
      lines.push(formatHexLine(offset, slice));
    }
    return lines;
  };

  return (
    <div className="hex-dump-container">
      <div className="section-header">十六进制数据</div>
      <div style={{ padding: "8px 0" }}>
        {bytes && bytes.length > 0 ? (
          renderLines()
        ) : (
          <div style={{ padding: "20px", color: "#808080" }}>
            选择一个包查看原始数据
          </div>
        )}
      </div>
    </div>
  );
};
