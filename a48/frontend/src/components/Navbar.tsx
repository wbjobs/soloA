import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material';
import BookIcon from '@mui/icons-material/Book';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

const Navbar: React.FC = () => {
  return (
    <AppBar position="static" sx={{ mb: 2 }}>
      <Toolbar>
        <BookIcon sx={{ mr: 2 }} />
        <Typography 
          variant="h6" 
          component={RouterLink} 
          to="/"
          sx={{ 
            flexGrow: 1, 
            textDecoration: 'none', 
            color: 'inherit' 
          }}
        >
          古籍文档智能修复与OCR平台
        </Typography>
        <Box>
          <Button 
            color="inherit" 
            component={RouterLink} 
            to="/documents"
            startIcon={<BookIcon />}
          >
            文档列表
          </Button>
          <Button 
            color="inherit" 
            component={RouterLink} 
            to="/"
            startIcon={<CloudUploadIcon />}
          >
            上传文档
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;
