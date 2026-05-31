import React from 'react';
import { RecommendationResponse } from '../types';

interface SupplierRecommendationsProps {
  failedSupplierId: string | null;
  recommendations: RecommendationResponse[];
  loading: boolean;
  onSelectRecommendation?: (recommendation: RecommendationResponse) => void;
}

export const SupplierRecommendations: React.FC<SupplierRecommendationsProps> = ({
  failedSupplierId,
  recommendations,
  loading,
  onSelectRecommendation
}) => {
  const getScoreColor = (score: number): string => {
    if (score >= 0.8) return 'bg-green-500';
    if (score >= 0.6) return 'bg-blue-500';
    if (score >= 0.4) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getScoreTextColor = (score: number): string => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.6) return 'text-blue-600';
    if (score >= 0.4) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
          <span className="text-gray-600">Finding alternative suppliers...</span>
        </div>
      </div>
    );
  }

  if (!failedSupplierId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
        <svg
          className="w-16 h-16 text-gray-400 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-gray-500 text-center">
          Select a failed supplier to find alternatives
        </p>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-gray-50 rounded-lg">
        <svg
          className="w-16 h-16 text-orange-400 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <p className="text-gray-600 text-center">
          No alternative suppliers found for <strong>{failedSupplierId}</strong>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">
          Alternative Suppliers for <span className="text-red-600">{failedSupplierId}</span>
        </h3>
        <span className="text-sm text-gray-500">
          {recommendations.length} recommendations found
        </span>
      </div>

      <div className="space-y-3">
        {recommendations.map((rec, index) => (
          <div
            key={rec.id}
            className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => onSelectRecommendation?.(rec)}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                  index === 0 ? 'bg-yellow-500' :
                  index === 1 ? 'bg-gray-400' :
                  index === 2 ? 'bg-amber-700' : 'bg-gray-300'
                }`}>
                  {index + 1}
                </div>
                <div>
                  <h4 className="font-semibold text-gray-800">{rec.name}</h4>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>{rec.category}</span>
                    <span>•</span>
                    <span>Tier {rec.tier}</span>
                    <span>•</span>
                    <span>{rec.country}</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className={`text-2xl font-bold ${getScoreTextColor(rec.weighted_score)}`}>
                  {(rec.weighted_score * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-gray-500">Match Score</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-600">Capacity Match</span>
                  <span className="text-xs font-semibold text-gray-800">
                    {(rec.scores.capacity_match * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${getScoreColor(rec.scores.capacity_match)}`}
                    style={{ width: `${rec.scores.capacity_match * 100}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Capacity: {rec.capacity.toLocaleString()} units
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-600">Distance</span>
                  <span className="text-xs font-semibold text-gray-800">
                    {rec.distance_km.toLocaleString()} km
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${getScoreColor(rec.scores.distance_score)}`}
                    style={{ width: `${rec.scores.distance_score * 100}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Proximity Score: {(rec.scores.distance_score * 100).toFixed(0)}%
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-600">Quality Score</span>
                  <span className="text-xs font-semibold text-gray-800">
                    {(rec.scores.quality_score * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${getScoreColor(rec.scores.quality_score)}`}
                    style={{ width: `${rec.scores.quality_score * 100}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Historical: {(rec.historical_quality * 100).toFixed(0)}%
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SupplierRecommendations;
