import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Navbar from './components/Navbar';
import DocumentList from './pages/DocumentList';
import DocumentViewer from './pages/DocumentViewer';
import OCREditor from './pages/OCREditor';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#8B4513',
    },
    secondary: {
      main: '#D2691E',
    },
    background: {
      default: '#F5F5DC',
      paper: '#FFFFFF',
    },
  },
  typography: {
    fontFamily: '"Noto Serif SC", "SimSun", serif',
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Navbar />
        <Routes>
          <Route path="/" element={<DocumentList />} />
          <Route path="/documents" element={<DocumentList />} />
          <Route path="/documents/:id" element={<DocumentViewer />} />
          <Route path="/documents/:id/ocr" element={<OCREditor />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
