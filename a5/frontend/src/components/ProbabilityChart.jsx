import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

function ProbabilityChart({ probabilities }) {
  const labels = Object.keys(probabilities).sort();
  const values = labels.map(label => probabilities[label]);

  const data = {
    labels,
    datasets: [
      {
        label: '概率',
        data: values,
        backgroundColor: values.map((_, index) => {
          const hue = (index / values.length) * 360;
          return `hsla(${hue}, 70%, 60%, 0.8)`;
        }),
        borderColor: values.map((_, index) => {
          const hue = (index / values.length) * 360;
          return `hsla(${hue}, 70%, 50%, 1)`;
        }),
        borderWidth: 2,
        borderRadius: 5,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: true,
        text: '测量概率分布',
        color: '#e4e4e4',
        font: {
          size: 16,
          weight: 'bold',
        },
        padding: {
          top: 10,
          bottom: 20,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#fff',
        bodyColor: '#00d4ff',
        callbacks: {
          label: function(context) {
            const prob = context.raw;
            const percent = (prob * 100).toFixed(2);
            return `概率: ${percent}%`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: '#aaa',
          font: {
            size: 12,
          },
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        title: {
          display: true,
          text: '基态',
          color: '#aaa',
        },
      },
      y: {
        beginAtZero: true,
        max: 1,
        ticks: {
          color: '#aaa',
          callback: function(value) {
            return (value * 100) + '%';
          },
        },
        grid: {
          color: 'rgba(255, 255, 255, 0.1)',
        },
        title: {
          display: true,
          text: '概率',
          color: '#aaa',
        },
      },
    },
  };

  if (!labels || labels.length === 0) {
    return (
      <div style={{ 
        height: '300px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        color: '#888'
      }}>
        请先构建并运行电路以查看概率分布
      </div>
    );
  }

  return (
    <div style={{ height: '300px' }}>
      <Bar data={data} options={options} />
    </div>
  );
}

export default ProbabilityChart;
