const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const externals = {
  'node-opcua': 'commonjs node-opcua',
  'jsmodbus': 'commonjs jsmodbus',
  'better-sqlite3': 'commonjs better-sqlite3',
  'electron-store': 'commonjs electron-store'
};

const mainConfig = {
  entry: './src/main/main.js',
  target: 'electron-main',
  output: {
    path: path.resolve(__dirname, 'dist/main'),
    filename: 'main.js',
    libraryTarget: 'commonjs2'
  },
  externals: externals,
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader'
        }
      }
    ]
  },
  node: {
    __dirname: false,
    __filename: false
  }
};

const rendererConfig = {
  entry: './src/renderer/index.js',
  target: 'electron-renderer',
  output: {
    path: path.resolve(__dirname, 'dist/renderer'),
    filename: 'renderer.js'
  },
  resolve: {
    extensions: ['.js', '.jsx', '.json']
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react']
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/renderer/index.html'
    })
  ]
};

module.exports = [mainConfig, rendererConfig];
