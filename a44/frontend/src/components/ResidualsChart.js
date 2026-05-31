import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Box, Typography } from '@mui/material';

const COLORS = ['#1976d2', '#dc004e', '#4caf50', '#ff9800', '#9c27b0', '#00bcd4', '#f44336'];

const ResidualsChart = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <Box p={2} textAlign="center">
        <Typography color="text.secondary">No residuals data available</Typography>
      </Box>
    );
  }

  const chartData = data.map((entry, index) => ({
    iteration: index + 1,
    time: entry.time,
    ...entry.residuals,
  }));

  const variables = data.length > 0 ? Object.keys(data[0].residuals || {}) : [];

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Residuals
      </Typography>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis
            dataKey="iteration"
            stroke="#aaa"
            label={{ value: 'Iteration', position: 'insideBottom', offset: -5, fill: '#aaa' }}
          />
          <YAxis
            stroke="#aaa"
            domain={['auto', 'auto']}
            scale="log"
            label={{ value: 'Residual', angle: -90, position: 'insideLeft', fill: '#aaa' }}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#132f4c', border: 'none', color: '#fff' }}
          />
          <Legend />
          {variables.map((varName, index) => (
            <Line
              key={varName}
              type="monotone"
              dataKey={varName}
              stroke={COLORS[index % COLORS.length]}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
};

export default ResidualsChart;
