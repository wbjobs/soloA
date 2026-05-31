import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { SupplierNode, RiskHeatmapNode } from '../types';

interface SupplierMapProps {
  suppliers: SupplierNode[];
  riskHeatmap?: RiskHeatmapNode[];
  failedNodes?: Set<string>;
  onSupplierClick?: (supplier: SupplierNode) => void;
}

const RISK_COLORS: Record<string, string> = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#ef4444',
  critical: '#dc2626',
};

const createCustomIcon = (color: string, isFailed: boolean = false) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        width: ${isFailed ? '20px' : '14px'};
        height: ${isFailed ? '20px' : '14px'};
        background-color: ${color};
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: ${isFailed ? '0 0 10px rgba(220, 38, 38, 0.8)' : '0 2px 4px rgba(0,0,0,0.3)'};
      "></div>
    `,
    iconSize: isFailed ? [20, 20] : [14, 14],
    iconAnchor: isFailed ? [10, 10] : [7, 7],
  });
};

export const SupplierMap: React.FC<SupplierMapProps> = ({
  suppliers,
  riskHeatmap = [],
  failedNodes = new Set(),
  onSupplierClick
}) => {
  const [mapCenter, setMapCenter] = useState<[number, number]>([48.7758, 9.1829]);
  const [zoom, setZoom] = useState<number>(3);

  const riskHeatmapMap = new Map<string, RiskHeatmapNode>();
  riskHeatmap.forEach(node => riskHeatmapMap.set(node.node_id, node));

  useEffect(() => {
    const validSuppliers = suppliers.filter(
      s => s.latitude !== null && s.longitude !== null
    );

    if (validSuppliers.length > 0) {
      const avgLat = validSuppliers.reduce((sum, s) => sum + (s.latitude || 0), 0) / validSuppliers.length;
      const avgLon = validSuppliers.reduce((sum, s) => sum + (s.longitude || 0), 0) / validSuppliers.length;
      setMapCenter([avgLat, avgLon]);
    }
  }, [suppliers]);

  const getMarkerColor = (supplier: SupplierNode): string => {
    const riskNode = riskHeatmapMap.get(supplier.id);
    if (failedNodes.has(supplier.id)) {
      return RISK_COLORS.critical;
    }
    if (riskNode) {
      return RISK_COLORS[riskNode.risk_level] || '#3f83f8';
    }
    if (supplier.risk_score > 0.7) {
      return RISK_COLORS.high;
    }
    if (supplier.risk_score > 0.4) {
      return RISK_COLORS.medium;
    }
    return '#3f83f8';
  };

  const validSuppliers = suppliers.filter(
    s => s.latitude !== null && s.longitude !== null
  );

  return (
    <div className="w-full h-full min-h-[400px] rounded-lg overflow-hidden">
      <MapContainer
        center={mapCenter}
        zoom={zoom}
        style={{ height: '100%', width: '100%', minHeight: '400px' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {validSuppliers.map(supplier => {
          const riskNode = riskHeatmapMap.get(supplier.id);
          const isFailed = failedNodes.has(supplier.id);
          const color = getMarkerColor(supplier);
          const riskValue = riskNode?.risk_value || supplier.risk_score;

          return (
            <React.Fragment key={supplier.id}>
              {riskValue > 0.3 && (
                <Circle
                  center={[supplier.latitude!, supplier.longitude!]}
                  radius={Math.max(50000, riskValue * 500000)}
                  pathOptions={{
                    color: color,
                    fillColor: color,
                    fillOpacity: 0.1,
                    weight: 0
                  }}
                />
              )}

              <Marker
                position={[supplier.latitude!, supplier.longitude!]}
                icon={createCustomIcon(color, isFailed)}
                eventHandlers={{
                  click: () => onSupplierClick?.(supplier)
                }}
              >
                <Tooltip>
                  <div className="text-sm">
                    <strong>{supplier.name}</strong>
                    <br />
                    <span className="text-gray-600">Tier: {supplier.tier}</span>
                    <br />
                    <span className="text-gray-600">Category: {supplier.category}</span>
                    <br />
                    <span className="text-gray-600">Country: {supplier.country}</span>
                    <br />
                    <span className="text-gray-600">Risk Score: {supplier.risk_score.toFixed(2)}</span>
                    {isFailed && (
                      <br />
                      <span className="text-red-600 font-semibold">FAILED</span>
                    )}
                  </div>
                </Tooltip>

                <Popup>
                  <div className="min-w-[200px]">
                    <h3 className="font-bold text-lg mb-2">{supplier.name}</h3>
                    <div className="space-y-1 text-sm">
                      <p><span className="font-medium">Tier:</span> {supplier.tier}</p>
                      <p><span className="font-medium">Category:</span> {supplier.category}</p>
                      <p><span className="font-medium">Country:</span> {supplier.country}</p>
                      <p><span className="font-medium">Capacity:</span> {supplier.capacity.toLocaleString()}</p>
                      <p><span className="font-medium">Quality Score:</span> {(supplier.quality_score * 100).toFixed(1)}%</p>
                      <p><span className="font-medium">Risk Score:</span> {(supplier.risk_score * 100).toFixed(1)}%</p>
                      {isFailed && (
                        <p className="text-red-600 font-semibold mt-2">Status: FAILED</p>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default SupplierMap;
